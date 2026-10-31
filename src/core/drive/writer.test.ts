import 'fake-indexeddb/auto'
import * as Y from 'yjs'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '../files/core'
import { MemoryImageStore } from '../images/store'
import { addChild } from '../model/commands'
import { createMapDoc, ensureRoot } from '../model/doc'
import { DriveConflictError, DriveError } from './errors'
import { FakeDrive } from './fakeDrive'
import { packFile, type BlobStores } from './format'
import { DriveRepository } from './repository'
import { classify, describeWriter, markerOf, markerProps } from './sync'

function mapWith(...extra: string[]): Uint8Array {
  const doc = createMapDoc()
  const root = ensureRoot(doc, 'Central Topic')
  for (const t of extra) addChild(doc, root, t)
  return Y.encodeStateAsUpdate(doc.ydoc)
}
const body = (name: string, ...extra: string[]) => packFile({ type: 'map', name, createdAt: 1, modifiedAt: 2, content: mapWith(...extra) })
const bodyOf = (name: string, content: Uint8Array) => packFile({ type: 'map', name, createdAt: 1, modifiedAt: 2, content })

describe('the writer marker', () => {
  const base = { version: '3', modifiedTime: '2026-10-31T05:00:00.000Z', md5: 'm1', revisionId: 'r1', session: 'A', counter: 4 }
  const remote = (o: object) => ({ modifiedTime: base.modifiedTime, md5Checksum: 'm1', headRevisionId: 'r1', ...o })

  it('reads and writes the marker as Drive appProperties (strings only)', () => {
    const props = markerProps({ session: 'S', counter: 7, origin: 'maps.wishtaa.com' })
    expect(props).toEqual({ editorSessionId: 'S', writeCounter: '7', writerOrigin: 'maps.wishtaa.com' })
    expect(markerOf({ appProperties: props })).toEqual({ session: 'S', counter: 7, origin: 'maps.wishtaa.com' })
    expect(markerOf({})).toBeNull()
    expect(markerOf({ appProperties: { editorSessionId: 'S', writeCounter: 'x' } })).toBeNull()
  })

  it('the revision we last wrote is not a change, whatever the clocks or version say', () => {
    expect(classify(base, remote({ modifiedTime: '2099-01-01T00:00:00.000Z' }))).toBe('same')
    expect(classify(base, remote({ modifiedTime: '1999-01-01T00:00:00.000Z' }))).toBe('same')
  })

  it('a newer revision carrying our marker is our own write (for example one whose reply was lost)', () => {
    expect(classify(base, remote({ headRevisionId: 'r2', md5Checksum: 'm2', appProperties: { editorSessionId: 'A', writeCounter: '5' } }))).toBe('ours')
  })

  it('a newer revision with another session, or no marker, is another writer', () => {
    expect(classify(base, remote({ headRevisionId: 'r2', md5Checksum: 'm2', appProperties: { editorSessionId: 'B', writeCounter: '1' } }))).toBe('external')
    expect(classify(base, remote({ headRevisionId: 'r2', md5Checksum: 'm2' }))).toBe('external')
  })

  it('says in plain words who wrote it', () => {
    const here = { session: 'A', origin: 'localhost:5181' }
    expect(describeWriter({ appProperties: markerProps({ session: 'A', counter: 1 }) }, here)).toMatch(/this tab/)
    expect(describeWriter({ appProperties: markerProps({ session: 'B', counter: 1, origin: 'maps.wishtaa.com' }) }, here)).toMatch(/maps\.wishtaa\.com/)
    expect(describeWriter({ appProperties: markerProps({ session: 'B', counter: 1, origin: 'localhost:5181' }) }, here)).toMatch(/another tab/)
    expect(describeWriter({}, here)).toMatch(/outside this app/)
  })
})

describe('saving to Drive', () => {
  let drive: FakeDrive
  let local: RepositoryCore
  let tab: DriveRepository
  let t = 1_700_000_000_000
  let blobs: BlobStores

  const open = (l: RepositoryCore, sessionId: string, origin: string) => new DriveRepository(l, drive, { blobs: () => blobs, sessionId, writerOrigin: origin })

  beforeEach(() => {
    drive = new FakeDrive()
    local = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
    blobs = { images: new MemoryImageStore(), attachments: new MemoryImageStore() }
    tab = open(local, 'tab-A', 'localhost:5181')
  })

  async function driveFile(name = 'Hello') {
    const f = await local.create({ type: 'map', name, content: mapWith('One') })
    return tab.moveToDrive(f.id)
  }

  it('every write sets the writer marker on the Drive file, and the same values are stored locally', async () => {
    const f = await driveFile()
    await tab.saveContent(f.id, mapWith('One', 'Two'))
    const remote = drive.files.get(f.contentRef!)!.meta
    expect(markerOf(remote)).toEqual({ session: 'tab-A', counter: 2, origin: 'localhost:5181' })
    const stored = (await local.get(f.id))!.driveMeta!
    expect(stored).toMatchObject({ session: 'tab-A', counter: 2, revisionId: remote.headRevisionId, md5: remote.md5Checksum })
  })

  it('20 writes in a row never raise a conflict, including overlapping edits and Drive housekeeping between them', async () => {
    const f = await driveFile()
    for (let i = 0; i < 10; i++) {
      await tab.saveContent(f.id, mapWith('One', `Edit ${i}`))
      if (i % 3 === 0) drive.touchMetadata(f.contentRef!)
    }
    const overlapping = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => tab.saveContent(f.id, mapWith('One', `Late ${i}`))))
    expect(overlapping.every((r) => r.status === 'fulfilled')).toBe(true)
    expect(tab.conflicts()).toEqual([])
    expect(drive.calls.filter((c) => c.startsWith('update')).length).toBe(20)
  })

  it('a write by another session is a conflict, and says where it came from', async () => {
    const f = await driveFile()
    drive.editElsewhere(f.contentRef!, await body('Hello', 'Theirs'), markerProps({ session: 'tab-B', counter: 1, origin: 'maps.wishtaa.com' }))
    const err = await tab.saveContent(f.id, mapWith('One', 'Mine')).catch((e) => e)
    expect(err).toBeInstanceOf(DriveConflictError)
    expect(err.message).toMatch(/maps\.wishtaa\.com/)
    expect(tab.conflicts().map((c) => c.fileId)).toEqual([f.id])
    expect(drive.calls.some((c) => c.startsWith('update'))).toBe(false) // nothing was uploaded over theirs
  })

  it('an edit made in Drive itself (no marker) is a conflict too', async () => {
    const f = await driveFile()
    drive.editElsewhere(f.contentRef!, await body('Hello', 'Edited in Drive'))
    await expect(tab.saveContent(f.id, mapWith('One', 'Mine'))).rejects.toBeInstanceOf(DriveConflictError)
  })

  it('a metadata-only Drive bump is not a conflict', async () => {
    const f = await driveFile()
    await tab.saveContent(f.id, mapWith('One', 'A'))
    drive.touchMetadata(f.contentRef!)
    drive.touchMetadata(f.contentRef!)
    await expect(tab.saveContent(f.id, mapWith('One', 'B'))).resolves.toBeTruthy()
    expect(tab.conflicts()).toEqual([])
  })

  it('another writer with IDENTICAL content is adopted silently: no dialog, nothing uploaded', async () => {
    const f = await driveFile()
    const same = mapWith('One', 'Same')
    drive.editElsewhere(f.contentRef!, await bodyOf('Hello', same), markerProps({ session: 'tab-B', counter: 1 }))
    drive.calls.length = 0
    await tab.saveContent(f.id, same)
    expect(tab.conflicts()).toEqual([])
    expect(drive.calls.some((c) => c.startsWith('update'))).toBe(false)
    expect(tab.hasUnsynced(f.id)).toBe(false)
    // and the next save is clean against the adopted revision
    await expect(tab.saveContent(f.id, mapWith('One', 'Same', 'More'))).resolves.toBeTruthy()
  })

  it.each(['mine', 'drive', 'copy'] as const)('after "%s" the conflict is gone for good: ten more saves, with Drive housekeeping, stay quiet', async (choice) => {
    const f = await driveFile()
    drive.editElsewhere(f.contentRef!, await body('Hello', 'Theirs'), markerProps({ session: 'tab-B', counter: 1, origin: 'maps.wishtaa.com' }))
    await tab.saveContent(f.id, mapWith('One', 'Mine')).catch(() => undefined)
    expect(tab.conflicts()).toHaveLength(1)
    await tab.resolveConflict(f.id, choice)
    expect(tab.conflicts()).toEqual([])
    for (let i = 0; i < 10; i++) {
      await tab.saveContent(f.id, mapWith('One', `After ${i}`))
      if (i % 2) drive.touchMetadata(f.contentRef!)
      expect(tab.conflicts()).toEqual([])
    }
  })

  it('"Keep mine" stores our own marker, so the dialog cannot come straight back', async () => {
    const f = await driveFile()
    drive.editElsewhere(f.contentRef!, await body('Hello', 'Theirs'), markerProps({ session: 'tab-B', counter: 1 }))
    await tab.saveContent(f.id, mapWith('One', 'Mine')).catch(() => undefined)
    await tab.resolveConflict(f.id, 'mine')
    const remote = drive.files.get(f.contentRef!)!.meta
    expect(markerOf(remote)?.session).toBe('tab-A')
    expect((await local.get(f.id))!.driveMeta).toMatchObject({ revisionId: remote.headRevisionId, session: 'tab-A' })
  })

  describe('retry', () => {
    it('after a failed save (token expired) the retry fetches Drive afresh and saves with no conflict', async () => {
      const f = await driveFile()
      drive.failNextWith = new DriveError('auth', 'Your Google sign-in expired.', 401)
      await expect(tab.saveContent(f.id, mapWith('One', 'X'))).rejects.toMatchObject({ kind: 'auth' })
      expect(tab.hasUnsynced(f.id)).toBe(true)
      drive.calls.length = 0
      await expect(tab.saveContent(f.id, mapWith('One', 'X'))).resolves.toBeTruthy()
      expect(drive.calls[0]).toBe(`meta ${f.contentRef}`)
      expect(tab.conflicts()).toEqual([])
    })

    it('when the write reached Drive but the reply was lost, the retry sees our own marker and is NOT a conflict', async () => {
      const f = await driveFile()
      drive.loseNextReply = true
      await expect(tab.saveContent(f.id, mapWith('One', 'Lost reply'))).rejects.toBeInstanceOf(DriveError)
      // Drive now holds a newer revision that we never recorded.
      const stale = (await local.get(f.id))!.driveMeta!
      expect(stale.revisionId).not.toBe(drive.files.get(f.contentRef!)!.meta.headRevisionId)
      await expect(tab.saveContent(f.id, mapWith('One', 'Lost reply'))).resolves.toBeTruthy()
      expect(tab.conflicts()).toEqual([])
    })

    it('the failure reason is the real one: offline, quota, sign-in', async () => {
      const f = await driveFile()
      for (const [kind, message] of [
        ['offline', 'No connection to Google Drive.'],
        ['quota', 'Your Google Drive is full.'],
        ['auth', 'Your Google sign-in expired.'],
      ] as const) {
        drive.failNextWith = new DriveError(kind, message)
        await expect(tab.saveContent(f.id, mapWith('One', kind))).rejects.toMatchObject({ kind, message })
      }
    })

    it('offline, then online: the offline edits are sent, with no conflict', async () => {
      const f = await driveFile()
      drive.isOnline = false
      await tab.saveContent(f.id, mapWith('One', 'Offline 1')).catch(() => undefined)
      await tab.saveContent(f.id, mapWith('One', 'Offline 1', 'Offline 2')).catch(() => undefined)
      expect(tab.hasUnsynced(f.id)).toBe(true)
      drive.isOnline = true
      await tab.syncAll()
      expect(tab.hasUnsynced(f.id)).toBe(false)
      expect(tab.conflicts()).toEqual([])
    })
  })

  describe('two tabs and two addresses', () => {
    it('two tabs of one browser saving at the same moment (shared local copy) never conflict with each other', async () => {
      const f = await driveFile()
      const other = open(local, 'tab-B', 'localhost:5181')
      for (let round = 0; round < 5; round++) {
        const out = await Promise.allSettled([tab.saveContent(f.id, mapWith('One', `A${round}`)), other.saveContent(f.id, mapWith('One', `B${round}`))])
        expect(out.every((r) => r.status === 'fulfilled')).toBe(true)
      }
      expect(tab.conflicts()).toEqual([])
      expect(other.conflicts()).toEqual([])
    })

    it('another address (its own local copy) saving the same Drive file IS a conflict, named by address', async () => {
      const f = await driveFile()
      const otherLocal = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
      const live = open(otherLocal, 'tab-L', 'maps.wishtaa.com')
      const copy = await live.openFromDrive(f.contentRef!)
      await live.saveContent(copy.id, mapWith('One', 'From the live site'))
      const err = await tab.saveContent(f.id, mapWith('One', 'From localhost')).catch((e) => e)
      expect(err).toBeInstanceOf(DriveConflictError)
      expect(err.message).toMatch(/maps\.wishtaa\.com/)
    })

    it('opening a Drive file takes Drive\'s latest silently when there are no unsynced edits', async () => {
      const f = await driveFile()
      drive.editElsewhere(f.contentRef!, await body('Hello', 'One', 'Newer elsewhere'), markerProps({ session: 'tab-B', counter: 1 }))
      const bytes = await tab.loadContent(f.id)
      expect(bytes).not.toBeNull()
      expect(tab.conflicts()).toEqual([])
      const doc = createMapDoc()
      Y.applyUpdate(doc.ydoc, bytes as Uint8Array)
      expect([...doc.topics.values()].map((x) => x.text)).toContain('Newer elsewhere')
    })
  })
})
