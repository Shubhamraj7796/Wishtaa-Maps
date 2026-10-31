import 'fake-indexeddb/auto'
import * as Y from 'yjs'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '../files/core'
import { MemoryImageStore } from '../images/store'
import { addChild } from '../model/commands'
import { createMapDoc, ensureRoot, snapshotTopics } from '../model/doc'
import { DriveError } from './errors'
import { FakeDrive } from './fakeDrive'
import { packFile, type BlobStores } from './format'
import { DriveRepository, READ_ONLY_PROP } from './repository'
import { markerProps } from './sync'

function mapWith(...extra: string[]): Uint8Array {
  const doc = createMapDoc()
  const root = ensureRoot(doc, 'Central Topic')
  for (const t of extra) addChild(doc, root, t)
  return Y.encodeStateAsUpdate(doc.ydoc)
}
const textsOf = (bytes: Uint8Array | null) => {
  const doc = createMapDoc()
  if (bytes) Y.applyUpdate(doc.ydoc, bytes, 'load')
  return Object.values(snapshotTopics(doc)).map((t) => t.text)
}

describe('Read mode and Google Drive', () => {
  let drive: FakeDrive
  let local: RepositoryCore
  let repo: DriveRepository
  let t = 1_700_000_000_000

  beforeEach(() => {
    drive = new FakeDrive()
    local = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
    const blobs: BlobStores = { images: new MemoryImageStore(), attachments: new MemoryImageStore() }
    repo = new DriveRepository(local, drive, { blobs: () => blobs, sessionId: 'tab-A', writerOrigin: 'localhost:5181' })
  })

  async function driveFile() {
    const f = await local.create({ type: 'map', name: 'Shared notes', content: mapWith('One') })
    return repo.moveToDrive(f.id)
  }
  const theirs = (...extra: string[]) => packFile({ type: 'map', name: 'Shared notes', createdAt: 1, modifiedAt: 2, content: mapWith(...extra) })

  describe('permission to edit', () => {
    it('a file Drive says we may not edit is view-only', async () => {
      const f = await driveFile()
      expect(await repo.isViewOnly(f.id)).toBe(false)
      drive.files.get(f.contentRef!)!.meta.capabilities = { canEdit: false }
      expect(await repo.isViewOnly(f.id)).toBe(true)
    })

    it('an editor is not view-only, and a local file never is', async () => {
      const f = await driveFile()
      drive.files.get(f.contentRef!)!.meta.capabilities = { canEdit: true }
      expect(await repo.isViewOnly(f.id)).toBe(false)
      const plain = await local.create({ type: 'map', name: 'Local', content: mapWith() })
      expect(await repo.isViewOnly(plain.id)).toBe(false)
    })

    it('a bad connection never locks a file out', async () => {
      const f = await driveFile()
      drive.files.get(f.contentRef!)!.meta.capabilities = { canEdit: false }
      drive.isOnline = false
      expect(await repo.isViewOnly(f.id)).toBe(false)
      drive.isConnected = false
      drive.isOnline = true
      expect(await repo.isViewOnly(f.id)).toBe(false)
    })
  })

  describe('Refresh from Drive', () => {
    it('picks up a change made elsewhere without a conflict, and writes nothing to Drive', async () => {
      const f = await driveFile()
      drive.editElsewhere(f.contentRef!, await theirs('One', 'Added elsewhere'), markerProps({ session: 'tab-B', counter: 1 }))
      drive.calls.length = 0
      expect(await repo.refresh(f.id)).toBe('updated')
      expect(textsOf(await local.loadContent(f.id))).toContain('Added elsewhere')
      expect(repo.conflicts()).toEqual([])
      expect(drive.calls.some((c) => c.startsWith('update') || c.startsWith('create') || c.startsWith('setAppProperties') || c.startsWith('trash'))).toBe(false)
      // and the next check finds nothing new
      expect(await repo.refresh(f.id)).toBe('same')
    })

    it('does nothing when Drive has not changed, and Drive\'s own housekeeping is not a change', async () => {
      const f = await driveFile()
      drive.touchMetadata(f.contentRef!)
      expect(await repo.refresh(f.id)).toBe('same')
      expect(repo.conflicts()).toEqual([])
    })

    it('leaves alone a file with edits that have not reached Drive, and raises no conflict', async () => {
      const f = await driveFile()
      drive.isOnline = false
      await repo.saveContent(f.id, mapWith('One', 'Offline edit')).catch(() => undefined)
      drive.isOnline = true
      drive.editElsewhere(f.contentRef!, await theirs('One', 'Theirs'), markerProps({ session: 'tab-B', counter: 1 }))
      expect(await repo.refresh(f.id)).toBe('skipped')
      expect(textsOf(await local.loadContent(f.id))).toContain('Offline edit')
      expect(repo.conflicts()).toEqual([])
    })

    it('says "skipped" instead of failing when Drive cannot be reached', async () => {
      const f = await driveFile()
      drive.isOnline = false
      expect(await repo.refresh(f.id)).toBe('skipped')
      drive.isOnline = true
      drive.isConnected = false
      expect(await repo.refresh(f.id)).toBe('skipped')
    })

    it('a local file is skipped', async () => {
      const plain = await local.create({ type: 'map', name: 'Local', content: mapWith() })
      expect(await repo.refresh(plain.id)).toBe('skipped')
    })
  })

  describe('"Open in read mode by default" (the lock) for a Drive file', () => {
    it('is stored in the file\'s metadata, not in the map, and mirrored to Drive', async () => {
      const f = await driveFile()
      const before = await local.loadContent(f.id)
      await repo.update(f.id, { readOnlyDefault: true })
      expect((await local.get(f.id))?.readOnlyDefault).toBe(true)
      expect(drive.files.get(f.contentRef!)!.meta.appProperties?.[READ_ONLY_PROP]).toBe('1')
      expect(await local.loadContent(f.id)).toEqual(before) // the map content is untouched
    })

    it('turning it off removes it in Drive too', async () => {
      const f = await driveFile()
      await repo.update(f.id, { readOnlyDefault: true })
      await repo.update(f.id, { readOnlyDefault: false })
      expect(drive.files.get(f.contentRef!)!.meta.appProperties?.[READ_ONLY_PROP]).toBeUndefined()
      expect((await local.get(f.id))?.readOnlyDefault).toBe(false)
    })

    it('changing it is not a content write: no conflict afterwards, and our next save is clean', async () => {
      const f = await driveFile()
      await repo.update(f.id, { readOnlyDefault: true })
      expect(repo.conflicts()).toEqual([])
      await expect(repo.saveContent(f.id, mapWith('One', 'Later edit'))).resolves.toBeTruthy()
      expect(drive.files.get(f.contentRef!)!.meta.appProperties?.[READ_ONLY_PROP]).toBe('1') // a save keeps it
    })

    it('needs Drive to be reachable, and says so, rather than changing only this device', async () => {
      const f = await driveFile()
      drive.isConnected = false
      await expect(repo.update(f.id, { readOnlyDefault: true })).rejects.toMatchObject({ kind: 'auth' } satisfies Partial<DriveError>)
      expect((await local.get(f.id))?.readOnlyDefault).toBeFalsy()
    })

    it('a file protected from another device is protected here when it is opened', async () => {
      const f = await driveFile()
      drive.files.get(f.contentRef!)!.meta.appProperties = { ...drive.files.get(f.contentRef!)!.meta.appProperties, [READ_ONLY_PROP]: '1' }
      await repo.loadContent(f.id)
      expect((await local.get(f.id))?.readOnlyDefault).toBe(true)
    })

    it('a file opened from Drive that is protected there is protected here', async () => {
      const seeded = drive.seed('Protected.wishtaa', await theirs('A'), await drive.ensureAppFolder())
      drive.files.get(seeded.id)!.meta.appProperties = { [READ_ONLY_PROP]: '1' }
      const rec = await repo.openFromDrive(seeded.id)
      expect(rec.readOnlyDefault).toBe(true)
    })

    it('moving a protected local file to Drive keeps the protection there', async () => {
      const f = await local.create({ type: 'map', name: 'Keep safe', content: mapWith('One'), })
      await local.update(f.id, { readOnlyDefault: true })
      const moved = await repo.moveToDrive(f.id)
      expect(drive.files.get(moved.contentRef!)!.meta.appProperties?.[READ_ONLY_PROP]).toBe('1')
    })

    it('a local file keeps it on this device only', async () => {
      const plain = await local.create({ type: 'map', name: 'Local', content: mapWith() })
      await repo.update(plain.id, { readOnlyDefault: true })
      expect((await local.get(plain.id))?.readOnlyDefault).toBe(true)
      expect(drive.calls.some((c) => c.startsWith('setAppProperties'))).toBe(false)
    })
  })
})
