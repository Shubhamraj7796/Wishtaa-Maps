import 'fake-indexeddb/auto'
import * as Y from 'yjs'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '../files/core'
import { MemoryImageStore } from '../images/store'
import { addChild } from '../model/commands'
import { createMapDoc, ensureRoot } from '../model/doc'
import { DriveAuth } from './auth'
import { FakeDrive } from './fakeDrive'
import type { BlobStores } from './format'
import { DriveRepository } from './repository'

function mapWith(...extra: string[]): Uint8Array {
  const doc = createMapDoc()
  const root = ensureRoot(doc, 'Central Topic')
  for (const t of extra) addChild(doc, root, t)
  return Y.encodeStateAsUpdate(doc.ydoc)
}

describe('sign-out: the Drive list cached in this browser', () => {
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

  const driveFile = async (name: string) => repo.moveToDrive((await local.create({ type: 'map', name, content: mapWith('One') })).id)

  it('removes synced Drive maps from this browser without touching Drive, and keeps guest files', async () => {
    const synced = await driveFile('Synced map')
    const guest = await local.create({ type: 'map', name: 'My guest map', content: mapWith('G') })
    const before = drive.files.size
    expect(await repo.forgetDriveCache()).toEqual({ removed: 1, keptLocal: 0 })
    expect(await local.get(synced.id)).toBeNull()
    expect(await local.get(guest.id)).toMatchObject({ name: 'My guest map', storage: 'local' })
    expect(drive.files.size).toBe(before) // nothing was deleted or trashed in Drive
    expect([...drive.files.values()].some((f) => f.meta.trashed)).toBe(false)
  })

  it('never drops a map whose latest edits were not sent yet: it stays as a file in this browser', async () => {
    const f = await driveFile('Unsent edits')
    drive.isOnline = false
    await expect(repo.saveContent(f.id, mapWith('One', 'Edited offline'))).rejects.toThrow(/No connection/) // saved here first; Drive is unreachable
    const out = await repo.forgetDriveCache()
    expect(out).toEqual({ removed: 0, keptLocal: 1 })
    const kept = await local.get(f.id)
    expect(kept).toMatchObject({ storage: 'local', contentRef: f.id, driveMeta: null })
    expect(await local.loadContent(f.id)).toBeTruthy()
  })
})

describe('sign-out: Google Drive access', () => {
  const memory = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
  }

  it('forget() drops the token and the remembered account but does not revoke Google\'s permission', async () => {
    let revoked = false
    const storage = memory()
    const auth = new DriveAuth({
      clientId: 'client',
      storage,
      loadGis: async () => ({
        initTokenClient: ({ callback }) => ({ requestAccessToken: () => callback({ access_token: 'tok', expires_in: 3600 }) }),
        revoke: () => void (revoked = true),
      }),
    })
    await auth.connect()
    auth.setAccount('someone@gmail.com')
    expect(auth.ready()).toBe(true)
    expect(storage.getItem('wishtaamaps:drive-account')).toContain('someone@gmail.com')

    auth.forget()
    expect(auth.state).toMatchObject({ status: 'disconnected', account: null })
    expect(auth.hasValidToken()).toBe(false)
    expect(storage.getItem('wishtaamaps:drive-account')).toBeNull()
    expect(revoked).toBe(false)
  })
})
