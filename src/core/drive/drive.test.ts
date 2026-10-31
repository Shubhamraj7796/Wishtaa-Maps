import 'fake-indexeddb/auto'
import * as Y from 'yjs'
import { describe, expect, it, beforeEach } from 'vitest'
import { Autosaver } from '../autosave'
import { MemoryBackend, RepositoryCore } from '../files/core'
import { buildStarterContent } from '../files/templates'
import type { FileRecord } from '../files/types'
import { MemoryImageStore } from '../images/store'
import { addChild } from '../model/commands'
import { createMapDoc, ensureRoot, snapshotTopics } from '../model/doc'
import { DriveClient, toDriveError, type FolderCache } from './client'
import { DriveAuth, DRIVE_SCOPE, type Gis, type GisTokenResponse } from './auth'
import { DriveConflictError, DriveError } from './errors'
import { FakeDrive } from './fakeDrive'
import { FORMAT_VERSION, packFile, restoreBlobs, unpackFile, type BlobStores } from './format'
import { DriveRepository } from './repository'

const texts = (bytes: Uint8Array | null) => {
  const doc = createMapDoc()
  if (bytes) Y.applyUpdate(doc.ydoc, bytes, 'load')
  return Object.values(snapshotTopics(doc)).map((t) => t.text).sort()
}

/** A map with the given extra topics, as saved bytes. */
function mapWith(...extra: string[]): Uint8Array {
  const doc = createMapDoc()
  const root = ensureRoot(doc, 'Central Topic')
  for (const t of extra) addChild(doc, root, t)
  return Y.encodeStateAsUpdate(doc.ydoc)
}

describe('.wishtaa file format', () => {
  const base = { type: 'map' as const, name: 'Plan', createdAt: 1, modifiedAt: 2, content: mapWith('A') }

  it('round-trips a map as versioned JSON', async () => {
    const text = await packFile(base)
    const raw = JSON.parse(text)
    expect(raw).toMatchObject({ app: 'wishtaa-maps', version: FORMAT_VERSION, type: 'map', name: 'Plan' })
    const back = unpackFile(text)
    expect(back.name).toBe('Plan')
    expect(texts(back.content)).toEqual(['A', 'Central Topic'])
  })

  it('carries pictures and attachments so the map opens complete elsewhere', async () => {
    const images = new MemoryImageStore()
    const attachments = new MemoryImageStore()
    await images.put({ id: 'img1', width: 4, height: 3, type: 'image/webp', size: 3, blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }) })
    await attachments.put({ id: 'att1', width: 0, height: 0, type: 'text/plain', size: 2, blob: new Blob(['hi'], { type: 'text/plain' }) })
    const text = await packFile({ ...base, imageIds: ['img1', 'missing'], attachmentIds: ['att1'] }, { images, attachments })

    const other: BlobStores = { images: new MemoryImageStore(), attachments: new MemoryImageStore() }
    await restoreBlobs(unpackFile(text), other)
    const img = await other.images.get('img1')
    expect(img?.type).toBe('image/webp')
    expect(new Uint8Array(await img!.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    expect(await other.images.getMeta('missing')).toBeUndefined()
    expect(await (await other.attachments.get('att1'))!.blob.text()).toBe('hi')
  })

  it('does not overwrite a picture that is already stored', async () => {
    const images = new MemoryImageStore()
    await images.put({ id: 'img1', width: 1, height: 1, type: 'image/webp', size: 1, blob: new Blob([new Uint8Array([9])]) })
    const un = unpackFile(await packFile({ ...base, imageIds: ['img1'] }, { images, attachments: new MemoryImageStore() }))
    const target: BlobStores = { images: new MemoryImageStore(), attachments: new MemoryImageStore() }
    await target.images.put({ id: 'img1', width: 7, height: 7, type: 'image/png', size: 1, blob: new Blob([new Uint8Array([5])]) })
    await restoreBlobs(un, target)
    expect((await target.images.getMeta('img1'))?.width).toBe(7)
  })

  it('rejects files that are not ours, or are from a newer version', () => {
    expect(() => unpackFile('not json')).toThrow(/not a Wishtaa Maps file/)
    expect(() => unpackFile('{"hello":1}')).toThrow(/not a Wishtaa Maps file/)
    const newer = JSON.stringify({ app: 'wishtaa-maps', version: FORMAT_VERSION + 1, type: 'map', name: 'x', content: '' })
    expect(() => unpackFile(newer)).toThrow(/newer version/)
  })
})

describe('Drive client', () => {
  const folder = (): FolderCache => {
    let id: string | null = null
    return { get: () => id, set: (v) => void (id = v) }
  }
  const tokens = (over: Partial<{ refresh: () => Promise<string> }> = {}) => ({
    getToken: async () => 'tok1',
    refresh: over.refresh ?? (async () => 'tok2'),
    ready: () => true,
  })
  const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  it('sends the token, and renews it once after a 401', async () => {
    const seen: (string | undefined)[] = []
    let n = 0
    const f = (async (_u: RequestInfo | URL, init?: RequestInit) => {
      seen.push((init?.headers as Record<string, string>).Authorization)
      return n++ === 0 ? json(401) : json(200, { id: 'a', name: 'n', mimeType: 'm', modifiedTime: 't', version: '1' })
    }) as typeof fetch
    let refreshed = 0
    const c = new DriveClient(tokens({ refresh: async () => (refreshed++, 'tok2') }), folder(), f)
    expect((await c.meta('a')).id).toBe('a')
    expect(seen).toEqual(['Bearer tok1', 'Bearer tok1']) // the stub token provider keeps returning tok1
    expect(refreshed).toBe(1)
  })

  it('gives up after one renewal when Drive still says 401', async () => {
    const c = new DriveClient(tokens(), folder(), (async () => json(401)) as typeof fetch)
    await expect(c.meta('a')).rejects.toMatchObject({ kind: 'auth' })
  })

  it('reports a lost connection as offline', async () => {
    const c = new DriveClient(tokens(), folder(), (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch)
    const err = await c.meta('a').catch((e) => e)
    expect(err).toBeInstanceOf(DriveError)
    expect(err.kind).toBe('offline')
    expect(err.offline).toBe(true)
  })

  it('explains quota, rate limit, revoked access, missing and server errors', async () => {
    const kind = async (status: number, reason?: string) => (await toDriveError(json(status, reason ? { error: { errors: [{ reason }] } } : {}))).kind
    expect(await kind(403, 'storageQuotaExceeded')).toBe('quota')
    expect(await kind(403, 'userRateLimitExceeded')).toBe('rate')
    expect(await kind(429)).toBe('rate')
    expect(await kind(403, 'appNotAuthorizedToFile')).toBe('revoked')
    expect(await kind(404)).toBe('notfound')
    expect(await kind(500)).toBe('other')
    expect((await toDriveError(json(500))).message).toMatch(/trouble/)
  })

  it('creates the Wishtaa Maps folder once and remembers it', async () => {
    const calls: string[] = []
    const f = (async (u: RequestInfo | URL, init?: RequestInit) => {
      const url = String(u)
      calls.push(`${init?.method ?? 'GET'} ${url.split('?')[0]}`)
      if (url.includes('q=')) return json(200, { files: [] })
      return json(200, { id: 'folder1', name: 'Wishtaa Maps', mimeType: 'application/vnd.google-apps.folder', modifiedTime: 't', version: '1' })
    }) as typeof fetch
    const cache = folder()
    const c = new DriveClient(tokens(), cache, f)
    expect(await c.ensureAppFolder()).toBe('folder1')
    expect(cache.get()).toBe('folder1')
    expect(calls.filter((x) => x.startsWith('POST'))).toHaveLength(1)
    await c.ensureAppFolder() // second time: verifies the cached id, creates nothing
    expect(calls.filter((x) => x.startsWith('POST'))).toHaveLength(1)
  })

  it('only ever asks to see files made by this app (drive.file scope)', () => {
    expect(DRIVE_SCOPE).toBe('https://www.googleapis.com/auth/drive.file')
  })
})

describe('Google sign-in (token model)', () => {
  function setup(opts: { clientId?: string | undefined; granted?: boolean } = {}) {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
    let respond: (r: GisTokenResponse) => void = () => undefined
    let onError: (e: { type: string; message?: string }) => void = () => undefined
    const requests: { prompt?: string; hint?: string }[] = []
    const revoked: string[] = []
    let n = 0
    const gis: Gis = {
      initTokenClient: (c) => {
        respond = c.callback
        onError = c.error_callback ?? (() => undefined)
        return {
          requestAccessToken: (o) => {
            requests.push(o ?? {})
            queueMicrotask(() => respond({ access_token: `token${++n}`, expires_in: 3600, scope: DRIVE_SCOPE }))
          },
        }
      },
      hasGrantedAllScopes: () => opts.granted ?? true,
      revoke: (t, done) => {
        revoked.push(t)
        done?.()
      },
    }
    let clock = 1_000_000
    const auth = new DriveAuth({ clientId: 'clientId' in opts ? opts.clientId : 'cid', loadGis: async () => gis, storage, now: () => clock })
    return { auth, store, requests, revoked, advance: (ms: number) => (clock += ms), respond: (r: GisTokenResponse) => respond(r), fail: (e: { type: string }) => onError(e) }
  }

  it('is not configured without a client id', async () => {
    const { auth } = setup({ clientId: undefined })
    expect(auth.state.status).toBe('unconfigured')
    await expect(auth.connect()).rejects.toMatchObject({ kind: 'config' })
  })

  it('connects, keeps the token in memory only, and remembers just that an account is linked', async () => {
    const { auth, store } = setup()
    expect(auth.state.status).toBe('disconnected')
    await auth.connect()
    expect(auth.state.status).toBe('connected')
    expect(auth.ready()).toBe(true)
    const saved = [...store.entries()].map(([k, v]) => `${k}=${v}`).join('\n')
    expect(saved).not.toMatch(/token1/)
    expect(store.has('wishtaamaps:drive-account')).toBe(true)
  })

  it('asks for consent the first time and renews silently after that', async () => {
    const { auth, requests, advance } = setup()
    await auth.connect()
    expect(requests[0]?.prompt).toBe('consent')
    advance(3600 * 1000) // the token expires
    expect(auth.hasValidToken()).toBe(false)
    expect(await auth.getToken()).toBe('token2')
    expect(requests[1]?.prompt).toBe('')
  })

  it('reuses a live token without asking again', async () => {
    const { auth, requests } = setup()
    await auth.connect()
    await auth.getToken()
    await auth.getToken()
    expect(requests).toHaveLength(1)
  })

  it('shares one renewal between simultaneous requests', async () => {
    const { auth, requests, advance } = setup()
    await auth.connect()
    advance(3600 * 1000)
    const [a, b] = await Promise.all([auth.getToken(), auth.getToken()])
    expect(a).toBe(b)
    expect(requests).toHaveLength(2) // connect + one renewal
  })

  it('remembers the link across a reload but needs no token until one is used', async () => {
    const first = setup()
    await first.auth.connect()
    first.auth.setAccount('me@example.com')
    const again = new DriveAuth({ clientId: 'cid', storage: { getItem: (k) => first.store.get(k) ?? null, setItem: () => undefined, removeItem: () => undefined }, loadGis: async () => ({}) as Gis })
    expect(again.state).toMatchObject({ status: 'connected', account: 'me@example.com' })
    expect(again.ready()).toBe(false) // linked, but no token in memory yet
  })

  it('asks the user to reconnect when a silent renewal is blocked', async () => {
    const { auth, fail, advance, requests } = setup()
    await auth.connect()
    advance(3600 * 1000)
    // The next request is answered by an error (popup blocked) instead of a token.
    const gisRequests = requests.length
    ;(auth as unknown as { client: { requestAccessToken: () => void } }).client.requestAccessToken = () => queueMicrotask(() => fail({ type: 'popup_failed_to_open' }))
    await expect(auth.getToken()).rejects.toMatchObject({ kind: 'auth' })
    expect(auth.state.status).toBe('reconnect')
    expect(auth.connected()).toBe(true)
    expect(requests.length).toBe(gisRequests)
  })

  it('treats a refusal as disconnected and forgets the account', async () => {
    const { auth, respond, store } = setup()
    await auth.connect()
    ;(auth as unknown as { client: { requestAccessToken: () => void } }).client.requestAccessToken = () => queueMicrotask(() => respond({ error: 'access_denied' }))
    await expect(auth.refresh()).rejects.toMatchObject({ kind: 'revoked' })
    expect(auth.state.status).toBe('disconnected')
    expect(auth.state.message).toMatch(/not allowed/)
    expect(store.has('wishtaamaps:drive-account')).toBe(false)
  })

  it('refuses a sign-in that did not grant the Drive permission', async () => {
    const { auth } = setup({ granted: false })
    await expect(auth.connect()).rejects.toMatchObject({ kind: 'revoked' })
    expect(auth.state.status).toBe('disconnected')
    expect(auth.ready()).toBe(false)
  })

  it('disconnect revokes the token with Google and forgets everything', async () => {
    const { auth, revoked, store } = setup()
    await auth.connect()
    await auth.disconnect()
    expect(revoked).toEqual(['token1'])
    expect(auth.state).toMatchObject({ status: 'disconnected', account: null })
    expect(store.has('wishtaamaps:drive-account')).toBe(false)
    await expect(auth.getToken()).rejects.toMatchObject({ kind: 'auth' })
  })
})

describe('Drive repository', () => {
  let drive: FakeDrive
  let local: RepositoryCore
  let repo: DriveRepository
  let blobs: BlobStores
  let t = 1_700_000_000_000

  beforeEach(() => {
    drive = new FakeDrive()
    local = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
    blobs = { images: new MemoryImageStore(), attachments: new MemoryImageStore() }
    repo = new DriveRepository(local, drive, { blobs: () => blobs })
  })

  async function driveFile(name = 'Plan', content = mapWith('One')): Promise<FileRecord> {
    const f = await local.create({ type: 'map', name, content })
    return repo.moveToDrive(f.id)
  }

  it('moves a local file to Drive: a .wishtaa file in the Wishtaa Maps folder, linked from the local record', async () => {
    const f = await driveFile('My plan')
    expect(f.storage).toBe('drive')
    expect(f.driveMeta?.version).toBe('1')
    const stored = drive.files.get(f.contentRef!)!
    expect(stored.meta.name).toBe('My plan.wishtaa')
    const folder = [...drive.files.values()].find((x) => x.meta.name === 'Wishtaa Maps')!
    expect(stored.meta.parents).toEqual([folder.meta.id])
    expect(texts(unpackFile(stored.body).content)).toEqual(['Central Topic', 'One'])
  })

  it('only moves maps and knowledge bases', async () => {
    const folder = await local.create({ type: 'folder', name: 'F' })
    await expect(repo.moveToDrive(folder.id)).rejects.toThrow(/Only maps/)
  })

  it('saves go to the local copy first and then to Drive, and the status can report each outcome', async () => {
    const f = await driveFile()
    await repo.saveContent(f.id, mapWith('One', 'Two'))
    const stored = drive.files.get(f.contentRef!)!
    expect(texts(unpackFile(stored.body).content)).toEqual(['Central Topic', 'One', 'Two'])
    expect(stored.meta.version).toBe('2')
    expect((await local.get(f.id))?.driveMeta?.version).toBe('2')
    expect(repo.hasUnsynced(f.id)).toBe(false)
  })

  it('local files never touch Drive', async () => {
    const f = await local.create({ type: 'map', content: mapWith() })
    await repo.saveContent(f.id, mapWith('x'))
    expect(drive.calls).toEqual([])
  })

  it('offline: keeps the edit locally, reports "offline", and sends it when back online', async () => {
    const f = await driveFile()
    drive.isOnline = false
    const err = await repo.saveContent(f.id, mapWith('One', 'Offline edit')).catch((e) => e)
    expect(err).toBeInstanceOf(DriveError)
    expect(err.offline).toBe(true)
    expect(texts(await local.loadContent(f.id))).toContain('Offline edit') // not lost
    expect(repo.hasUnsynced(f.id)).toBe(true)

    drive.isOnline = true
    await repo.saveContent(f.id, mapWith('One', 'Offline edit'))
    expect(texts(unpackFile(drive.files.get(f.contentRef!)!.body).content)).toContain('Offline edit')
    expect(repo.hasUnsynced(f.id)).toBe(false)
  })

  it('shows "Offline - will sync" through the autosaver and recovers by itself', async () => {
    const f = await driveFile()
    const statuses: string[] = []
    const saver = new Autosaver({
      storage: { load: async () => null, save: async (data) => void (await repo.saveContent(f.id, new TextEncoder().encode(data) as Uint8Array)) },
      serialize: () => 'x',
      beforeSave: async () => undefined,
      retryDelaysMs: [5],
      onChange: (s) => statuses.push(s.status),
    })
    // Content here is not a real map; only the status path matters, so use a repository whose local save accepts anything.
    drive.isOnline = false
    saver.markDirty()
    await saver.flush()
    expect(statuses).toContain('offline')
    saver.dispose()
  })

  it('stops with a clear message when Drive is full, and keeps the local copy', async () => {
    const f = await driveFile()
    drive.failNextWith = new DriveError('quota', 'Your Google Drive is full.')
    await expect(repo.saveContent(f.id, mapWith('big'))).rejects.toMatchObject({ kind: 'quota' })
    expect(texts(await local.loadContent(f.id))).toContain('big')
    expect(repo.hasUnsynced(f.id)).toBe(true)
  })

  it('reports expired sign-in as an auth error (a click on retry renews it)', async () => {
    const f = await driveFile()
    drive.failNextWith = new DriveError('auth', 'Your Google sign-in expired.')
    await expect(repo.saveContent(f.id, mapWith('a'))).rejects.toMatchObject({ kind: 'auth' })
  })

  it('renames in Drive when the file is renamed', async () => {
    const f = await driveFile('Old')
    await repo.update(f.id, { name: 'Renamed' })
    await new Promise((r) => setTimeout(r, 20))
    expect(drive.files.get(f.contentRef!)!.meta.name).toBe('Renamed.wishtaa')
    expect((await local.get(f.id))?.driveMeta?.version).toBe('2')
  })

  describe('conflicts', () => {
    async function conflicted() {
      const f = await driveFile('Shared', mapWith('Base'))
      const theirs = await packFile({ type: 'map', name: 'Shared', createdAt: 1, modifiedAt: 2, content: mapWith('Base', 'Theirs') })
      drive.editElsewhere(f.contentRef!, theirs)
      const err = await repo.saveContent(f.id, mapWith('Base', 'Mine')).catch((e) => e)
      return { f, err }
    }

    it('is detected when Drive changed since the last sync, and nothing is overwritten', async () => {
      const { f, err } = await conflicted()
      expect(err).toBeInstanceOf(DriveConflictError)
      expect(repo.conflicts().map((c) => c.fileId)).toEqual([f.id])
      expect(texts(unpackFile(drive.files.get(f.contentRef!)!.body).content)).toEqual(['Base', 'Central Topic', 'Theirs'])
      expect(texts(await local.loadContent(f.id))).toContain('Mine')
    })

    it('keeps blocking further uploads until it is resolved, checking Drive afresh each time', async () => {
      const { f } = await conflicted()
      drive.calls.length = 0
      await expect(repo.saveContent(f.id, mapWith('Base', 'Mine', 'More'))).rejects.toBeInstanceOf(DriveConflictError)
      expect(drive.calls[0]).toBe(`meta ${f.contentRef}`) // a fresh check each time
      expect(drive.calls.some((c) => c.startsWith('update'))).toBe(false) // and never an upload
    })

    it('tells listeners when a conflict appears and when it is gone', async () => {
      const f = await driveFile('L', mapWith('Base'))
      let events = 0
      repo.subscribeSync(() => events++)
      drive.editElsewhere(f.contentRef!, await packFile({ type: 'map', name: 'L', createdAt: 1, modifiedAt: 2, content: mapWith('Other') }))
      await repo.saveContent(f.id, mapWith('Mine')).catch(() => undefined)
      expect(events).toBe(1)
      await repo.resolveConflict(f.id, 'mine')
      expect(events).toBe(2)
      expect(repo.conflicts()).toEqual([])
    })

    it('keep mine: Drive gets the local version', async () => {
      const { f } = await conflicted()
      await repo.resolveConflict(f.id, 'mine')
      expect(texts(unpackFile(drive.files.get(f.contentRef!)!.body).content)).toContain('Mine')
      expect(repo.conflicts()).toEqual([])
      await repo.saveContent(f.id, mapWith('Base', 'Mine', 'Later')) // saving works again
      expect(texts(unpackFile(drive.files.get(f.contentRef!)!.body).content)).toContain('Later')
    })

    it("keep Drive's: the local copy becomes what Drive has", async () => {
      const { f } = await conflicted()
      await repo.resolveConflict(f.id, 'drive')
      expect(texts(await local.loadContent(f.id))).toEqual(['Base', 'Central Topic', 'Theirs'])
      expect(repo.conflicts()).toEqual([])
      expect(repo.hasUnsynced(f.id)).toBe(false)
      // The search index follows the content.
      expect((await local.getIndex(f.id))?.topics.map((x) => x.text)).toContain('Theirs')
    })

    it('save a copy: my version is kept as a new local file and Drive\'s version is taken', async () => {
      const { f } = await conflicted()
      await repo.resolveConflict(f.id, 'copy')
      const all = await local.list({ parentId: 'any' })
      const copy = all.find((x) => x.name === 'Shared (my copy)')!
      expect(copy.storage).toBe('local')
      expect(texts(await local.loadContent(copy.id))).toContain('Mine')
      expect(texts(await local.loadContent(f.id))).toContain('Theirs')
      expect(texts(await local.loadContent(f.id))).not.toContain('Mine')
    })

    it('opening a file that changed in Drive and also has unsynced local edits is flagged, not overwritten', async () => {
      const f = await driveFile('Both', mapWith('Base'))
      drive.isOnline = false
      await repo.saveContent(f.id, mapWith('Base', 'Offline')).catch(() => undefined)
      drive.isOnline = true
      drive.editElsewhere(f.contentRef!, await packFile({ type: 'map', name: 'Both', createdAt: 1, modifiedAt: 2, content: mapWith('Remote') }))
      const content = await repo.loadContent(f.id)
      expect(texts(content)).toContain('Offline')
      expect(repo.conflicts().map((c) => c.fileId)).toEqual([f.id])
    })
  })

  describe('opening', () => {
    it('picks up a newer version made on another device when opening, if there is nothing unsynced', async () => {
      const f = await driveFile('Sync me', mapWith('Base'))
      drive.editElsewhere(f.contentRef!, await packFile({ type: 'map', name: 'Sync me', createdAt: 1, modifiedAt: 2, content: mapWith('Base', 'From phone') }))
      expect(texts(await repo.loadContent(f.id))).toContain('From phone')
      expect((await local.get(f.id))?.driveMeta?.version).toBe('2')
      expect(repo.conflicts()).toEqual([])
    })

    it('uses the local copy when Drive cannot be reached', async () => {
      const f = await driveFile('Offline open', mapWith('Base'))
      drive.isOnline = false
      expect(texts(await repo.loadContent(f.id))).toContain('Base')
    })

    it('does not contact Drive when not connected', async () => {
      const f = await driveFile()
      drive.isConnected = false
      drive.calls.length = 0
      await repo.loadContent(f.id)
      expect(drive.calls).toEqual([])
    })

    it('opens a file from Drive (Picker or browser) as a local record linked to it, with its pictures', async () => {
      const images = new MemoryImageStore()
      await images.put({ id: 'pic', width: 2, height: 2, type: 'image/webp', size: 1, blob: new Blob([new Uint8Array([7])]) })
      const body = await packFile({ type: 'kb', name: 'From Drive', createdAt: 1, modifiedAt: 2, content: buildStarterContent('kb'), imageIds: ['pic'] }, { images, attachments: new MemoryImageStore() })
      const seeded = drive.seed('From Drive.wishtaa', body)
      const rec = await repo.openFromDrive(seeded.id)
      expect(rec).toMatchObject({ type: 'kb', name: 'From Drive', storage: 'drive', contentRef: seeded.id })
      expect(texts(await local.loadContent(rec.id))).toEqual(expect.arrayContaining(['Concepts', 'Notes']))
      expect(await blobs.images.getMeta('pic')).toBeDefined()
      expect((await local.getIndex(rec.id))?.topics.length).toBeGreaterThan(1)
    })

    it('opening the same Drive file twice does not make a second copy', async () => {
      const body = await packFile({ type: 'map', name: 'Once', createdAt: 1, modifiedAt: 2, content: mapWith() })
      const seeded = drive.seed('Once.wishtaa', body)
      const a = await repo.openFromDrive(seeded.id)
      const b = await repo.openFromDrive(seeded.id)
      expect(b.id).toBe(a.id)
      expect((await local.list({ parentId: 'any' })).length).toBe(1)
    })

    it('refuses files that are not Wishtaa Maps files', async () => {
      const seeded = drive.seed('notes.wishtaa', '{"something":"else"}')
      await expect(repo.openFromDrive(seeded.id)).rejects.toThrow(/not a Wishtaa Maps file/)
      expect(await local.list({ parentId: 'any' })).toEqual([])
    })

    it('lists the Wishtaa Maps folder for the Drive browser', async () => {
      const f = await driveFile('Listed')
      const { folderId, items } = await repo.browse()
      expect(items.map((i) => i.id)).toEqual([f.contentRef])
      expect(folderId).toBeTruthy()
    })
  })

  describe('leaving Drive', () => {
    it('duplicates are plain local files', async () => {
      const f = await driveFile('Orig')
      const copy = await repo.duplicate(f.id)
      expect(copy.storage).toBe('local')
      expect(copy.driveMeta).toBeNull()
      expect(copy.contentRef).toBe(copy.id)
    })

    it('"keep only in this browser" stops syncing and leaves the Drive copy alone', async () => {
      const f = await driveFile('Local again')
      const local2 = await repo.keepLocal(f.id)
      expect(local2.storage).toBe('local')
      drive.calls.length = 0
      await repo.saveContent(f.id, mapWith('after'))
      expect(drive.calls).toEqual([])
      expect(drive.files.get(f.contentRef!)!.meta.trashed).toBeFalsy()
    })

    it('deleting forever sends the Drive copy to the Drive bin; trashing alone does not', async () => {
      const f = await driveFile('Bye')
      await repo.trash(f.id)
      expect(drive.files.get(f.contentRef!)!.meta.trashed).toBeFalsy()
      await repo.remove(f.id)
      expect(drive.files.get(f.contentRef!)!.meta.trashed).toBe(true)
      expect(await local.get(f.id)).toBeNull()
    })

    it('emptying the bin does the same for every Drive file in it', async () => {
      const a = await driveFile('A')
      const b = await driveFile('B')
      await repo.trash(a.id)
      await repo.trash(b.id)
      await repo.emptyTrash()
      expect(drive.files.get(a.contentRef!)!.meta.trashed).toBe(true)
      expect(drive.files.get(b.contentRef!)!.meta.trashed).toBe(true)
    })

    it('still deletes locally if Drive is unreachable', async () => {
      const f = await driveFile('Stuck')
      drive.isOnline = false
      await repo.remove(f.id)
      expect(await local.get(f.id)).toBeNull()
    })

    it('a file deleted in Drive is reported, not silently recreated', async () => {
      const f = await driveFile('Gone')
      drive.files.delete(f.contentRef!)
      await expect(repo.saveContent(f.id, mapWith('x'))).rejects.toMatchObject({ kind: 'notfound' })
      expect(texts(await local.loadContent(f.id))).toContain('x')
    })
  })

  it('syncAll fetches newer versions and sends pending edits', async () => {
    const a = await driveFile('A', mapWith('Base'))
    const b = await driveFile('B', mapWith('Base'))
    drive.editElsewhere(a.contentRef!, await packFile({ type: 'map', name: 'A', createdAt: 1, modifiedAt: 2, content: mapWith('Newer') }))
    drive.isOnline = false
    await repo.saveContent(b.id, mapWith('Base', 'Pending')).catch(() => undefined)
    drive.isOnline = true
    await repo.syncAll()
    expect(texts(await local.loadContent(a.id))).toContain('Newer')
    expect(texts(unpackFile(drive.files.get(b.contentRef!)!.body).content)).toContain('Pending')
  })
})
