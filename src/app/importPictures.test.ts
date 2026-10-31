import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { basicShapes, png, simple, topic } from '@/core/import/emmx/testkit'
import type { Codec, Decoded, Raster } from '@/core/images/pipeline'
import { MemoryImageStore } from '@/core/images/store'
import { importEmmx, importedImageId, type ImportPictures, type PickedFile } from './importEmmx'

const asFile = (name: string, bytes: Uint8Array): PickedFile => ({ name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer })
const sample = () => asFile('IND_AS_2.emmx', new Uint8Array(readFileSync('tests/fixtures/IND_AS_2.emmx')))

/** Every picture "compresses" to 30% of its size (WebP), so the savings are predictable. */
const squeeze: Codec = {
  async decode(blob: Blob): Promise<Decoded> {
    return { width: 2000, height: 1500, raw: { bytes: blob.size }, close: () => undefined }
  },
  async render(src: Decoded, o): Promise<Raster> {
    return { width: o.width, height: o.height, raw: src.raw, pixels: () => ({ data: new Uint8ClampedArray(o.width * o.height * 4).fill(255) }) }
  },
  async encode(r: Raster, type: string): Promise<Blob | null> {
    const bytes = (r.raw as { bytes: number }).bytes
    return new Blob([new Uint8Array(Math.round(bytes * (type === 'image/webp' ? 0.3 : type === 'image/jpeg' ? 0.4 : 1.2)))], { type })
  },
  canEncode: async () => true,
}

let repo: RepositoryCore
let images: MemoryImageStore
let t = 1_700_000_000_000
beforeEach(() => {
  repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  images = new MemoryImageStore()
})

const pictures = (pref: ImportPictures['pref'], answer: 'compressed' | 'original' | null = 'compressed') => {
  const choose = vi.fn(async () => answer)
  return { p: { pref, codec: squeeze, choose } satisfies ImportPictures, choose }
}
const stored = async () => {
  const out: { id: string; size: number }[] = []
  for (const id of await images.keys()) out.push({ id, size: (await images.getMeta(id))?.size ?? 0 })
  return out
}
const total = async () => (await stored()).reduce((n, i) => n + i.size, 0)

describe('importing an .emmx: pictures only need to be readable', () => {
  it('asks ONCE for the whole file, with the totals (1.70 MB of originals)', async () => {
    const { p, choose } = pictures('ask')
    await importEmmx(sample(), { repo, images, parentId: null, pictures: p })
    expect(choose).toHaveBeenCalledTimes(1)
    const info = (choose.mock.calls[0] as unknown as [{ count: number; original: number; compressed: number }])[0]
    expect(info.count).toBe(8)
    expect(info.original).toBe(1700005)
    expect(info.compressed).toBeLessThan(info.original * 0.4)
  })

  it('Compressed: the stored pictures are about 30% of the originals, under content-hash ids', async () => {
    const { p } = pictures('ask', 'compressed')
    const out = await importEmmx(sample(), { repo, images, parentId: null, pictures: p })
    expect(out.error).toBeUndefined()
    expect((await stored()).every((s) => /^p-[0-9a-f]{40}$/.test(s.id))).toBe(true)
    expect(await total()).toBeLessThan(700_000)
    expect(out.files[0]?.images).toBe(8)
  })

  it('Original: the original bytes are kept, exactly as before', async () => {
    const { p } = pictures('ask', 'original')
    await importEmmx(sample(), { repo, images, parentId: null, pictures: p })
    expect(await total()).toBe(1700005)
    expect((await stored()).every((s) => s.id.startsWith('imp-'))).toBe(true)
  })

  it('cancelling the question keeps the originals (nothing is lost)', async () => {
    const { p } = pictures('ask', null)
    await importEmmx(sample(), { repo, images, parentId: null, pictures: p })
    expect(await total()).toBe(1700005)
  })

  it('"Always compress": never asks', async () => {
    const { p, choose } = pictures('compress')
    await importEmmx(sample(), { repo, images, parentId: null, pictures: p })
    expect(choose).not.toHaveBeenCalled()
    expect(await total()).toBeLessThan(700_000)
  })

  it('"Always keep original": never asks, keeps them', async () => {
    const { p, choose } = pictures('original')
    await importEmmx(sample(), { repo, images, parentId: null, pictures: p })
    expect(choose).not.toHaveBeenCalled()
    expect(await total()).toBe(1700005)
  })

  it('pictures that cannot be compressed meaningfully stay as they are, and a file of tiny ones is not asked about', async () => {
    const tiny = simple(
      topic({ id: 1, type: 'MainIdea', text: 'Centre', cx: 500, sub: [2] }) +
        topic({ id: 2, type: 'MainTopic', text: 'Pic', cx: 800, superId: 1, toSuper: 20, rid: 'rId1' }) +
        '<Shape ID="20" Type="MMConnector"><ShapeFormat><LineFormat><LineFill Type="Solid"><Color V="#ff112233"/></LineFill></LineFormat></ShapeFormat></Shape>',
      { 'rels/page_rels.xml': '<Relationships><Relationship Id="rId1" Target="../media/a.png"/></Relationships>', 'media/a.png': png(5, 5) }
    )
    const { p, choose } = pictures('ask')
    await importEmmx(asFile('Tiny.emmx', tiny), { repo, images, parentId: null, pictures: p })
    expect(choose).not.toHaveBeenCalled()
    expect((await stored()).every((s) => s.id.startsWith('imp-'))).toBe(true)
  })

  it('without picture settings (older callers) the originals are kept', async () => {
    await importEmmx(asFile('Plain.emmx', simple(basicShapes())), { repo, images, parentId: null })
    expect(importedImageId('x')).toMatch(/^imp-/)
  })
})
