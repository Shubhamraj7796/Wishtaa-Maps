import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { ImageGc } from './gc'
import { fallbackType, fitWithin, validateImageFile, MAX_IMAGE_BYTES } from './process'
import { IndexedDbImageStore, MemoryImageStore, type ImageStore, type StoredImage } from './store'

const img = (id: string, bytes = 8): StoredImage => ({
  id,
  width: 10,
  height: 20,
  type: 'image/webp',
  size: bytes,
  blob: new Blob([new Uint8Array(bytes).fill(7)], { type: 'image/webp' }),
})

describe('validateImageFile', () => {
  it('accepts normal raster images', () => {
    expect(validateImageFile({ type: 'image/png', size: 1000 })).toBeNull()
    expect(validateImageFile({ type: 'image/jpeg', size: MAX_IMAGE_BYTES })).toBeNull()
    expect(validateImageFile({ type: 'image/webp', size: 5 })).toBeNull()
  })
  it('rejects non-images, svg, empty and oversize files with friendly text', () => {
    expect(validateImageFile({ type: 'application/pdf', size: 10 })).toMatch(/Only image files/)
    expect(validateImageFile({ type: '', size: 10 })).toMatch(/Only image files/)
    expect(validateImageFile({ type: 'image/svg+xml', size: 10 })).toMatch(/SVG/)
    expect(validateImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toMatch(/10 MB/)
    expect(validateImageFile({ type: 'image/png', size: 0 })).toMatch(/empty/)
  })
})

describe('fitWithin / fallbackType', () => {
  it('downsizes to the longest side and keeps the ratio', () => {
    expect(fitWithin(3200, 1600)).toEqual({ width: 1600, height: 800 })
    expect(fitWithin(1000, 4000)).toEqual({ width: 400, height: 1600 })
  })
  it('never scales up', () => {
    expect(fitWithin(300, 200)).toEqual({ width: 300, height: 200 })
    expect(fitWithin(1600, 10)).toEqual({ width: 1600, height: 10 })
  })
  it('falls back to jpeg for jpeg and png for everything else', () => {
    expect(fallbackType('image/jpeg')).toBe('image/jpeg')
    expect(fallbackType('image/png')).toBe('image/png')
    expect(fallbackType('image/gif')).toBe('image/png')
  })
})

function contract(name: string, make: () => ImageStore) {
  describe(`${name} image store`, () => {
    it('stores, reads back and lists images', async () => {
      const s = make()
      await s.put(img('a', 16))
      await s.put(img('b'))
      const got = await s.get('a')
      expect(got?.width).toBe(10)
      expect(got?.type).toBe('image/webp')
      expect(got?.blob.size).toBe(16)
      expect((await s.keys()).sort()).toEqual(['a', 'b'])
    })
    it('returns metadata without needing the blob', async () => {
      const s = make()
      await s.put(img('a', 4))
      expect(await s.getMeta('a')).toEqual({ id: 'a', width: 10, height: 20, type: 'image/webp', size: 4 })
      expect(await s.getMeta('nope')).toBeUndefined()
    })
    it('overwrites on the same id and deletes', async () => {
      const s = make()
      await s.put(img('a', 4))
      await s.put(img('a', 9))
      expect((await s.get('a'))?.blob.size).toBe(9)
      await s.delete('a')
      expect(await s.get('a')).toBeUndefined()
      expect(await s.keys()).toEqual([])
    })
    it('deleting a missing id is not an error', async () => {
      await expect(make().delete('ghost')).resolves.toBeUndefined()
    })
  })
}

contract('memory', () => new MemoryImageStore())
let n = 0
// Each IndexedDB test gets its own database.
contract('IndexedDB', () => new IndexedDbImageStore(`test-db-${n++}`))

describe('IndexedDB specifics', () => {
  it('keeps data across store instances (a page reload)', async () => {
    await new IndexedDbImageStore('reload-db').put(img('persist', 12))
    const again = new IndexedDbImageStore('reload-db')
    expect((await again.get('persist'))?.blob.size).toBe(12)
  })
})

describe('ImageGc', () => {
  const setup = (maxUndo = 3) => {
    const store = new MemoryImageStore()
    let used = new Set<string>()
    const gc = new ImageGc(store, () => used, maxUndo)
    return { store, gc, use: (...ids: string[]) => (used = new Set(ids)) }
  }

  it('keeps images that are in use', async () => {
    const { store, gc, use } = setup()
    await store.put(img('a'))
    use('a')
    for (let i = 0; i < 10; i++) {
      gc.noteStep()
      expect(await gc.scan()).toEqual([])
    }
    expect(await store.keys()).toEqual(['a'])
  })

  it('keeps an unused image while undo could still restore it, then deletes it', async () => {
    const { store, gc, use } = setup(3)
    await store.put(img('a'))
    use() // topic deleted
    expect(await gc.scan()).toEqual([]) // first sighting: just noted
    for (let i = 0; i < 3; i++) {
      gc.noteStep()
      expect(await gc.scan()).toEqual([]) // still within undo reach
    }
    gc.noteStep()
    expect(await gc.scan()).toEqual(['a'])
    expect(await store.keys()).toEqual([])
  })

  it('forgets an orphan that comes back into use (undo)', async () => {
    const { store, gc, use } = setup(2)
    await store.put(img('a'))
    use()
    await gc.scan()
    gc.noteStep()
    use('a') // undo restored the topic
    await gc.scan()
    use() // deleted again later
    for (let i = 0; i < 2; i++) {
      gc.noteStep()
      await gc.scan()
    }
    expect(await store.keys()).toEqual(['a']) // the clock restarted
  })

  it('sweeps every unused image at start-up only when asked', async () => {
    const { store, gc, use } = setup()
    await store.put(img('a'))
    await store.put(img('b'))
    use('a')
    expect(await gc.sweepAll()).toEqual(['b'])
    expect(await store.keys()).toEqual(['a'])
  })
})
