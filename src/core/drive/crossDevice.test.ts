import 'fake-indexeddb/auto'
import * as Y from 'yjs'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '../files/core'
import type { FileRecord } from '../files/types'
import { MemoryImageStore } from '../images/store'
import { addChild, moveTopic, setImage, setText, deleteTopics } from '../model/commands'
import { createMapDoc, ensureRoot, getRootId, snapshotTopics } from '../model/doc'
import type { TopicData } from '../model/topic'
import { FakeDrive } from './fakeDrive'
import { DriveConflictError } from './errors'
import { unpackFile, type BlobStores } from './format'
import { applyDelta, mergeMaps } from './merge'
import { DriveRepository, type RemoteChange } from './repository'
import { MemorySyncStore } from './syncStore'

/**
 * Part A: a Drive map edited on two devices. A laptop and a phone are two repositories with their own local copies, sharing one fake
 * Drive. What the old code did wrong (the phone showed the old map and then overwrote the laptop's newer one) is pinned in the first
 * block; the rest is the merge.
 */
const load = (content: Uint8Array | null) => {
  const doc = createMapDoc()
  if (content) Y.applyUpdate(doc.ydoc, content)
  return doc
}
const encode = (doc: ReturnType<typeof createMapDoc>) => Y.encodeStateAsUpdate(doc.ydoc)
const start = (...extra: string[]) => {
  const doc = createMapDoc()
  const root = ensureRoot(doc, 'Central Topic')
  for (const t of extra) addChild(doc, root, t)
  return encode(doc)
}
/** Changes a map the way an editor would, and returns the new bytes. */
const change = (content: Uint8Array | null, fn: (doc: ReturnType<typeof createMapDoc>, root: string, byText: (t: string) => string) => void) => {
  const doc = load(content)
  const root = getRootId(doc) as string
  fn(doc, root, (t) => Object.values(snapshotTopics(doc)).find((x) => x.text === t)?.id as string)
  return encode(doc)
}
const topicsOf = (content: Uint8Array | null) => Object.values(snapshotTopics(load(content)))
const texts = (content: Uint8Array | null) => topicsOf(content).map((t) => t.text).sort()
const remoteBytes = (drive: FakeDrive, id: string) => unpackFile(drive.files.get(id)?.body ?? '').content

describe('two devices on one Drive map', () => {
  let drive: FakeDrive
  let phoneReady = false
  let laptopLocal: RepositoryCore
  let phoneLocal: RepositoryCore
  let laptop: DriveRepository
  let phone: DriveRepository
  let laptopStore: MemorySyncStore
  let phoneStore: MemorySyncStore
  let t = Date.UTC(2026, 5, 1) // later than the fake Drive's clock, so a device that edits now is the newer unless a test says otherwise
  let phoneEvents: RemoteChange[]

  beforeEach(() => {
    drive = new FakeDrive()
    phoneReady = false
    phoneEvents = []
    const blobs = (): BlobStores => ({ images: new MemoryImageStore(), attachments: new MemoryImageStore() })
    laptopLocal = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
    phoneLocal = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
    laptopStore = new MemorySyncStore()
    phoneStore = new MemorySyncStore()
    laptop = new DriveRepository(laptopLocal, drive, { blobs, sessionId: 'laptop', writerOrigin: 'maps.wishtaa.com', syncStore: laptopStore, now: () => t })
    // A phone that has just loaded the page: signed in, but with no access token in memory yet (it is renewed silently by the first request).
    const phoneApi = new Proxy(drive, { get: (target, prop) => (prop === 'available' ? () => phoneReady && target.available() : typeof (target as never)[prop as never] === 'function' ? ((target as never)[prop as never] as (...a: unknown[]) => unknown).bind(target) : (target as never)[prop as never]) })
    phone = new DriveRepository(phoneLocal, phoneApi as unknown as FakeDrive, { blobs, sessionId: 'phone', writerOrigin: 'maps.wishtaa.com', syncStore: phoneStore, now: () => t })
    phone.onRemoteChange((c) => phoneEvents.push(c))
  })

  /** A map saved from the laptop and opened on the phone. */
  async function shared(content = start('One', 'Two')) {
    const f = await laptopLocal.create({ type: 'map', name: 'Shared map', content })
    const onLaptop = await laptop.moveToDrive(f.id)
    phoneReady = true
    const onPhone = await phone.openFromDrive(onLaptop.contentRef as string)
    await phone.loadContent(onPhone.id) // the phone's first open: it notes what it has as the common starting point
    await laptop.loadContent(onLaptop.id)
    return { onLaptop, onPhone, driveId: onLaptop.contentRef as string }
  }
  const phoneSaves = (f: FileRecord, content: Uint8Array) => phone.saveContent(f.id, content)

  describe('the root cause (what used to go wrong)', () => {
    it('a revision the laptop writes later is not mistaken for the phone’s own write just because the phone’s base came from the laptop', async () => {
      const { onLaptop, onPhone } = await shared()
      expect((await phoneLocal.get(onPhone.id))?.driveMeta?.session).toBe('laptop') // the base carries the laptop's marker
      await laptop.saveContent(onLaptop.id, change(await laptopLocal.loadContent(onLaptop.id), (d, r) => void addChild(d, r, 'Laptop restructured')))
      expect(texts(await phone.loadContent(onPhone.id))).toContain('Laptop restructured')
    })

    it('a stale phone can no longer overwrite the laptop: its save is merged with the newer version', async () => {
      const { onLaptop, onPhone, driveId } = await shared()
      const phoneOpened = await phoneLocal.loadContent(onPhone.id)
      await laptop.saveContent(onLaptop.id, change(await laptopLocal.loadContent(onLaptop.id), (d, r) => void addChild(d, r, 'Laptop restructured')))
      await phoneSaves(onPhone, change(phoneOpened, (d, r) => void addChild(d, r, 'Phone picture topic')))
      expect(texts(remoteBytes(drive, driveId))).toEqual(['Central Topic', 'Laptop restructured', 'One', 'Phone picture topic', 'Two'])
    })
  })

  describe('opening', () => {
    it('always asks Drive first, even on a page with no access token yet, and shows the newest map', async () => {
      const { onLaptop, onPhone } = await shared()
      await laptop.saveContent(onLaptop.id, change(await laptopLocal.loadContent(onLaptop.id), (d, r) => void addChild(d, r, 'Made on the laptop')))
      phoneReady = false
      const calls = drive.calls.length
      expect(texts(await phone.loadContent(onPhone.id))).toContain('Made on the laptop')
      expect(drive.calls.length).toBeGreaterThan(calls)
      expect(phone.syncInfoOf(onPhone.id).state).toBe('latest')
      expect(phone.syncInfoOf(onPhone.id).syncedAt).not.toBeNull()
    })

    it('offline: shows the copy kept here and says it may be out of date', async () => {
      const { onLaptop, onPhone } = await shared()
      await laptop.saveContent(onLaptop.id, change(await laptopLocal.loadContent(onLaptop.id), (d, r) => void addChild(d, r, 'Made on the laptop')))
      drive.isOnline = false
      expect(texts(await phone.loadContent(onPhone.id))).not.toContain('Made on the laptop')
      expect(phone.syncInfoOf(onPhone.id).state).toBe('offline')
    })

    it('a stale open map with no edits of its own is refreshed from Drive', async () => {
      const { onLaptop, onPhone } = await shared()
      await laptop.saveContent(onLaptop.id, change(await laptopLocal.loadContent(onLaptop.id), (d, r) => void addChild(d, r, 'Newer')))
      expect(await phone.checkRemote(onPhone.id)).toBe('updated')
      expect(phoneEvents.map((e) => e.kind)).toEqual(['updated'])
      expect(texts(phoneEvents[0]?.content ?? null)).toContain('Newer')
    })
  })

  describe('while open', () => {
    it('an idle map notices another device’s save when checked (focus, visibility, online, every minute), reading metadata only', async () => {
      const { onLaptop, onPhone } = await shared()
      const before = drive.calls.length
      expect(await phone.checkRemote(onPhone.id)).toBe('same') // nothing changed: one metadata request
      expect(drive.calls.slice(before)).toEqual([`meta ${onLaptop.contentRef}`])
      await laptop.saveContent(onLaptop.id, change(await laptopLocal.loadContent(onLaptop.id), (d, r) => void addChild(d, r, 'Newer')))
      const mark = drive.calls.length
      expect(await phone.checkRemote(onPhone.id)).toBe('updated')
      expect(drive.calls.slice(mark).filter((c) => c.startsWith('download'))).toHaveLength(1)
    })

    it('says "unavailable" and keeps the edit when Drive cannot be reached', async () => {
      const { onPhone } = await shared()
      drive.isOnline = false
      expect(await phone.checkRemote(onPhone.id)).toBe('unavailable')
      expect(phone.syncInfoOf(onPhone.id).state).toBe('offline')
    })
  })

  describe('merging', () => {
    it('the phone adds a picture while the laptop restructures: both survive', async () => {
      const { onLaptop, onPhone, driveId } = await shared()
      const phoneStart = await phoneLocal.loadContent(onPhone.id)
      // Laptop: moves "Two" under "One", renames the root, adds a branch.
      await laptop.saveContent(
        onLaptop.id,
        change(await laptopLocal.loadContent(onLaptop.id), (d, r, by) => {
          moveTopic(d, by('Two'), by('One'))
          setText(d, r, 'Renamed on the laptop')
          addChild(d, by('Two'), 'Laptop leaf')
        })
      )
      // Phone: adds a picture to "One" and a new topic holding another picture.
      await phoneSaves(
        onPhone,
        change(phoneStart, (d, r, by) => {
          setImage(d, by('One'), { imageId: 'pic-phone-1', width: 400, height: 300 })
          const n = addChild(d, r, 'Photo of the board')
          setImage(d, n, { imageId: 'pic-phone-2', width: 800, height: 600 })
        })
      )
      const merged = topicsOf(remoteBytes(drive, driveId))
      const by = (text: string) => merged.find((x) => x.text === text)
      expect(by('One')?.image?.imageId).toBe('pic-phone-1') // the phone's picture
      expect(by('Photo of the board')?.image?.imageId).toBe('pic-phone-2')
      expect(by('Two')?.parentId).toBe(by('One')?.id) // the laptop's move
      expect(by('Laptop leaf')?.parentId).toBe(by('Two')?.id)
      expect(by('Renamed on the laptop')).toBeTruthy()
      // The merge is what both devices now see, and it was told to the screen.
      expect(phoneEvents.at(-1)?.kind).toBe('merged')
      expect(await phoneLocal.get(onPhone.id)).toMatchObject({ imageIds: expect.arrayContaining(['pic-phone-1', 'pic-phone-2']) })
      expect(phone.conflicts()).toEqual([]) // no "Two versions" dialog
    })

    it('edits to different topics, different fields of one topic, deletions and moves all combine', async () => {
      const { onLaptop, onPhone, driveId } = await shared(start('A', 'B', 'C'))
      const phoneStart = await phoneLocal.loadContent(onPhone.id)
      await laptop.saveContent(
        onLaptop.id,
        change(await laptopLocal.loadContent(onLaptop.id), (d, _r, by) => {
          setText(d, by('A'), 'A edited on laptop')
          deleteTopics(d, [by('C')])
        })
      )
      await phoneSaves(
        onPhone,
        change(phoneStart, (d, _r, by) => {
          setText(d, by('B'), 'B edited on phone')
          d.topics.set(by('A'), { ...(d.topics.get(by('A')) as TopicData), collapsed: true }) // another field of the topic the laptop renamed
        })
      )
      const merged = topicsOf(remoteBytes(drive, driveId))
      expect(merged.map((x) => x.text).sort()).toEqual(['A edited on laptop', 'B edited on phone', 'Central Topic'])
      expect(merged.find((x) => x.text === 'A edited on laptop')?.collapsed).toBe(true)
    })

    it('the same field of the same topic changed on both: the newest is kept and the other is recoverable', async () => {
      const { onLaptop, onPhone, driveId } = await shared(start('Dose'))
      const phoneStart = await phoneLocal.loadContent(onPhone.id)
      await laptop.saveContent(onLaptop.id, change(await laptopLocal.loadContent(onLaptop.id), (d, _r, by) => void setText(d, by('Dose'), 'Dose 5 mg (laptop)')))
      t += 60_000 // the phone edits later
      await phoneSaves(onPhone, change(phoneStart, (d, _r, by) => void setText(d, by('Dose'), 'Dose 10 mg (phone)')))
      const merged = texts(remoteBytes(drive, driveId))
      expect(merged).toContain('Dose 10 mg (phone)') // newest
      expect(merged).not.toContain('Dose 5 mg (laptop)')
      const kept = await phone.recoverable(onPhone.id)
      expect(kept).toHaveLength(1)
      expect(kept[0]).toMatchObject({ from: 'remote' })
      expect(kept[0]?.fields.join(' ')).toMatch(/Dose/)
      expect(texts(kept[0]?.content ?? null)).toContain('Dose 5 mg (laptop)')
      // And it can be put back.
      await phone.recoverVersion(onPhone.id, kept[0]?.key as string)
      expect(texts(remoteBytes(drive, driveId))).toContain('Dose 5 mg (laptop)')
    })

    it('when the other device’s change is the newer, it wins and the phone’s text is the recoverable one', async () => {
      const { onLaptop, onPhone, driveId } = await shared(start('Dose'))
      const phoneStart = await phoneLocal.loadContent(onPhone.id)
      drive.isOnline = false
      await phone.saveContent(onPhone.id, change(phoneStart, (d, _r, by) => void setText(d, by('Dose'), 'Dose 10 mg (phone)'))).catch(() => undefined)
      drive.isOnline = true
      ;(drive as unknown as { clock: number }).clock = t + 3_600_000 // Drive's clock is an hour later: the laptop saved after the phone
      await laptop.saveContent(onLaptop.id, change(await laptopLocal.loadContent(onLaptop.id), (d, _r, by) => void setText(d, by('Dose'), 'Dose 5 mg (laptop)')))
      expect(await phone.checkRemote(onPhone.id)).toBe('merged')
      expect(texts(remoteBytes(drive, driveId))).toContain('Dose 5 mg (laptop)')
      const kept = await phone.recoverable(onPhone.id)
      expect(kept[0]).toMatchObject({ from: 'local' })
      expect(texts(kept[0]?.content ?? null)).toContain('Dose 10 mg (phone)')
    })

    it('an offline edit on the phone is merged when it reconnects', async () => {
      const { onLaptop, onPhone, driveId } = await shared()
      const phoneStart = await phoneLocal.loadContent(onPhone.id)
      drive.isOnline = false
      await expect(phoneSaves(onPhone, change(phoneStart, (d, r) => void addChild(d, r, 'Written offline')))).rejects.toThrow()
      expect(phone.hasUnsynced(onPhone.id)).toBe(true)
      drive.isOnline = true
      await laptop.saveContent(onLaptop.id, change(await laptopLocal.loadContent(onLaptop.id), (d, r) => void addChild(d, r, 'Laptop meanwhile')))
      // Back online: the next check (or the automatic retry) merges and sends.
      expect(await phone.checkRemote(onPhone.id)).toBe('merged')
      expect(texts(remoteBytes(drive, driveId))).toEqual(['Central Topic', 'Laptop meanwhile', 'One', 'Two', 'Written offline'])
      expect(phone.hasUnsynced(onPhone.id)).toBe(false)
      expect(phoneEvents.at(-1)?.kind).toBe('merged')
    })

    it('never uploads with an outdated base: if Drive moves on again during the merge, it merges again before uploading', async () => {
      const { onLaptop, onPhone, driveId } = await shared()
      const phoneStart = await phoneLocal.loadContent(onPhone.id)
      await laptop.saveContent(onLaptop.id, change(await laptopLocal.loadContent(onLaptop.id), (d, r) => void addChild(d, r, 'Laptop one')))
      // While the phone is downloading Drive's version to merge, the laptop saves yet again.
      const realDownload = drive.download.bind(drive)
      let once = true
      drive.download = async (id: string) => {
        const body = await realDownload(id)
        if (once) {
          once = false
          await laptop.saveContent(onLaptop.id, change(await laptopLocal.loadContent(onLaptop.id), (d, r) => void addChild(d, r, 'Laptop two')))
        }
        return body
      }
      await phoneSaves(onPhone, change(phoneStart, (d, r) => void addChild(d, r, 'Phone')))
      expect(texts(remoteBytes(drive, driveId))).toEqual(['Central Topic', 'Laptop one', 'Laptop two', 'One', 'Phone', 'Two'])
    })

    it('two devices that both added a topic in the same place keep both, in a stable order', async () => {
      const { onLaptop, onPhone, driveId } = await shared()
      const phoneStart = await phoneLocal.loadContent(onPhone.id)
      await laptop.saveContent(onLaptop.id, change(await laptopLocal.loadContent(onLaptop.id), (d, r) => void addChild(d, r, 'Laptop third')))
      await phoneSaves(onPhone, change(phoneStart, (d, r) => void addChild(d, r, 'Phone third')))
      const merged = topicsOf(remoteBytes(drive, driveId)).filter((x) => x.parentId === getRootId(load(remoteBytes(drive, driveId))))
      expect(new Set(merged.map((x) => x.order)).size).toBe(merged.length)
      expect(merged.map((x) => x.text)).toEqual(expect.arrayContaining(['Laptop third', 'Phone third']))
    })

    it('the two-version dialog is only for what cannot be merged (unreadable content)', async () => {
      const { onLaptop, onPhone, driveId } = await shared()
      const phoneStart = await phoneLocal.loadContent(onPhone.id)
      drive.editElsewhere(driveId, 'this is not a map file at all')
      await expect(phoneSaves(onPhone, change(phoneStart, (d, r) => void addChild(d, r, 'Phone')))).rejects.toBeInstanceOf(DriveConflictError)
      void onLaptop
    })

    it('normal single-device editing never raises the dialog or merges', async () => {
      const { onLaptop } = await shared()
      for (let i = 0; i < 10; i++) {
        await laptop.saveContent(onLaptop.id, change(await laptopLocal.loadContent(onLaptop.id), (d, r) => void addChild(d, r, `Edit ${i}`)))
        drive.touchMetadata(onLaptop.contentRef as string) // Drive's own housekeeping
      }
      expect(laptop.conflicts()).toEqual([])
    })
  })
})

describe('mergeMaps (by topic id)', () => {
  const opts = { localAt: 2000, remoteAt: 1000 }
  it('takes what only one side changed, and a deletion loses to an edit', () => {
    const base = start('A', 'B')
    const local = change(base, (d, _r, by) => void deleteTopics(d, [by('A')]))
    const remote = change(base, (d, _r, by) => void setText(d, by('A'), 'A edited'))
    const res = mergeMaps(base, local, remote, opts)
    expect(texts(res.content)).toEqual(['A edited', 'B', 'Central Topic'])
  })

  it('a topic added under one that the other side deleted is kept, under the central topic', () => {
    const base = start('Parent')
    const local = change(base, (d, _r, by) => void deleteTopics(d, [by('Parent')]))
    const remote = change(base, (d, _r, by) => void addChild(d, by('Parent'), 'Child added elsewhere'))
    const res = mergeMaps(base, local, remote, opts)
    const merged = topicsOf(res.content)
    const child = merged.find((x) => x.text === 'Child added elsewhere')
    expect(child?.parentId).toBe(getRootId(load(res.content)))
  })

  it('two moves that would put each topic inside the other are mended', () => {
    const base = start('X', 'Y')
    const local = change(base, (d, _r, by) => void moveTopic(d, by('X'), by('Y')))
    const remote = change(base, (d, _r, by) => void moveTopic(d, by('Y'), by('X')))
    const res = mergeMaps(base, local, remote, opts)
    const merged = topicsOf(res.content)
    const parentOf = (text: string) => merged.find((x) => x.text === text)?.parentId
    const idOf = (text: string) => merged.find((x) => x.text === text)?.id
    expect(!(parentOf('X') === idOf('Y') && parentOf('Y') === idOf('X'))).toBe(true)
    expect(merged.every((x) => x.parentId === null || merged.some((p) => p.id === x.parentId))).toBe(true)
  })

  it('with no base, both sides are kept (nothing can be seen to be deleted)', () => {
    const common = start()
    const res = mergeMaps(null, change(common, (d, r) => void addChild(d, r, 'Only local')), change(common, (d, r) => void addChild(d, r, 'Only remote')), opts)
    expect(texts(res.content)).toEqual(expect.arrayContaining(['Only local', 'Only remote']))
  })

  it('combines every other kind of data too: settings and PDF markup', () => {
    const base = start('A')
    const local = change(base, (d) => void d.settings.set('layout', 'right'))
    const remote = change(base, (d) => void d.markup.set('m1', { id: 'm1', sourceId: 's', page: 1, kind: 'highlight', color: '#facc15', createdAt: 1 }))
    const res = mergeMaps(base, local, remote, opts)
    const doc = load(res.content)
    expect(doc.settings.get('layout')).toBe('right')
    expect(doc.markup.get('m1')).toBeTruthy()
  })
})

describe('applying a change to the map on screen', () => {
  it('puts the other device’s changes in and leaves what was typed since alone', () => {
    const before = start('A', 'B')
    const after = change(before, (d, _r, by) => {
      setText(d, by('A'), 'A from the other device')
      addChild(d, getRootId(d) as string, 'New from the other device')
    })
    const live = load(before)
    const rootId = getRootId(live) as string
    void rootId
    const b = Object.values(snapshotTopics(live)).find((x) => x.text === 'B')
    setText(live, b?.id as string, 'B typed here meanwhile')
    const n = applyDelta(live, before, after)
    expect(n).toBe(2)
    expect(texts(encode(live))).toEqual(['A from the other device', 'B typed here meanwhile', 'Central Topic', 'New from the other device'])
  })

  it('is not an edit: no undo step', () => {
    const before = start('A')
    const after = change(before, (d, r) => void addChild(d, r, 'X'))
    const live = load(before)
    live.undo.clear()
    applyDelta(live, before, after)
    expect(live.undo.undoStack.length).toBe(0)
  })
})

describe('unrelated maps', () => {
  it('are not merged: different central topics mean a different file, so the person chooses', () => {
    expect(() => mergeMaps(null, start('Mine'), start('Theirs'), { localAt: 1, remoteAt: 2 })).toThrow(/unrelated/)
  })
})
