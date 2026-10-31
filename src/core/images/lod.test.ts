import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { averageColor } from './color'
import { LOD, levelFor, whileMoving } from './lod'
import { IndexedDbImageStore, MemoryImageStore } from './store'
import type { Codec, Decoded, Raster } from './pipeline'

describe('level of detail by size on screen', () => {
  it('dot under 6 px, flat colour to 24 px, small version to 200 px, full above', () => {
    expect(levelFor(2)).toBe('dot')
    expect(levelFor(LOD.dotBelowPx)).toBe('flat')
    expect(levelFor(23)).toBe('flat')
    expect(levelFor(LOD.flatBelowPx)).toBe('thumb')
    expect(levelFor(199)).toBe('thumb')
    expect(levelFor(LOD.fullFromPx)).toBe('full')
    expect(levelFor(600)).toBe('full')
  })

  it('while the view moves nothing is drawn above the small version', () => {
    expect(whileMoving(true, 'full')).toBe('thumb')
    expect(whileMoving(true, 'flat')).toBe('flat')
    expect(whileMoving(false, 'full')).toBe('full')
  })
})

const sample = (rgba: number[]): Codec => ({
  async decode(): Promise<Decoded> {
    return { width: 4, height: 4, raw: null, close: () => undefined }
  },
  async render(_s: Decoded, o): Promise<Raster> {
    const data = new Uint8ClampedArray(o.width * o.height * 4)
    for (let i = 0; i < data.length; i += 4) data.set(rgba, i)
    return { width: o.width, height: o.height, raw: null, pixels: () => ({ data }) }
  },
  encode: async () => null,
  canEncode: async () => true,
})

describe('the average colour kept with a thumbnail', () => {
  it('is read from a small sample as #rrggbb, and transparent areas count as white', async () => {
    expect(await averageColor(new Blob(['x']), sample([255, 0, 0, 255]))).toBe('#ff0000')
    expect(await averageColor(new Blob(['x']), sample([0, 0, 0, 0]))).toBe('#ffffff')
  })

  it('is kept next to the thumbnail, and can be added later to one made without it', async () => {
    for (const store of [new MemoryImageStore(), new IndexedDbImageStore('lod-test')]) {
      await store.putThumb('a', new Blob(['t']), '#102030')
      expect(await store.getThumbColor('a')).toBe('#102030')
      await store.putThumb('b', new Blob(['t']))
      expect(await store.getThumbColor('b')).toBeUndefined()
      await store.setThumbColor('b', '#abcdef')
      expect(await store.getThumbColor('b')).toBe('#abcdef')
      await store.delete('a')
      expect(await store.getThumbColor('a')).toBeUndefined()
    }
  })
})
