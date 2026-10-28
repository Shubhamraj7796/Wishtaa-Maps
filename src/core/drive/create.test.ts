import 'fake-indexeddb/auto'
import * as Y from 'yjs'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '../files/core'
import { addChild } from '../model/commands'
import { createMapDoc, ensureRoot, snapshotTopics } from '../model/doc'
import { createHereInstead, createItem, retryCreate, type CreateOutcome, type CreateServices } from './create'
import { DriveError } from './errors'
import { FakeDrive } from './fakeDrive'
import { packFile } from './format'
import { DEFAULT_PREFS, decidePlacement, defaultChoice, effectiveAlways, parsePrefs, type CreateContext, type CreatePrefs } from './placement'
import { DriveRepository } from './repository'

const prefs = (p: Partial<CreatePrefs> = {}): CreatePrefs => ({ ...DEFAULT_PREFS, ...p })
const ctx = (c: Partial<CreateContext> = {}): CreateContext => ({ source: 'home', localFolderId: null, driveFolder: null, ...c })
const folder = { id: 'f1', name: 'Client work' }

describe('default "Save to" choice', () => {
  it('is Drive when connected and nothing was chosen before', () => {
    expect(defaultChoice(prefs(), true)).toBe('drive')
  })
  it('is This browser when Drive is not connected', () => {
    expect(defaultChoice(prefs(), false)).toBe('local')
  })
  it('uses the remembered choice when connected, even if it is This browser', () => {
    expect(defaultChoice(prefs({ last: 'local' }), true)).toBe('local')
    expect(defaultChoice(prefs({ last: 'drive' }), true)).toBe('drive')
  })
  it('falls back to This browser when the remembered choice was Drive but Drive is not connected now', () => {
    expect(defaultChoice(prefs({ last: 'drive' }), false)).toBe('local')
  })
})

describe('remembered preferences', () => {
  it('reads saved values and ignores damaged ones', () => {
    expect(parsePrefs(JSON.stringify({ last: 'drive', always: 'local', driveFolder: folder }))).toEqual({ last: 'drive', always: 'local', driveFolder: folder })
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('not json')).toEqual(DEFAULT_PREFS)
    expect(parsePrefs(JSON.stringify({ last: 'cloud', always: 7, driveFolder: { id: 3 } }))).toEqual(DEFAULT_PREFS)
  })
  it('"always Drive" is ignored while Drive is not connected, "always This browser" always applies', () => {
    expect(effectiveAlways(prefs({ always: 'drive' }), false)).toBeNull()
    expect(effectiveAlways(prefs({ always: 'drive' }), true)).toBe('drive')
    expect(effectiveAlways(prefs({ always: 'local' }), false)).toBe('local')
    expect(effectiveAlways(prefs(), true)).toBeNull()
  })
})

describe('when to ask where to save', () => {
  it('asks from Home, the sidebar, the command palette and the top of All files', () => {
    for (const source of ['home', 'sidebar', 'palette', 'files'] as const) {
      expect(decidePlacement(ctx({ source }), prefs(), true)).toEqual({ ask: true, choice: 'drive', driveFolder: null })
    }
  })
  it('offers the remembered Drive folder as the default location', () => {
    expect(decidePlacement(ctx(), prefs({ driveFolder: folder }), true)).toMatchObject({ ask: true, driveFolder: folder })
  })
  it('creates directly in the folder being viewed on the Google Drive page', () => {
    expect(decidePlacement(ctx({ source: 'drive', driveFolder: folder }), prefs({ always: 'local' }), true)).toEqual({ ask: false, placement: { storage: 'drive', folder } })
    expect(decidePlacement(ctx({ source: 'drive' }), prefs(), true)).toEqual({ ask: false, placement: { storage: 'drive', folder: null } })
  })
  it('creates directly inside a local folder in All files, whatever was remembered', () => {
    expect(decidePlacement(ctx({ source: 'files', localFolderId: 'L1' }), prefs({ last: 'drive', always: 'drive' }), true)).toEqual({ ask: false, placement: { storage: 'local', parentId: 'L1' } })
  })
  it('does not ask when the user said "don\'t ask again"', () => {
    expect(decidePlacement(ctx(), prefs({ always: 'local' }), true)).toEqual({ ask: false, placement: { storage: 'local', parentId: null } })
    expect(decidePlacement(ctx(), prefs({ always: 'drive', driveFolder: folder }), true)).toEqual({ ask: false, placement: { storage: 'drive', folder } })
  })
  it('asks again if "always Drive" was chosen but Drive is not connected, defaulting to This browser', () => {
    expect(decidePlacement(ctx(), prefs({ always: 'drive' }), false)).toEqual({ ask: true, choice: 'local', driveFolder: null })
  })
  it('keeps the current local folder for "This browser" from the sidebar', () => {
    expect(decidePlacement(ctx({ source: 'sidebar', localFolderId: 'L2' }), prefs({ always: 'local' }), true)).toEqual({ ask: false, placement: { storage: 'local', parentId: 'L2' } })
  })
})

describe('creating items', () => {
  let drive: FakeDrive
  let local: RepositoryCore
  let repo: DriveRepository
  let services: CreateServices
  let t = 1_700_000_000_000

  const topicTexts = (body: string) => {
    const un = JSON.parse(body) as { content: string }
    const doc = createMapDoc()
    Y.applyUpdate(doc.ydoc, Uint8Array.from(atob(un.content), (c) => c.charCodeAt(0)), 'load')
    return Object.values(snapshotTopics(doc)).map((x) => x.text).sort()
  }

  beforeEach(() => {
    drive = new FakeDrive()
    local = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
    repo = new DriveRepository(local, drive)
    services = { repo, drive: repo }
  })

  it('creates a local map or knowledge base in the chosen local folder', async () => {
    const f = await local.create({ type: 'folder', name: 'F' })
    const a = await createItem(services, { kind: 'map', placement: { storage: 'local', parentId: f.id } })
    const b = await createItem(services, { kind: 'kb', placement: { storage: 'local', parentId: null } })
    expect(a).toMatchObject({ status: 'created', record: { type: 'map', parentId: f.id, storage: 'local' } })
    expect(b).toMatchObject({ status: 'created', record: { type: 'kb', parentId: null } })
    expect(topicTexts(JSON.stringify({ content: btoa(String.fromCharCode(...(await local.loadContent((b as { record: { id: string } }).record.id))!)) }))).toEqual(expect.arrayContaining(['Concepts', 'Notes']))
    expect(drive.calls).toEqual([])
  })

  it('creates a local folder', async () => {
    const out = await createItem(services, { kind: 'folder', name: 'Projects', placement: { storage: 'local', parentId: null } })
    expect(out).toMatchObject({ status: 'created', record: { type: 'folder', name: 'Projects' } })
  })

  it('creates a file in Drive right away: the .wishtaa file exists, is linked, and the first autosave updates it', async () => {
    const out = await createItem(services, { kind: 'map', placement: { storage: 'drive', folder: null } })
    expect(out.status).toBe('created')
    const rec = (out as { record: { id: string; storage: string; contentRef: string; driveMeta: { version: string } } }).record
    expect(rec.storage).toBe('drive')
    const stored = drive.files.get(rec.contentRef)!
    expect(stored.meta.name).toMatch(/\.wishtaa$/)
    expect(topicTexts(stored.body)).toEqual(['Central Topic'])
    const filesBefore = drive.files.size
    const content = await local.loadContent(rec.id)
    const doc = createMapDoc()
    Y.applyUpdate(doc.ydoc, content!, 'load')
    addChild(doc, ensureRoot(doc), 'First edit')
    await repo.saveContent(rec.id, Y.encodeStateAsUpdate(doc.ydoc))
    expect(drive.files.size).toBe(filesBefore) // updated, not duplicated
    expect(topicTexts(drive.files.get(rec.contentRef)!.body)).toContain('First edit')
  })

  it('puts the Drive file in the folder chosen, or the Wishtaa Maps folder by default', async () => {
    const custom = drive.seed('Client work', '', undefined)
    const a = (await createItem(services, { kind: 'kb', placement: { storage: 'drive', folder: { id: custom.id, name: 'Client work' } } })) as { record: { contentRef: string } }
    expect(drive.files.get(a.record.contentRef)!.meta.parents).toEqual([custom.id])
    const b = (await createItem(services, { kind: 'map', placement: { storage: 'drive', folder: null } })) as { record: { contentRef: string } }
    const app = [...drive.files.values()].find((x) => x.meta.name === 'Wishtaa Maps')!
    expect(drive.files.get(b.record.contentRef)!.meta.parents).toEqual([app.meta.id])
  })

  it('creates a real Drive folder inside the chosen parent (or the Wishtaa Maps folder)', async () => {
    const custom = drive.seed('Parent', '', undefined)
    const a = (await createItem(services, { kind: 'folder', name: 'Sub', placement: { storage: 'drive', folder: { id: custom.id, name: 'Parent' } } })) as Extract<CreateOutcome, { status: 'created' }>
    expect(a.record).toBeNull()
    const made = drive.files.get(a.driveFolder!.id)!
    expect(made.meta).toMatchObject({ name: 'Sub', mimeType: 'application/vnd.google-apps.folder', parents: [custom.id] })
    const b = (await createItem(services, { kind: 'folder', name: 'Top', placement: { storage: 'drive', folder: null } })) as Extract<CreateOutcome, { status: 'created' }>
    const app = [...drive.files.values()].find((x) => x.meta.name === 'Wishtaa Maps')!
    expect(drive.files.get(b.driveFolder!.id)!.meta.parents).toEqual([app.meta.id])
  })

  describe('when Drive fails', () => {
    it('keeps the new map in this browser and reports why (offline)', async () => {
      drive.isOnline = false
      const out = await createItem(services, { kind: 'map', placement: { storage: 'drive', folder: null } })
      expect(out.status).toBe('drive-failed')
      const failed = out as Extract<CreateOutcome, { status: 'drive-failed' }>
      expect(failed.error.kind).toBe('offline')
      expect(failed.record?.storage).toBe('local')
      expect(await local.get(failed.record!.id)).not.toBeNull() // never lost
      expect(await local.loadContent(failed.record!.id)).not.toBeNull()
    })

    it.each([
      ['auth', 'Your Google sign-in expired.'],
      ['quota', 'Your Google Drive is full.'],
    ] as const)('reports %s errors with the message to show', async (kind, message) => {
      drive.failNextWith = new DriveError(kind, message)
      const out = (await createItem(services, { kind: 'kb', placement: { storage: 'drive', folder: null } })) as Extract<CreateOutcome, { status: 'drive-failed' }>
      expect(out.error).toMatchObject({ kind, message })
      expect(out.record).not.toBeNull()
    })

    it('"Retry" uploads the same file (no duplicate in this browser) once Drive works', async () => {
      drive.isOnline = false
      const failed = (await createItem(services, { kind: 'map', placement: { storage: 'drive', folder: null } })) as Extract<CreateOutcome, { status: 'drive-failed' }>
      drive.isOnline = true
      const out = await retryCreate(services, failed)
      expect(out).toMatchObject({ status: 'created', record: { id: failed.record!.id, storage: 'drive' } })
      expect((await local.list({ parentId: 'any' })).length).toBe(1)
    })

    it('"Retry" can fail again and still keeps the file', async () => {
      drive.isOnline = false
      const failed = (await createItem(services, { kind: 'map', placement: { storage: 'drive', folder: null } })) as Extract<CreateOutcome, { status: 'drive-failed' }>
      const again = await retryCreate(services, failed)
      expect(again.status).toBe('drive-failed')
      expect((await local.list({ parentId: 'any' })).length).toBe(1)
    })

    it('"Create in this browser instead" keeps the file already made (and does not make another)', async () => {
      drive.isOnline = false
      const failed = (await createItem(services, { kind: 'map', placement: { storage: 'drive', folder: null } })) as Extract<CreateOutcome, { status: 'drive-failed' }>
      const rec = await createHereInstead(services, failed)
      expect(rec.id).toBe(failed.record!.id)
      expect(rec.storage).toBe('local')
      expect((await local.list({ parentId: 'any' })).length).toBe(1)
    })

    it('a folder that failed in Drive is created in this browser on request, and retried in Drive on request', async () => {
      drive.isOnline = false
      const failed = (await createItem(services, { kind: 'folder', name: 'Docs', placement: { storage: 'drive', folder: null } })) as Extract<CreateOutcome, { status: 'drive-failed' }>
      expect(failed.record).toBeNull()
      expect(await local.list({ parentId: 'any' })).toEqual([])
      const here = await createHereInstead(services, failed)
      expect(here).toMatchObject({ type: 'folder', name: 'Docs', storage: 'local' })
      drive.isOnline = true
      const out = await retryCreate(services, failed)
      expect(out).toMatchObject({ status: 'created', kind: 'folder' })
    })

    it('a remembered folder that no longer exists falls back to the Wishtaa Maps folder on retry', async () => {
      const gone = { id: 'deleted-folder', name: 'Old' }
      const original = drive.create.bind(drive)
      drive.create = async (input) => {
        if (input.parentId === gone.id) throw new DriveError('notfound', 'That file is no longer in Google Drive.', 404)
        return original(input)
      }
      const failed = (await createItem(services, { kind: 'map', placement: { storage: 'drive', folder: gone } })) as Extract<CreateOutcome, { status: 'drive-failed' }>
      expect(failed.error.kind).toBe('notfound')
      const out = (await retryCreate(services, failed)) as Extract<CreateOutcome, { status: 'created' }>
      const app = [...drive.files.values()].find((x) => x.meta.name === 'Wishtaa Maps')!
      expect(drive.files.get((out.record as { contentRef: string }).contentRef)!.meta.parents).toEqual([app.meta.id])
    })
  })

  describe('moving a Drive file to this browser', () => {
    const mapBytes = (...extra: string[]) => {
      const doc = createMapDoc()
      const root = ensureRoot(doc)
      for (const e of extra) addChild(doc, root, e)
      return Y.encodeStateAsUpdate(doc.ydoc)
    }
    const driveFile = async () => {
      const f = await local.create({ type: 'map', name: 'Plan', content: mapBytes('One') })
      return repo.moveToDrive(f.id)
    }
    const names = async () => (await local.list({ parentId: 'any' })).map((f) => f.storage)

    it('makes it a plain local file with the latest content, and sends the Drive copy to the Drive bin', async () => {
      const f = await driveFile()
      drive.editElsewhere(f.contentRef!, await packFile({ type: 'map', name: 'Plan', createdAt: 1, modifiedAt: 2, content: mapBytes('One', 'Newest') }))
      const out = await repo.moveToLocal(f.id)
      expect(out).toMatchObject({ storage: 'local', contentRef: f.id, driveMeta: null })
      const doc = createMapDoc()
      Y.applyUpdate(doc.ydoc, (await local.loadContent(f.id))!, 'load')
      expect(Object.values(snapshotTopics(doc)).map((x) => x.text)).toContain('Newest')
      expect(drive.files.get(f.contentRef!)!.meta.trashed).toBe(true)
      expect(await names()).toEqual(['local'])
    })

    it('later edits stay in this browser and never touch Drive', async () => {
      const f = await driveFile()
      await repo.moveToLocal(f.id)
      drive.calls.length = 0
      await repo.saveContent(f.id, mapBytes('after'))
      expect(drive.calls).toEqual([])
    })

    it('changes nothing when Drive cannot be reached', async () => {
      const f = await driveFile()
      drive.isOnline = false
      await expect(repo.moveToLocal(f.id)).rejects.toMatchObject({ kind: 'offline' })
      expect((await local.get(f.id))?.storage).toBe('drive')
    })

    it('asks to reconnect first when there is no live sign-in', async () => {
      const f = await driveFile()
      drive.isConnected = false
      await expect(repo.moveToLocal(f.id)).rejects.toMatchObject({ kind: 'auth' })
      expect((await local.get(f.id))?.storage).toBe('drive')
    })

    it('refuses while two versions are waiting to be sorted out', async () => {
      const f = await driveFile()
      drive.isOnline = false
      await repo.saveContent(f.id, mapBytes('One', 'Offline')).catch(() => undefined)
      drive.isOnline = true
      drive.editElsewhere(f.contentRef!, await packFile({ type: 'map', name: 'Plan', createdAt: 1, modifiedAt: 2, content: mapBytes('Remote') }))
      await expect(repo.moveToLocal(f.id)).rejects.toMatchObject({ kind: 'conflict' })
      expect((await local.get(f.id))?.storage).toBe('drive')
      expect(drive.files.get(f.contentRef!)!.meta.trashed).toBeFalsy()
    })

    it('still works if the Drive copy was already deleted there', async () => {
      const f = await driveFile()
      drive.files.delete(f.contentRef!)
      expect(await repo.moveToLocal(f.id)).toMatchObject({ storage: 'local' })
    })
  })
})
