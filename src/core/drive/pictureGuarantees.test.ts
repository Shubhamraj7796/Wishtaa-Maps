import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import * as Y from 'yjs'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '../files/core'
import { MemoryImageStore } from '../images/store'
import { addChild } from '../model/commands'
import { createMapDoc, ensureRoot } from '../model/doc'
import { DriveConflictError } from './errors'
import { FakeDrive } from './fakeDrive'
import { packFile, type BlobStores, unpackFile } from './format'
import { MemoryLedger, NotUploadedYet, PictureFetcher, PictureSync, type PictureSource } from './pictures'
import { DriveRepository } from './repository'
import { sha256Hex } from '../images/sha256'

const mapWith = (...extra: string[]) => {
  const doc = createMapDoc()
  const root = ensureRoot(doc, 'Central Topic')
  for (const t of extra) addChild(doc, root, t)
  return Y.encodeStateAsUpdate(doc.ydoc)
}

/** Deterministic, hard-to-compress bytes standing in for a picture of about `kb` kilobytes. */
const bytesOf = (seed: number, kb: number) => {
  const out = new Uint8Array(kb * 1024)
  let x = seed * 2654435761 + 1
  for (let i = 0; i < out.length; i++) {
    x = (x * 1664525 + 1013904223) >>> 0
    out[i] = x >>> 24
  }
  return out
}
const pictureId = async (seed: number, kb = 60) => 'p-' + (await sha256Hex(bytesOf(seed, kb))).slice(0, 40)

class Rig {
  drive = new FakeDrive()
  local = new RepositoryCore(new MemoryBackend(), (() => {
    let t = 1_700_000_000_000
    return () => (t += 1000)
  })())
  blobs: BlobStores = { images: new MemoryImageStore(), attachments: new MemoryImageStore() }
  ledger = new MemoryLedger()
  mode: 'auto' | 'manual' = 'auto'
  sync = this.newSync()
  repo = this.newRepo(this.sync, 'tab-A')

  newSync(ledger = this.ledger) {
    const source: PictureSource = {
      read: async (id, kind) => {
        const img = await this.blobs.images.get(id)
        if (!img) return null
        if (kind === 'thumb') return { bytes: new Uint8Array(4096).fill(7), type: 'image/webp' }
        return { bytes: new Uint8Array(await img.blob.arrayBuffer()), type: img.type }
      },
    }
    return new PictureSync(this.drive, source, ledger, { concurrency: 3, mode: () => this.mode, sleep: async () => undefined })
  }
  newRepo(sync: PictureSync, session: string) {
    return new DriveRepository(this.local, this.drive, {
      blobs: () => this.blobs,
      sessionId: session,
      writerOrigin: 'localhost:5181',
      pictures: {
        sync,
        refs: async (ids) => {
          const out = []
          for (const id of ids) {
            const m = await this.blobs.images.getMeta(id)
            if (m) out.push(m)
          }
          return out
        },
      },
    })
  }

  async addPicture(seed: number, kb = 60) {
    const bytes = bytesOf(seed, kb)
    const id = await pictureId(seed, kb)
    await this.blobs.images.put({ id, width: 1280, height: 720, type: 'image/webp', size: bytes.byteLength, blob: new Blob([bytes], { type: 'image/webp' }) })
    return id
  }

  async settle() {
    for (let i = 0; i < 20; i++) {
      await this.sync.run({ force: true })
      await new Promise((r) => setTimeout(r, 0))
    }
  }

  /** Counts what is sent to Drive during `fn`. */
  async measure<T>(fn: () => Promise<T>) {
    const before = { ...this.drive.stats }
    await fn()
    const after = this.drive.stats
    return { bytes: after.bytesUploaded - before.bytesUploaded, uploads: after.uploads - before.uploads, copies: after.copies - before.copies, requests: after.requests - before.requests }
  }

  pictureFiles(kind: 'full' | 'thumb' = 'full') {
    return [...this.drive.files.values()].filter((f) => f.meta.appProperties?.pictureKind === kind)
  }
}

let rig: Rig
beforeEach(() => {
  rig = new Rig()
})

/** A map in Drive using `ids`, with all its pictures uploaded. */
async function driveMap(name: string, ids: string[], topics: string[] = ['One'], settle = true) {
  const f = await rig.local.create({ type: 'map', name, content: mapWith(...topics) })
  await rig.local.saveContent(f.id, mapWith(...topics), { imageIds: ids })
  const moved = await rig.repo.moveToDrive(f.id)
  if (settle) await rig.settle()
  else await new Promise((r) => setTimeout(r, 30)) // the queue fills in the background
  return moved
}

describe('pictures are separate Drive files, uploaded once', () => {
  it('the map file lists pictures by id and never contains their bytes', async () => {
    const a = await rig.addPicture(1)
    const f = await driveMap('Plan', [a])
    const file = rig.drive.files.get(f.contentRef!)!
    const un = unpackFile(file.body)
    expect(un.version).toBe(2)
    expect(un.images).toEqual([])
    expect(un.pictureRefs.map((p) => p.id)).toEqual([a])
    expect(file.body.length).toBeLessThan(3000)
    expect(rig.pictureFiles('full')).toHaveLength(1)
    expect(rig.pictureFiles('thumb')).toHaveLength(1)
    // linked by Drive id, not by name
    expect(f.driveMeta?.picturesFolderId).toBeTruthy()
    expect(file.meta.appProperties?.picturesFolderId).toBe(f.driveMeta?.picturesFolderId)
  })

  it('a text edit uploads only the small map file', async () => {
    const f = await driveMap('Plan', [await rig.addPicture(1), await rig.addPicture(2)])
    const sent = await rig.measure(async () => {
      await rig.repo.saveContent(f.id, mapWith('One', 'Edited text'), { imageIds: f.imageIds })
      await rig.settle()
    })
    expect(sent.uploads).toBe(1)
    expect(sent.bytes).toBeLessThan(3000)
    expect(rig.drive.calls.filter((c) => c.startsWith('uploadBinary')).length).toBe(4) // only the first time: 2 pictures + 2 thumbnails
  })

  it('a save that changes nothing uploads nothing', async () => {
    const f = await driveMap('Plan', [await rig.addPicture(1)])
    const same = mapWith('One', 'Same')
    await rig.repo.saveContent(f.id, same, { imageIds: f.imageIds })
    const sent = await rig.measure(async () => {
      await rig.repo.saveContent(f.id, same, { imageIds: f.imageIds })
      await rig.settle()
    })
    expect(sent.uploads).toBe(0)
    expect(sent.bytes).toBe(0)
  })

  it('a picture used in five topics is uploaded once', async () => {
    const a = await rig.addPicture(1)
    const f = await driveMap('Plan', [a, a, a, a, a])
    expect(rig.pictureFiles('full')).toHaveLength(1)
    await rig.repo.saveContent(f.id, mapWith('One', 'x'), { imageIds: [a, a, a, a, a] })
    await rig.settle()
    expect(rig.drive.calls.filter((c) => c.startsWith('uploadBinary')).length).toBe(2) // the picture and its thumbnail, once each
  })

  it('adding one picture uploads that picture (and its thumbnail) and the small map file', async () => {
    const a = await rig.addPicture(1)
    const f = await driveMap('Plan', [a])
    const b = await rig.addPicture(2)
    const sent = await rig.measure(async () => {
      await rig.repo.saveContent(f.id, mapWith('One', 'Two'), { imageIds: [a, b] })
      await rig.settle()
    })
    expect(sent.uploads).toBe(3) // JSON + picture + thumbnail
    expect(sent.bytes).toBeGreaterThan(60 * 1024)
    expect(sent.bytes).toBeLessThan(60 * 1024 + 4096 + 3000)
  })

  it('replacing one picture uploads only the new file; the old one is not touched', async () => {
    const a = await rig.addPicture(1)
    const f = await driveMap('Plan', [a])
    const b = await rig.addPicture(2)
    const sent = await rig.measure(async () => {
      await rig.repo.saveContent(f.id, mapWith('One'), { imageIds: [b] })
      await rig.settle()
    })
    expect(sent.uploads).toBe(3)
    expect(sent.bytes).toBeLessThan(60 * 1024 + 4096 + 3000)
    expect(rig.drive.calls.filter((c) => c.startsWith('delete') || c.startsWith('trash')).length).toBe(0)
  })

  it('moving the picture on screen, undo and redo send nothing', async () => {
    const f = await driveMap('Plan', [await rig.addPicture(1)])
    const content = mapWith('One')
    await rig.repo.saveContent(f.id, content, { imageIds: f.imageIds })
    const sent = await rig.measure(async () => {
      // the same content again (a picture moved and moved back, or an undo and redo)
      await rig.repo.saveContent(f.id, content, { imageIds: f.imageIds })
      await rig.repo.saveContent(f.id, content, { imageIds: f.imageIds })
      await rig.settle()
    })
    expect(sent.uploads).toBe(0)
    expect(rig.drive.calls.filter((c) => c.startsWith('uploadBinary')).length).toBe(2)
  })
})

describe('duplicating uses Drive copies: no picture bytes leave this device', () => {
  it('duplicates a map with 30 pictures by server-side copy', async () => {
    const ids: string[] = []
    for (let i = 0; i < 30; i++) ids.push(await rig.addPicture(i + 1, 8))
    const f = await driveMap('Big', ids)
    let copy
    const sent = await rig.measure(async () => {
      copy = await rig.repo.duplicate(f.id)
    })
    expect(sent.bytes).toBe(0)
    expect(sent.uploads).toBe(0)
    expect(sent.copies).toBe(30 * 2 + 1) // each picture and thumbnail, and the map file
    const rec = copy as unknown as { contentRef: string; driveMeta: { picturesFolderId: string } }
    expect(rec.driveMeta.picturesFolderId).not.toBe(f.driveMeta?.picturesFolderId)
    expect(rig.drive.files.get(rec.contentRef)?.meta.appProperties?.picturesFolderId).toBe(rec.driveMeta.picturesFolderId)
    expect((await rig.drive.listFolder(rec.driveMeta.picturesFolderId)).length).toBe(60)
  })
})

describe('the queue survives interruptions and never blocks the map file', () => {
  it('the map file is saved at once while pictures wait ("Only when I tap Sync")', async () => {
    rig.mode = 'manual'
    const a = await rig.addPicture(1)
    const f = await driveMap('Plan', [a], ['One'], false)
    expect(unpackFile(rig.drive.files.get(f.contentRef!)!.body).pictureRefs).toHaveLength(1)
    expect(rig.pictureFiles()).toHaveLength(0)
    expect(rig.sync.getStatus().pending).toBe(2)
    await rig.sync.syncNow()
    expect(rig.pictureFiles()).toHaveLength(1)
    expect(rig.sync.getStatus().pending).toBe(0)
  })

  it('another device sees "Picture is still uploading" until it arrives', async () => {
    rig.mode = 'manual'
    const a = await rig.addPicture(1)
    const f = await driveMap('Plan', [a], ['One'], false)
    const fetcher = new PictureFetcher(rig.drive, rig.sync)
    await expect(fetcher.fetch(f.driveMeta!.picturesFolderId!, a)).rejects.toBeInstanceOf(NotUploadedYet)
    await rig.sync.syncNow()
    const got = await fetcher.fetch(f.driveMeta!.picturesFolderId!, a)
    expect(got.bytes.byteLength).toBe(60 * 1024)
    expect(got.type).toBe('image/webp')
  })

  it('resumes after a reload: the persisted queue finishes, and what was sent is not sent again', async () => {
    rig.mode = 'manual'
    const ids: string[] = []
    for (let i = 0; i < 6; i++) ids.push(await rig.addPicture(i + 1, 8))
    const f = await driveMap('Plan', ids, ['One'], false)
    // a connection that drops after 5 files
    let sentOk = 0
    const real = rig.drive.uploadBinary.bind(rig.drive)
    rig.drive.uploadBinary = async (input) => {
      if (sentOk++ >= 5) throw new Error('offline')
      return real(input)
    }
    await rig.sync.syncNow()
    expect(rig.pictureFiles('full').length + rig.pictureFiles('thumb').length).toBe(5)
    // "reload": a new queue object over the same stored queue
    rig.drive.uploadBinary = real
    rig.mode = 'auto'
    for (const j of await rig.ledger.jobs()) await rig.ledger.putJob({ ...j, nextAt: 0 }) // the back-off time has passed
    const reborn = rig.newSync()
    await reborn.resumeFromLedger()
    await reborn.run({ force: true })
    expect(rig.pictureFiles('full')).toHaveLength(6)
    expect(rig.pictureFiles('thumb')).toHaveLength(6)
    expect(rig.drive.stats.uploads).toBe(1 + 12) // the map file once and each picture file exactly once
    expect(f.driveMeta?.picturesFolderId).toBeTruthy()
  })

  it('a failed upload is kept in the queue to retry later, and finishes once Drive answers again', async () => {
    rig.mode = 'manual'
    const a = await rig.addPicture(1)
    const f = await driveMap('Plan', [a], ['One'], false)
    const real = rig.drive.uploadBinary.bind(rig.drive)
    rig.drive.uploadBinary = async () => {
      throw new Error('flaky')
    }
    await rig.sync.syncNow()
    expect(rig.sync.getStatus().retrying).toBe(2)
    expect(rig.sync.getStatus().lastError).toBeTruthy()
    expect(rig.pictureFiles()).toHaveLength(0)
    rig.drive.uploadBinary = real
    await rig.sync.uploadAll(f.id, f.driveMeta!.picturesFolderId!, [a])
    expect(rig.pictureFiles()).toHaveLength(1)
  })
})

describe('older files are converted safely', () => {
  /** A map saved by the first version: pictures embedded inside the one Drive file. */
  async function oldDriveMap(ids: string[]) {
    const oldRepo = new DriveRepository(rig.local, rig.drive, { blobs: () => rig.blobs, sessionId: 'tab-A', writerOrigin: 'localhost:5181' })
    const f = await rig.local.create({ type: 'map', name: 'Old', content: mapWith('One') })
    await rig.local.saveContent(f.id, mapWith('One'), { imageIds: ids })
    return oldRepo.moveToDrive(f.id)
  }

  it('pictures reach Drive BEFORE the new file is written; nothing is lost', async () => {
    const ids = [await rig.addPicture(1), await rig.addPicture(2)]
    const f = await oldDriveMap(ids)
    expect(unpackFile(rig.drive.files.get(f.contentRef!)!.body).images).toHaveLength(2) // the old, embedded file
    rig.drive.calls.length = 0
    await rig.repo.saveContent(f.id, mapWith('One', 'Edited'), { imageIds: ids })
    const firstJson = rig.drive.calls.findIndex((c) => c.startsWith('update'))
    const lastPicture = rig.drive.calls.map((c, i) => (c.startsWith('uploadBinary') ? i : -1)).filter((i) => i >= 0).at(-1) ?? -1
    expect(lastPicture).toBeGreaterThanOrEqual(0)
    expect(firstJson).toBeGreaterThan(lastPicture)
    const un = unpackFile(rig.drive.files.get(f.contentRef!)!.body)
    expect(un.version).toBe(2)
    expect(un.pictureRefs.map((p) => p.id).sort()).toEqual([...ids].sort())
    expect(rig.pictureFiles('full')).toHaveLength(2)
  })

  it('if the pictures cannot be sent, the old file is left untouched', async () => {
    const ids = [await rig.addPicture(1)]
    const f = await oldDriveMap(ids)
    const before = rig.drive.files.get(f.contentRef!)!.body
    rig.drive.uploadBinary = async () => {
      throw new Error('offline')
    }
    await expect(rig.repo.saveContent(f.id, mapWith('One', 'Edited'), { imageIds: ids })).rejects.toBeTruthy()
    expect(rig.drive.files.get(f.contentRef!)!.body).toBe(before)
    expect(await rig.blobs.images.getMeta(ids[0]!)).toBeTruthy() // and the picture is still here
  })

  it('opening a v2 file on a device without the pictures keeps them listed when it saves', async () => {
    const a = await rig.addPicture(1)
    const f = await driveMap('Plan', [a])
    const other = new Rig()
    other.drive = rig.drive
    other.sync = other.newSync()
    other.repo = other.newRepo(other.sync, 'tab-B')
    const opened = await other.repo.openFromDrive(f.contentRef!)
    expect(opened.imageIds).toEqual([a])
    expect(await other.blobs.images.getMeta(a)).toBeUndefined() // not downloaded yet
    await other.repo.saveContent(opened.id, mapWith('One', 'Edited elsewhere'), { imageIds: opened.imageIds })
    expect(unpackFile(rig.drive.files.get(f.contentRef!)!.body).pictureRefs.map((p) => p.id)).toEqual([a])
    expect(rig.pictureFiles('full')).toHaveLength(1) // not uploaded again
  })

  it('the IND_AS_2 map converts: 8 pictures move to a folder, the file shrinks, none is lost', async () => {
    const { importEmmx } = await import('@/app/importEmmx')
    const bytes = new Uint8Array(readFileSync('tests/fixtures/IND_AS_2.emmx'))
    const out = await importEmmx(
      { name: 'IND_AS_2.emmx', size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer },
      { repo: rig.local, images: rig.blobs.images, parentId: null, pictures: { pref: 'original', codec: null as never, choose: async () => 'original' } }
    )
    expect(out.error).toBeUndefined()
    const rec = (await rig.local.list({ parentId: null }))[0]!
    expect(rec.imageIds).toHaveLength(8)
    const oldRepo = new DriveRepository(rig.local, rig.drive, { blobs: () => rig.blobs, sessionId: 'tab-A', writerOrigin: 'localhost:5181' })
    const moved = await oldRepo.moveToDrive(rec.id)
    const embedded = rig.drive.files.get(moved.contentRef!)!.body.length
    expect(embedded).toBeGreaterThan(2_000_000) // all 8 pictures inside one file
    const content = (await rig.local.loadContent(rec.id))!
    await rig.repo.saveContent(rec.id, content, { imageIds: rec.imageIds })
    await rig.settle()
    const now = rig.drive.files.get(moved.contentRef!)!.body
    expect(now.length).toBeLessThan(embedded / 50)
    expect(unpackFile(now).pictureRefs).toHaveLength(8)
    expect(rig.pictureFiles('full')).toHaveLength(8)
    for (const id of rec.imageIds!) expect(await rig.blobs.images.getMeta(id)).toBeTruthy()
  })
})

describe('the conflict fix still holds', () => {
  it('10 consecutive edits in one tab never raise the "Two versions" dialog', async () => {
    const f = await driveMap('Plan', [await rig.addPicture(1)])
    const seen: unknown[] = []
    rig.repo.subscribeSync(() => seen.push(rig.repo.conflicts().length))
    for (let i = 0; i < 10; i++) {
      await rig.repo.saveContent(f.id, mapWith('One', `Edit ${i}`), { imageIds: f.imageIds })
      if (i % 3 === 0) rig.drive.touchMetadata(f.contentRef!) // Drive housekeeping between edits
      if (i === 4) await rig.settle()
    }
    expect(rig.repo.conflicts()).toEqual([])
    expect(seen.filter((n) => n !== 0)).toEqual([])
  })

  it('picture uploads do not look like someone else changed the map file', async () => {
    rig.mode = 'manual'
    const f = await driveMap('Plan', [await rig.addPicture(1)])
    await rig.sync.syncNow()
    await expect(rig.repo.saveContent(f.id, mapWith('One', 'After'), { imageIds: f.imageIds })).resolves.toBeTruthy()
  })

  it('a real edit from another tab is still a conflict', async () => {
    const f = await driveMap('Plan', [await rig.addPicture(1)])
    rig.drive.editElsewhere(f.contentRef!, await packFile({ type: 'map', name: 'Plan', createdAt: 1, modifiedAt: 2, content: mapWith('Theirs') }), { editorSessionId: 'tab-B', writeCounter: '1' })
    const err = await rig.repo.saveContent(f.id, mapWith('One', 'Mine'), { imageIds: f.imageIds }).catch((e) => e)
    expect(err).toBeInstanceOf(DriveConflictError)
  })
})
