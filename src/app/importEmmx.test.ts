import { readFileSync } from 'node:fs'
import { unzipSync, zipSync } from 'fflate'
import * as Y from 'yjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { MemoryImageStore } from '@/core/images/store'
import { createMapDoc, snapshotTopics } from '@/core/model/doc'
import { sha256Hex } from '@/core/import/emmx/images'
import { basicShapes, doc, page, png, rels, simple, topic, zip } from '@/core/import/emmx/testkit'
import { importedImageId, importEmmx, type PickedFile } from './importEmmx'

const FIXTURE = 'tests/fixtures/IND_AS_2.emmx'
const asFile = (name: string, bytes: Uint8Array): PickedFile => ({ name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer })
const sample = () => asFile('IND_AS_2.emmx', new Uint8Array(readFileSync(FIXTURE)))

let repo: RepositoryCore
let images: MemoryImageStore
let t = 1_700_000_000_000
beforeEach(() => {
  repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  images = new MemoryImageStore()
})

const topicsOf = async (id: string) => {
  const d = createMapDoc()
  Y.applyUpdate(d.ydoc, (await repo.loadContent(id))!, 'load')
  return Object.values(snapshotTopics(d))
}

describe('importing the sample as a Wishtaa map', () => {
  it('creates an ordinary map file with the right topics, named after the file', async () => {
    const out = await importEmmx(sample(), { repo, images, parentId: null })
    expect(out.error).toBeUndefined()
    expect(out.warnings).toEqual([])
    expect(out.files).toHaveLength(1)
    const rec = out.files[0]!.record
    expect(rec).toMatchObject({ type: 'map', name: 'IND_AS_2', storage: 'local', parentId: null })
    expect(rec.topicCount).toBe(9)
    expect(out.files[0]).toMatchObject({ topics: 9, images: 8 })
    const topics = await topicsOf(rec.id)
    expect(topics).toHaveLength(9)
    expect(topics.find((x) => x.parentId === null)?.text).toBe('IND AS 2')
    expect(topics.filter((x) => x.image)).toHaveLength(8)
    expect((await repo.list({ parentId: null })).map((f) => f.id)).toEqual([rec.id])
  })

  it('stores each picture with its original bytes, so screenshots of text stay sharp', async () => {
    const out = await importEmmx(sample(), { repo, images, parentId: null })
    const original = Object.entries(unzipSync(new Uint8Array(readFileSync(FIXTURE)))).filter(([n]) => n.startsWith('media/'))
    const originalHashes = new Set(await Promise.all(original.map(([, b]) => sha256Hex(b))))
    const keys = await images.keys()
    expect(keys).toHaveLength(8)
    for (const k of keys) {
      const stored = (await images.get(k))!
      expect(stored.type).toBe('image/png')
      expect(originalHashes.has(await sha256Hex(new Uint8Array(await stored.blob.arrayBuffer())))).toBe(true)
      expect(k).toMatch(/^imp-[0-9a-f]{32}$/)
    }
    // The map's pictures point at those stored ones, and the file record lists them (so clean-up keeps them).
    const rec = out.files[0]!.record
    expect([...rec.imageIds!].sort()).toEqual([...keys].sort())
    const used = (await topicsOf(rec.id)).flatMap((x) => (x.image ? [x.image.imageId] : []))
    expect(new Set(used)).toEqual(new Set(keys))
  })

  it('is searchable straight away', async () => {
    const out = await importEmmx(asFile('Tax.emmx', simple(basicShapes({ main1: { text: 'Deferred tax asset' } }))), { repo, images, parentId: null })
    const hits = await repo.search({ text: 'deferred' })
    expect(hits.map((h) => h.file.id)).toEqual([out.files[0]!.record.id])
  })

  it('importing the same file again makes another map but reuses the stored pictures', async () => {
    await importEmmx(sample(), { repo, images, parentId: null })
    await importEmmx(sample(), { repo, images, parentId: null })
    expect(await repo.list({ parentId: null })).toHaveLength(2)
    expect(await images.keys()).toHaveLength(8)
  })

  it('puts the map in the chosen folder', async () => {
    const folder = await repo.create({ type: 'folder', name: 'Imports' })
    const out = await importEmmx(sample(), { repo, images, parentId: folder.id })
    expect(out.files[0]!.record.parentId).toBe(folder.id)
  })

  it('can keep the placeholder texts', async () => {
    const out = await importEmmx(sample(), { repo, images, parentId: null, options: { clearPlaceholderText: false } })
    expect((await topicsOf(out.files[0]!.record.id)).filter((x) => x.text === 'Main Topic')).toHaveLength(3)
  })
})

describe('names and pages', () => {
  const twoPages = () =>
    zip({
      'document.xml': doc('page;page2'),
      'page/page.xml': page('Revenue', topic({ id: 1, type: 'MainIdea', text: 'A' })),
      'page/page2.xml': page('Page-2', topic({ id: 1, type: 'MainIdea', text: 'B' })),
    })

  it('names a multi-page import after the page names, adding the file name to default ones', async () => {
    const out = await importEmmx(asFile('Budget.emmx', twoPages()), { repo, images, parentId: null })
    expect(out.files.map((f) => f.record.name)).toEqual(['Revenue', 'Budget - Page-2'])
    expect(await repo.list({ parentId: null })).toHaveLength(2)
  })

  it('a single page takes the file name', async () => {
    const out = await importEmmx(asFile('My notes.emmx', simple()), { repo, images, parentId: null })
    expect(out.files[0]!.record.name).toBe('My notes')
  })
})

describe('big pictures', () => {
  const big = () => asFile('big.emmx', simple(basicShapes({ main1: { rid: 'rId1' }, main2: { rid: 'rId2' } }), { 'rels/page_rels.xml': rels({ rId1: '../media/a.png', rId2: '../media/b.png' }), 'media/a.png': png(5000, 800, 1), 'media/b.png': png(3000, 800, 2) }))

  it('reduces only pictures over 4000 px, asking for the 4000 px limit, and leaves the others alone', async () => {
    const downscale = vi.fn(async () => ({ blob: new Blob([new Uint8Array(10)], { type: 'image/png' }), width: 4000, height: 640 }))
    const out = await importEmmx(big(), { repo, images, parentId: null, downscale })
    expect(downscale).toHaveBeenCalledTimes(1)
    expect(downscale).toHaveBeenCalledWith(expect.any(Blob), 4000)
    const stored = await Promise.all((await images.keys()).map((k) => images.get(k)))
    expect(stored.map((i) => i!.width).sort()).toEqual([3000, 4000])
    expect(out.warnings.join('|')).toMatch(/reduced to 4000 px/)
  })

  it('keeps the original when reducing fails, and says so', async () => {
    const out = await importEmmx(big(), { repo, images, parentId: null, downscale: async () => Promise.reject(new Error('no canvas')) })
    const stored = await Promise.all((await images.keys()).map((k) => images.get(k)))
    expect(stored.map((i) => i!.width).sort()).toEqual([3000, 5000])
    expect(out.warnings.join('|')).toMatch(/could not be reduced/)
    expect(out.error).toBeUndefined()
  })
})

describe('bad files', () => {
  it('reports a clear error and creates nothing for a file that is not an .emmx', async () => {
    const out = await importEmmx(asFile('notes.emmx', new TextEncoder().encode('hello, I am just text, not a zip file at all')), { repo, images, parentId: null })
    expect(out.error).toMatch(/not a valid \.emmx/)
    expect(out.files).toEqual([])
    expect(await repo.list({ parentId: 'any' })).toEqual([])
    expect(await images.keys()).toEqual([])
  })

  it('refuses a file over 50 MB without reading it', async () => {
    const read = vi.fn(async () => new ArrayBuffer(0))
    const out = await importEmmx({ name: 'huge.emmx', size: 50 * 1024 * 1024 + 1, arrayBuffer: read }, { repo, images, parentId: null })
    expect(out.error).toMatch(/larger than 50 MB/)
    expect(read).not.toHaveBeenCalled()
  })

  it('an archive with unsafe content imports what is safe and reports the rest', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    const z = zipSync({
      'document.xml': new TextEncoder().encode(doc('page')),
      'page/page.xml': new TextEncoder().encode(page('P', basicShapes({ main1: { rid: 'rId1' } }))),
      'rels/page_rels.xml': new TextEncoder().encode(rels({ rId1: '../media/x.png' })),
      'media/x.png': svg,
      '../../outside.txt': new TextEncoder().encode('x'),
    })
    const out = await importEmmx(asFile('mixed.emmx', z), { repo, images, parentId: null })
    expect(out.error).toBeUndefined()
    expect(out.files).toHaveLength(1)
    expect(await images.keys()).toEqual([])
    expect(out.warnings.join('|')).toMatch(/SVG/)
  })

  it('exposes what is not supported yet, for sending samples', async () => {
    const shapes = basicShapes({ extra: topic({ id: 30, type: 'FloatTopic', text: 'x' }), main1: { extra: '<Notes/>' } })
    const out = await importEmmx(asFile('odd.emmx', simple(shapes)), { repo, images, parentId: null })
    expect(out.unknownTypes).toEqual({ FloatTopic: 1 })
    expect(out.unsupportedElements).toEqual({ Notes: 1 })
    expect(out.warnings).toContain('1 floating topic skipped')
  })
})

describe('picture ids', () => {
  it('are stable for the same picture', () => {
    expect(importedImageId('a'.repeat(64))).toBe(`imp-${'a'.repeat(32)}`)
  })
})
