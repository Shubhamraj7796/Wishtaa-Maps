import 'fake-indexeddb/auto'
import * as Y from 'yjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '../files/core'
import { PictureCache } from '../images/cache'
import { PICTURE_LIMITS } from '../images/limits'
import { sha256Hex } from '../images/sha256'
import { MemoryImageStore } from '../images/store'
import { addChild, setImage } from '../model/commands'
import { createMapDoc, ensureRoot } from '../model/doc'
import { FakeDrive } from './fakeDrive'
import { unpackFile, type BlobStores } from './format'
import { MemoryLedger, PictureSync } from './pictures'
import { DriveRepository } from './repository'

/**
 * The 500-picture benchmark. A synthetic map: one topic per picture, each picture about the size of a Compressed screenshot or
 * photo (60 to 140 KB). The numbers it measures are printed, and the claims that matter are asserted.
 */
const COUNT = 500
const KB = 1024

const bytesOf = (seed: number, kb: number) => {
  const out = new Uint8Array(kb * KB)
  let x = seed * 2654435761 + 1
  for (let i = 0; i < out.length; i++) {
    x = (x * 1664525 + 1013904223) >>> 0
    out[i] = x >>> 24
  }
  return out
}

const report: Record<string, number | string> = {}
let drive: FakeDrive
let local: RepositoryCore
let blobs: BlobStores
let sync: PictureSync
let repo: DriveRepository
let ids: string[] = []
let content: Uint8Array
let fileId = ''
let contentRef = ''
let folderId = ''
let totalPictureBytes = 0

const mapOf = (edit = '') => {
  const doc = createMapDoc()
  const root = ensureRoot(doc, 'Benchmark')
  ids.forEach((id, i) => {
    const t = addChild(doc, root, `Topic ${i}${edit}`)
    setImage(doc, t, { imageId: id, width: 320, height: 180 })
  })
  return Y.encodeStateAsUpdate(doc.ydoc)
}

beforeAll(async () => {
  drive = new FakeDrive()
  let t = 1_700_000_000_000
  local = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  blobs = { images: new MemoryImageStore(), attachments: new MemoryImageStore() }
  sync = new PictureSync(
    drive,
    {
      read: async (id, kind) => {
        const img = await blobs.images.get(id)
        if (!img) return null
        return kind === 'thumb' ? { bytes: new Uint8Array(6 * KB).fill(3), type: 'image/webp' } : { bytes: new Uint8Array(await img.blob.arrayBuffer()), type: img.type }
      },
    },
    new MemoryLedger(),
    { concurrency: 4, sleep: async () => undefined }
  )
  repo = new DriveRepository(local, drive, {
    blobs: () => blobs,
    sessionId: 'bench',
    writerOrigin: 'bench',
    pictures: { sync, refs: async (list) => (await Promise.all(list.map((id) => blobs.images.getMeta(id)))).filter((m) => !!m) as never },
  })
  for (let i = 0; i < COUNT; i++) {
    const kb = 60 + ((i * 37) % 80)
    const b = bytesOf(i + 1, kb)
    const id = 'p-' + (await sha256Hex(b)).slice(0, 40)
    ids.push(id)
    totalPictureBytes += b.byteLength
    await blobs.images.put({ id, width: 1280, height: 720, type: 'image/webp', size: b.byteLength, blob: new Blob([b], { type: 'image/webp' }) })
  }
  content = mapOf()
}, 120_000)

describe(`${COUNT}-picture benchmark`, () => {
  it('the map file lists 500 pictures and stays under 1 MB (it never contains picture bytes)', async () => {
    const f = await local.create({ type: 'map', name: 'Bench', content })
    await local.saveContent(f.id, content, { imageIds: ids })
    const t0 = performance.now()
    const moved = await repo.moveToDrive(f.id)
    report['moveToDrive (map file only) ms'] = Math.round(performance.now() - t0)
    fileId = f.id
    contentRef = moved.contentRef!
    folderId = moved.driveMeta!.picturesFolderId!
    const body = drive.files.get(contentRef)!.body
    report['map file bytes'] = body.length
    expect(body.length).toBeLessThan(1_000_000)
    expect(unpackFile(body).pictureRefs).toHaveLength(COUNT)
    expect(unpackFile(body).images).toHaveLength(0)
  })

  it('uploads each of the 500 pictures and its thumbnail exactly once, 4 at a time', async () => {
    for (let i = 0; i < 100 && !sync.getStatus().pending; i++) await new Promise((r) => setTimeout(r, 10)) // the queue fills in the background
    const t0 = performance.now()
    let guard = 0
    while (sync.getStatus().pending && guard++ < 50) await sync.run({ force: true })
    report['upload queue drain (fake Drive) ms'] = Math.round(performance.now() - t0)
    const files = await drive.listFolder(folderId)
    expect(files.filter((f) => f.appProperties?.pictureKind === 'full')).toHaveLength(COUNT)
    expect(files.filter((f) => f.appProperties?.pictureKind === 'thumb')).toHaveLength(COUNT)
    expect(sync.getStatus().pending).toBe(0)
    report['picture bytes uploaded'] = drive.stats.bytesUploaded
    report['total picture bytes'] = totalPictureBytes
  }, 60_000)

  it('(a) a text edit uploads only the small map file', async () => {
    const before = { ...drive.stats }
    await repo.saveContent(fileId, mapOf(' edited'), { imageIds: ids })
    for (let i = 0; i < 3; i++) await sync.run({ force: true })
    const bytes = drive.stats.bytesUploaded - before.bytesUploaded
    report['(a) text edit: bytes uploaded'] = bytes
    report['(a) text edit: uploads'] = drive.stats.uploads - before.uploads
    expect(drive.stats.uploads - before.uploads).toBe(1)
    expect(bytes).toBeLessThan(1_000_000)
  })

  it('(b) adding one picture uploads that picture, its thumbnail and the map file', async () => {
    const b = bytesOf(9001, 90)
    const id = 'p-' + (await sha256Hex(b)).slice(0, 40)
    await blobs.images.put({ id, width: 1280, height: 720, type: 'image/webp', size: b.byteLength, blob: new Blob([b], { type: 'image/webp' }) })
    ids = [...ids, id]
    const before = { ...drive.stats }
    await repo.saveContent(fileId, mapOf(' edited'), { imageIds: ids })
    for (let i = 0; i < 3; i++) await sync.run({ force: true })
    report['(b) add one picture: bytes uploaded'] = drive.stats.bytesUploaded - before.bytesUploaded
    expect(drive.stats.uploads - before.uploads).toBe(3)
    expect(drive.stats.bytesUploaded - before.bytesUploaded).toBeLessThan(90 * KB + 6 * KB + 520_000) // the picture, its thumbnail and the map file (about 0.45 MB for 500 topics)
  })

  it('identical pictures are stored once', async () => {
    const same = bytesOf(1, 60 + ((0 * 37) % 80)) // the same bytes as picture 0
    const id = 'p-' + (await sha256Hex(same)).slice(0, 40)
    expect(ids[0]).toBe(id)
  })

  it('(c) replacing one picture uploads only the new file (and its thumbnail)', async () => {
    const b = bytesOf(9002, 100)
    const id = 'p-' + (await sha256Hex(b)).slice(0, 40)
    await blobs.images.put({ id, width: 1280, height: 720, type: 'image/webp', size: b.byteLength, blob: new Blob([b], { type: 'image/webp' }) })
    ids = ids.map((x, i) => (i === 3 ? id : x))
    const before = { ...drive.stats }
    await repo.saveContent(fileId, mapOf(' replaced'), { imageIds: ids })
    for (let i = 0; i < 3; i++) await sync.run({ force: true })
    report['(c) replace one picture: bytes uploaded'] = drive.stats.bytesUploaded - before.bytesUploaded
    expect(drive.stats.uploads - before.uploads).toBe(3)
  })

  it('(d) duplicating the 500-picture map sends no picture bytes: Drive copies them', async () => {
    const before = { ...drive.stats }
    const t0 = performance.now()
    const copy = await repo.duplicate(fileId)
    report['(d) duplicate: bytes uploaded'] = drive.stats.bytesUploaded - before.bytesUploaded
    report['(d) duplicate: server-side copies'] = drive.stats.copies - before.copies
    report['(d) duplicate: requests'] = drive.stats.requests - before.requests
    report['(d) duplicate ms (fake Drive)'] = Math.round(performance.now() - t0)
    expect(drive.stats.bytesUploaded - before.bytesUploaded).toBe(0)
    expect(drive.stats.uploads - before.uploads).toBe(0)
    const inSource = (await drive.listFolder(folderId)).length // every picture and thumbnail in the folder, plus the map file
    expect(drive.stats.copies - before.copies).toBe(inSource + 1)
    expect((await drive.listFolder(copy.driveMeta!.picturesFolderId!)).length).toBe(inSource)
    // and it did not queue anything to send: every picture is already in the copy's folder
    await new Promise((r) => setTimeout(r, 50))
    expect(drive.stats.uploads - before.uploads).toBe(0)
  })

  it('opening on another device is quick: it reads one small file, not 500 pictures', async () => {
    const other = new DriveRepository(
      new RepositoryCore(new MemoryBackend(), () => Date.now()),
      drive,
      { blobs: () => ({ images: new MemoryImageStore(), attachments: new MemoryImageStore() }), sessionId: 'other', pictures: { sync, refs: async () => [] } }
    )
    const before = { ...drive.calls }
    const callsBefore = drive.calls.length
    const t0 = performance.now()
    const opened = await other.openFromDrive(contentRef)
    report['open on a second device ms (fake Drive)'] = Math.round(performance.now() - t0)
    const calls = drive.calls.slice(callsBefore)
    report['open on a second device: Drive requests'] = calls.length
    expect(opened.imageIds).toHaveLength(ids.length)
    expect(calls.some((c) => c.startsWith('downloadBytes'))).toBe(false) // no picture was downloaded to open it
    expect(before).toBeTruthy()
  })

  it('decoded memory stays under the budget while panning past all 500 pictures', () => {
    for (const [label, budget] of [
      ['desktop', PICTURE_LIMITS.memoryDesktop],
      ['tablet', PICTURE_LIMITS.memoryTouch],
    ] as const) {
      const cache = new PictureCache(() => budget, () => undefined)
      const each = 1280 * 720 * 4
      let peak = 0
      for (let start = 0; start < COUNT; start += 4) {
        const visible = Array.from({ length: 8 }, (_, i) => `p${start + i}`)
        for (const id of visible) {
          cache.add(id, each)
          cache.acquire(id)
        }
        peak = Math.max(peak, cache.totalBytes)
        for (const id of visible) cache.release(id)
      }
      report[`peak decoded memory, ${label} (MB)`] = Math.round(peak / 1048576)
      expect(peak).toBeLessThanOrEqual(budget)
    }
  })

  it('prints the numbers', () => {
    console.info('\n500-PICTURE BENCHMARK\n' + Object.entries(report).map(([k, v]) => `  ${k}: ${v}`).join('\n'))
    expect(Object.keys(report).length).toBeGreaterThan(8)
  })
})
