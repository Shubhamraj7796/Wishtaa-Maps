import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { unzipSync } from 'fflate'
import * as Y from 'yjs'
import { beforeEach, describe, expect, it } from 'vitest'
import { DriveError } from '@/core/drive/errors'
import { FakeDrive } from '@/core/drive/fakeDrive'
import { unpackFile, type BlobStores } from '@/core/drive/format'
import { DriveRepository } from '@/core/drive/repository'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { MemoryImageStore } from '@/core/images/store'
import { createMapDoc, snapshotTopics } from '@/core/model/doc'
import { addChild } from '@/core/model/commands'
import { sha256Hex } from '@/core/import/emmx/images'
import { basicShapes, png, rels, simple } from '@/core/import/emmx/testkit'
import { importToPlacement, retryDriveUpload, type DriveSender, type ImportOutcome, type PickedFile } from './importEmmx'

const asFile = (name: string, bytes: Uint8Array): PickedFile => ({ name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer })
const FIXTURE_BYTES = () => new Uint8Array(readFileSync('tests/fixtures/IND_AS_2.emmx'))
const sample = () => asFile('IND_AS_2.emmx', FIXTURE_BYTES())

let drive: FakeDrive
let local: RepositoryCore
let repo: DriveRepository
let images: MemoryImageStore
let blobs: BlobStores
let t = 1_700_000_000_000

beforeEach(() => {
  drive = new FakeDrive()
  local = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  images = new MemoryImageStore()
  blobs = { images, attachments: new MemoryImageStore() }
  repo = new DriveRepository(local, drive, { blobs: () => blobs })
})

const deps = () => ({ repo, images })
const driveFiles = () => [...drive.files.values()].filter((f) => f.meta.name.endsWith('.wishtaa'))
const appFolder = () => [...drive.files.values()].find((f) => f.meta.name === 'Wishtaa Maps')?.meta.id
const topicTexts = (body: string) => {
  const d = createMapDoc()
  Y.applyUpdate(d.ydoc, unpackFile(body).content, 'load')
  return Object.values(snapshotTopics(d)).map((x) => x.text)
}

describe('This browser', () => {
  it('imports to this browser, in the chosen folder, without touching Drive', async () => {
    const folder = await local.create({ type: 'folder', name: 'Imports' })
    const out = await importToPlacement([sample()], deps(), { storage: 'local', parentId: folder.id }, repo)
    expect(out.failures).toEqual([])
    expect(out.summaries[0]!.files[0]!.record).toMatchObject({ storage: 'local', parentId: folder.id })
    expect(drive.calls).toEqual([])
  })
})

describe('Google Drive', () => {
  it('creates the .wishtaa file in Drive (in the Wishtaa Maps folder by default) and links the local file to it', async () => {
    const out = await importToPlacement([sample()], deps(), { storage: 'drive', folder: null }, repo)
    expect(out.failures).toEqual([])
    const rec = out.summaries[0]!.files[0]!.record
    expect(rec).toMatchObject({ type: 'map', name: 'IND_AS_2', storage: 'drive', parentId: null })
    expect(rec.driveMeta?.version).toBe('1')
    const stored = driveFiles()
    expect(stored).toHaveLength(1)
    expect(stored[0]!.meta.parents).toEqual([appFolder()])
    expect(stored[0]!.meta.id).toBe(rec.contentRef)
    expect(topicTexts(stored[0]!.body)).toContain('IND AS 2')
  })

  it('uses the Drive folder that was chosen', async () => {
    const custom = drive.seed('Client work', '', undefined)
    const out = await importToPlacement([sample()], deps(), { storage: 'drive', folder: { id: custom.id, name: 'Client work' } }, repo)
    expect(driveFiles()[0]!.meta.parents).toEqual([custom.id])
    expect(out.summaries[0]!.files[0]!.record.storage).toBe('drive')
  })

  it('puts the imported pictures into Drive with the file, with their original bytes (like pasted ones)', async () => {
    await importToPlacement([sample()], deps(), { storage: 'drive', folder: null }, repo)
    const un = unpackFile(driveFiles()[0]!.body)
    expect(un.images).toHaveLength(8)
    const original = Object.entries(unzipSync(FIXTURE_BYTES())).filter(([n]) => n.startsWith('media/'))
    const originalHashes = new Set(await Promise.all(original.map(([, b]) => sha256Hex(b))))
    for (const img of un.images) {
      expect(img.type).toBe('image/png')
      expect(originalHashes.has(await sha256Hex(new Uint8Array(await img.blob.arrayBuffer())))).toBe(true)
    }
    // And they open complete on another device: restoring into an empty store brings all 8 back.
    const other = new MemoryImageStore()
    for (const i of un.images) await other.put(i)
    expect(await other.keys()).toHaveLength(8)
  })

  it('the first autosave updates the Drive file instead of making a second one', async () => {
    const out = await importToPlacement([sample()], deps(), { storage: 'drive', folder: null }, repo)
    const rec = out.summaries[0]!.files[0]!.record
    const before = driveFiles().length
    const d = createMapDoc()
    Y.applyUpdate(d.ydoc, (await local.loadContent(rec.id))!, 'load')
    const root = Object.values(snapshotTopics(d)).find((x) => x.parentId === null)!
    addChild(d, root.id, 'edited after import')
    await repo.saveContent(rec.id, Y.encodeStateAsUpdate(d.ydoc))
    expect(driveFiles()).toHaveLength(before)
    expect(topicTexts(driveFiles()[0]!.body)).toContain('edited after import')
    expect(drive.files.get(rec.contentRef!)!.meta.version).toBe('2')
  })

  it('creates one Drive file per page of a multi-page file', async () => {
    const { zip, doc, page, topic } = await import('@/core/import/emmx/testkit')
    const z = zip({ 'document.xml': doc('page;page2'), 'page/page.xml': page('Revenue', topic({ id: 1, type: 'MainIdea', text: 'A' })), 'page/page2.xml': page('Costs', topic({ id: 1, type: 'MainIdea', text: 'B' })) })
    const out = await importToPlacement([asFile('Budget.emmx', z)], deps(), { storage: 'drive', folder: null }, repo)
    expect(out.failures).toEqual([])
    expect(driveFiles().map((f) => f.meta.name).sort()).toEqual(['Costs.wishtaa', 'Revenue.wishtaa'])
  })

  it('a file that cannot be imported at all creates nothing in Drive or here', async () => {
    const out = await importToPlacement([asFile('bad.emmx', new TextEncoder().encode('not a zip, just a few words in a file'))], deps(), { storage: 'drive', folder: null }, repo)
    expect(out.summaries[0]!.error).toMatch(/not a valid \.emmx/)
    expect(out.failures).toEqual([])
    expect(driveFiles()).toEqual([])
    expect(await local.list({ parentId: 'any' })).toEqual([])
  })
})

describe('when Drive fails', () => {
  const failing = async () => {
    drive.isOnline = false
    return importToPlacement([sample()], deps(), { storage: 'drive', folder: null }, repo)
  }

  it('keeps the imported map in this browser, with its pictures, and says why', async () => {
    const out = await failing()
    expect(out.failures).toHaveLength(1)
    expect(out.failures[0]!.error.kind).toBe('offline')
    const rec = out.summaries[0]!.files[0]!.record
    expect(rec.storage).toBe('local')
    expect(await local.get(rec.id)).not.toBeNull()
    expect(await local.loadContent(rec.id)).not.toBeNull()
    expect(await images.keys()).toHaveLength(8)
    expect((await local.list({ parentId: 'any' })).length).toBe(1)
  })

  it.each([
    ['auth', 'Your Google sign-in expired.'],
    ['quota', 'Your Google Drive is full.'],
  ] as const)('reports %s problems with the message to show', async (kind, message) => {
    drive.failNextWith = new DriveError(kind, message)
    const out = await importToPlacement([sample()], deps(), { storage: 'drive', folder: null }, repo)
    expect(out.failures[0]!.error).toMatchObject({ kind, message })
    expect(out.summaries[0]!.files[0]!.record.storage).toBe('local')
  })

  it('Retry uploads the same map once Drive works (no copy in this browser)', async () => {
    const out = await failing()
    drive.isOnline = true
    const next = await retryDriveUpload(out, repo, { storage: 'drive', folder: null })
    expect(next.failures).toEqual([])
    expect(next.summaries[0]!.files[0]!.record).toMatchObject({ id: out.summaries[0]!.files[0]!.record.id, storage: 'drive' })
    expect(driveFiles()).toHaveLength(1)
    expect(unpackFile(driveFiles()[0]!.body).images).toHaveLength(8)
    expect((await local.list({ parentId: 'any' })).length).toBe(1)
  })

  it('Retry that fails again keeps the map and the failure', async () => {
    const out = await failing()
    const next = await retryDriveUpload(out, repo, { storage: 'drive', folder: null })
    expect(next.failures).toHaveLength(1)
    expect(next.summaries[0]!.files[0]!.record.storage).toBe('local')
  })

  it('only the maps that failed are retried when some worked', async () => {
    const { zip, doc, page, topic } = await import('@/core/import/emmx/testkit')
    const z = zip({ 'document.xml': doc('page;page2'), 'page/page.xml': page('One', topic({ id: 1, type: 'MainIdea', text: 'A' })), 'page/page2.xml': page('Two', topic({ id: 1, type: 'MainIdea', text: 'B' })) })
    let n = 0
    const flaky: DriveSender = { moveToDrive: async (id, folder) => (++n === 2 ? Promise.reject(new DriveError('rate', 'Google Drive is busy.')) : repo.moveToDrive(id, folder)) }
    const out = await importToPlacement([asFile('Two pages.emmx', z)], deps(), { storage: 'drive', folder: null }, flaky)
    expect(out.failures).toHaveLength(1)
    expect(out.summaries[0]!.files.map((f) => f.record.storage)).toEqual(['drive', 'local'])
    const next = await retryDriveUpload(out, repo, { storage: 'drive', folder: null })
    expect(next.failures).toEqual([])
    expect(next.summaries[0]!.files.map((f) => f.record.storage)).toEqual(['drive', 'drive'])
    expect(driveFiles()).toHaveLength(2)
  })

  it('a remembered folder that no longer exists falls back to the Wishtaa Maps folder on retry', async () => {
    const original = drive.create.bind(drive)
    drive.create = async (input) => {
      if (input.parentId === 'gone') throw new DriveError('notfound', 'That file is no longer in Google Drive.', 404)
      return original(input)
    }
    const gone = { storage: 'drive', folder: { id: 'gone', name: 'Old' } } as const
    const out: ImportOutcome = await importToPlacement([sample()], deps(), gone, repo)
    expect(out.failures[0]!.error.kind).toBe('notfound')
    const next = await retryDriveUpload(out, repo, gone)
    expect(next.failures).toEqual([])
    expect(driveFiles()[0]!.meta.parents).toEqual([appFolder()])
  })

  it('"Import to this browser instead" is just keeping what is there: the map is already local and complete', async () => {
    const out = await failing()
    const rec = (await local.get(out.summaries[0]!.files[0]!.record.id))!
    expect(rec).toMatchObject({ storage: 'local', topicCount: 9 })
    expect(rec.imageIds).toHaveLength(8)
  })
})

describe('pictures in tiny files', () => {
  it('a map with a picture goes to Drive with that picture only once, however many topics use it', async () => {
    const same = png(50, 40, 7)
    const shapes = basicShapes({ main1: { rid: 'rId1' }, main2: { rid: 'rId2' } })
    const z = simple(shapes, { 'rels/page_rels.xml': rels({ rId1: '../media/a.png', rId2: '../media/b.png' }), 'media/a.png': same, 'media/b.png': same })
    await importToPlacement([asFile('dupes.emmx', z)], deps(), { storage: 'drive', folder: null }, repo)
    expect(unpackFile(driveFiles()[0]!.body).images).toHaveLength(1)
  })
})
