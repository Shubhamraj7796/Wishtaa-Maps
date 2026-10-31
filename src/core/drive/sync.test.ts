import 'fake-indexeddb/auto'
import * as Y from 'yjs'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '../files/core'
import type { DriveMeta } from '../files/types'
import { MemoryImageStore } from '../images/store'
import { addChild } from '../model/commands'
import { createMapDoc, ensureRoot } from '../model/doc'
import { DriveConflictError, DriveError } from './errors'
import { FakeDrive } from './fakeDrive'
import { packFile, type BlobStores } from './format'
import { DriveRepository } from './repository'
import { baseOf, isExternalChange } from './sync'

function mapWith(...extra: string[]): Uint8Array {
  const doc = createMapDoc()
  const root = ensureRoot(doc, 'Central Topic')
  for (const t of extra) addChild(doc, root, t)
  return Y.encodeStateAsUpdate(doc.ydoc)
}

describe('isExternalChange (does a different version in Drive mean someone else edited it?)', () => {
  const base: DriveMeta = { version: '7', modifiedTime: '2026-10-31T05:05:44.408Z', md5: 'aaa', revisionId: 'r1' }
  const same = { modifiedTime: base.modifiedTime, md5Checksum: 'aaa', headRevisionId: 'r1' }

  it('is not a change when nothing was synced yet', () => {
    expect(isExternalChange(null, same)).toBe(false)
    expect(isExternalChange(undefined, same)).toBe(false)
  })
  it('ignores Drive bumping its own version number (the content is identical)', () => {
    expect(isExternalChange(base, same)).toBe(false)
  })
  it('is a change when the revision and the checksum both differ and the marker is not ours', () => {
    expect(isExternalChange(base, { ...same, md5Checksum: 'bbb', headRevisionId: 'r2' })).toBe(true)
  })
  it('uses the checksum over the time: a newer time with identical content is not a change', () => {
    expect(isExternalChange(base, { ...same, modifiedTime: '2026-11-01T00:00:00.000Z' })).toBe(false)
  })
  it('falls back to the revision when there is no checksum', () => {
    const noMd5: DriveMeta = { version: '7', modifiedTime: base.modifiedTime, revisionId: 'r1' }
    expect(isExternalChange(noMd5, { modifiedTime: base.modifiedTime, headRevisionId: 'r1' })).toBe(false)
    expect(isExternalChange(noMd5, { modifiedTime: base.modifiedTime, headRevisionId: 'r2' })).toBe(true)
  })
  it('falls back to the modified time for a base saved before checksums were recorded', () => {
    const old: DriveMeta = { version: '7', modifiedTime: base.modifiedTime }
    expect(isExternalChange(old, { modifiedTime: base.modifiedTime })).toBe(false)
    expect(isExternalChange(old, { modifiedTime: '2026-10-31T05:05:45.000Z' })).toBe(true)
    expect(isExternalChange(old, { modifiedTime: '2026-10-30T05:05:45.000Z' })).toBe(false)
  })
  it('asks rather than overwrites when the times cannot be read', () => {
    expect(isExternalChange({ version: '1', modifiedTime: 'nonsense' }, { modifiedTime: 'also nonsense' })).toBe(true)
  })
  it('baseOf keeps the content identity', () => {
    expect(baseOf({ version: '2', modifiedTime: 't', md5Checksum: 'm', headRevisionId: 'r' })).toEqual({ version: '2', modifiedTime: 't', md5: 'm', revisionId: 'r' })
    expect(baseOf({ version: '2', modifiedTime: 't' })).toEqual({ version: '2', modifiedTime: 't' })
  })
})

describe('saving a Drive map over and over', () => {
  let drive: FakeDrive
  let local: RepositoryCore
  let repo: DriveRepository
  let t = 1_700_000_000_000

  beforeEach(() => {
    drive = new FakeDrive()
    local = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
    const blobs: BlobStores = { images: new MemoryImageStore(), attachments: new MemoryImageStore() }
    repo = new DriveRepository(local, drive, { blobs: () => blobs })
  })

  async function driveFile(name = 'IND AS 2') {
    const f = await local.create({ type: 'map', name, content: mapWith('One') })
    return repo.moveToDrive(f.id)
  }
  const theirs = (name: string, ...extra: string[]) => packFile({ type: 'map', name, createdAt: 1, modifiedAt: 2, content: mapWith(...extra) })

  it('records the base from Drive, content identity included', async () => {
    const f = await driveFile()
    const remote = drive.files.get(f.contentRef!)!.meta
    expect(f.driveMeta).toMatchObject({ version: remote.version, modifiedTime: remote.modifiedTime, md5: remote.md5Checksum, revisionId: remote.headRevisionId, counter: 1 })
    expect(f.driveMeta?.session).toBe(repo.session)
  })

  it('five edits in a row save every time, with no conflict (the reported bug)', async () => {
    const f = await driveFile()
    for (let i = 1; i <= 5; i++) {
      await repo.saveContent(f.id, mapWith('One', `Edit ${i}`))
      drive.touchMetadata(f.contentRef!) // Drive bumps its version after our write, as it does for real
      expect(repo.conflicts()).toEqual([])
    }
    expect((await local.get(f.id))?.driveMeta?.md5).toBe(drive.files.get(f.contentRef!)!.meta.md5Checksum)
  })

  it('a housekeeping version bump between saves is not a conflict', async () => {
    const f = await driveFile()
    drive.touchMetadata(f.contentRef!)
    drive.touchMetadata(f.contentRef!)
    await expect(repo.saveContent(f.id, mapWith('One', 'Two'))).resolves.toBeTruthy()
    expect(repo.conflicts()).toEqual([])
  })

  it('a real edit elsewhere is still a conflict, even if Drive also bumped its version', async () => {
    const f = await driveFile()
    drive.editElsewhere(f.contentRef!, await theirs('IND AS 2', 'Theirs'))
    drive.touchMetadata(f.contentRef!)
    await expect(repo.saveContent(f.id, mapWith('One', 'Mine'))).rejects.toBeInstanceOf(DriveConflictError)
    expect(repo.conflicts().map((c) => c.fileId)).toEqual([f.id])
  })

  it('overlapping saves run one after the other, each using the base the previous one stored', async () => {
    const f = await driveFile()
    const results = await Promise.allSettled([
      repo.saveContent(f.id, mapWith('One', 'A')),
      repo.saveContent(f.id, mapWith('One', 'A', 'B')),
      repo.saveContent(f.id, mapWith('One', 'A', 'B', 'C')),
    ])
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled'])
    expect(repo.conflicts()).toEqual([])
    const updates = drive.calls.filter((c) => c.startsWith('update')).length
    expect(updates).toBe(3)
  })

  it('a failed save is retried with a fresh check and then succeeds without a false conflict', async () => {
    const f = await driveFile()
    drive.failNextWith = new DriveError('auth', 'Your Google sign-in expired.', 401)
    await expect(repo.saveContent(f.id, mapWith('One', 'X'))).rejects.toBeInstanceOf(DriveError)
    expect(repo.hasUnsynced(f.id)).toBe(true)
    drive.touchMetadata(f.contentRef!)
    await expect(repo.saveContent(f.id, mapWith('One', 'X'))).resolves.toBeTruthy()
    expect(repo.conflicts()).toEqual([])
    expect(repo.hasUnsynced(f.id)).toBe(false)
  })

  it('a conflict raised earlier is dropped when the next fresh check shows Drive still has our content', async () => {
    const f = await driveFile()
    drive.editElsewhere(f.contentRef!, await theirs('IND AS 2', 'Theirs'))
    await repo.saveContent(f.id, mapWith('One', 'Mine')).catch(() => undefined)
    expect(repo.conflicts()).toHaveLength(1)
    // Our base turns out to have been stale: once it matches what Drive has, the old conflict is void.
    await local.update(f.id, { driveMeta: baseOf(drive.files.get(f.contentRef!)!.meta) })
    await repo.saveContent(f.id, mapWith('One', 'Mine'))
    expect(repo.conflicts()).toEqual([])
  })

  describe('the base after resolving a conflict', () => {
    async function conflicted() {
      const f = await driveFile('Shared')
      drive.editElsewhere(f.contentRef!, await theirs('Shared', 'Theirs'))
      await repo.saveContent(f.id, mapWith('One', 'Mine')).catch(() => undefined)
      return f
    }
    const baseMatchesDrive = async (id: string, ref: string) => {
      const meta = drive.files.get(ref)!.meta
      const base = (await local.get(id))?.driveMeta
      expect(base?.md5).toBe(meta.md5Checksum)
      expect(base?.revisionId).toBe(meta.headRevisionId)
      expect(base?.modifiedTime).toBe(meta.modifiedTime)
    }

    it('keep mine writes, then the next save is clean', async () => {
      const f = await conflicted()
      await repo.resolveConflict(f.id, 'mine')
      await baseMatchesDrive(f.id, f.contentRef!)
      drive.touchMetadata(f.contentRef!)
      await repo.saveContent(f.id, mapWith('One', 'Mine', 'Later'))
      expect(repo.conflicts()).toEqual([])
    })
    it("keep Drive's resets the base to Drive's version", async () => {
      const f = await conflicted()
      await repo.resolveConflict(f.id, 'drive')
      await baseMatchesDrive(f.id, f.contentRef!)
      await repo.saveContent(f.id, mapWith('One', 'Theirs', 'More'))
      expect(repo.conflicts()).toEqual([])
    })
    it('save a copy resets the base too', async () => {
      const f = await conflicted()
      await repo.resolveConflict(f.id, 'copy')
      await baseMatchesDrive(f.id, f.contentRef!)
      await repo.saveContent(f.id, mapWith('One', 'Theirs', 'Again'))
      expect(repo.conflicts()).toEqual([])
    })
  })

  it('opening a file whose only change is Drive housekeeping does not pull or flag anything', async () => {
    const f = await driveFile()
    drive.touchMetadata(f.contentRef!)
    drive.calls.length = 0
    await repo.loadContent(f.id)
    expect(drive.calls.some((c) => c.startsWith('download'))).toBe(false)
    expect(repo.conflicts()).toEqual([])
  })
})
