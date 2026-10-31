import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import type { Codec, Decoded, Raster } from '@/core/images/pipeline'
import { MemoryImageStore } from '@/core/images/store'
import { importEmmx, type ImportProgress, type PickedFile } from './importEmmx'

const bytes = new Uint8Array(readFileSync('tests/fixtures/IND_AS_116.emmx'))
const asFile = (): PickedFile => ({ name: 'IND_AS_116.emmx', size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer })

/** Every picture decodes as 2000 x 1500 and "compresses" to 30% of its bytes as WebP. */
const squeeze: Codec = {
  async decode(blob: Blob): Promise<Decoded> {
    return { width: 2000, height: 1500, raw: { bytes: blob.size }, close: () => undefined }
  },
  async render(src: Decoded, o): Promise<Raster> {
    return { width: o.width, height: o.height, raw: src.raw, pixels: () => ({ data: new Uint8ClampedArray(o.width * o.height * 4).fill(255) }) }
  },
  async encode(r: Raster, type: string): Promise<Blob | null> {
    return new Blob([new Uint8Array(Math.round((r.raw as { bytes: number }).bytes * (type === 'image/webp' ? 0.3 : 1.2)))], { type })
  },
  canEncode: async () => true,
}

describe('importing IND AS 116 (13 MB, 28 pictures)', () => {
  it('imports it as one map of 29 topics with 28 pictures, shows progress, and never holds the page', async () => {
    const repo = new RepositoryCore(new MemoryBackend(), () => Date.now())
    const images = new MemoryImageStore()
    const progress: ImportProgress[] = []
    let turns = 0
    const timer = setInterval(() => turns++, 1)
    const out = await importEmmx(asFile(), {
      repo,
      images,
      parentId: null,
      progress: (p) => progress.push(p),
      pictures: { pref: 'compress', codec: squeeze, choose: async () => 'compressed' },
    })
    clearInterval(timer)

    expect(out.error).toBeUndefined()
    expect(out.files).toHaveLength(1)
    expect(out.files[0]?.record).toMatchObject({ name: 'IND_AS_116', topicCount: 29 })
    expect(out.files[0]?.record.imageIds).toHaveLength(28)
    expect(await images.keys()).toHaveLength(28)
    expect(out.warnings.join(' ')).toMatch(/newer EdrawMind/)

    // The steps a person sees, in order, with counts that only go up.
    const labels = [...new Set(progress.map((p) => p.label))]
    expect(labels).toEqual(['Opening the file', 'Reading the file', 'Reading pictures', 'Checking pictures', 'Saving pictures'])
    for (const label of ['Reading pictures', 'Checking pictures', 'Saving pictures']) {
      const steps = progress.filter((p) => p.label === label)
      expect(steps.length).toBeGreaterThanOrEqual(28)
      expect(steps.every((p, i) => i === 0 || p.done >= (steps[i - 1] as ImportProgress).done)).toBe(true)
      expect(steps.every((p) => p.total === 28)).toBe(true)
    }
    // The page was given turns throughout (timers kept firing), so it never froze for the whole import.
    expect(turns).toBeGreaterThan(10)
  })
})
