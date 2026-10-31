import 'fake-indexeddb/auto'
import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { uploadingText } from '../drive/progress'
import { isZip, makeBundle, makeSharedCopy, openWishtaaFile } from '../files/bundle'
import { createMapDoc, ensureRoot } from '../model/doc'
import { fakeCodec, source } from '@/test/fakeCodec'
import { PictureCache } from './cache'
import { PICTURE_LIMITS, limitState } from './limits'
import { IndexedDbImageStore, MemoryImageStore } from './store'
import { makeThumb } from './thumbs'

const MB = 1048576

describe('the decoded-picture cache (LRU with a memory budget)', () => {
  it('lets go of the least recently used pictures first, once over budget', () => {
    const gone: string[] = []
    const cache = new PictureCache(() => 10 * MB, (id) => gone.push(id))
    cache.add('a', 4 * MB)
    cache.add('b', 4 * MB)
    cache.touch('a') // a was used more recently than b
    cache.add('c', 4 * MB) // 12 MB > 10 MB
    expect(gone).toEqual(['b'])
    expect(cache.totalBytes).toBe(8 * MB)
  })

  it('never lets go of a picture that is on screen', () => {
    const gone: string[] = []
    const cache = new PictureCache(() => 5 * MB, (id) => gone.push(id))
    cache.add('shown', 4 * MB)
    cache.acquire('shown')
    cache.add('other', 4 * MB)
    expect(gone).toEqual(['other'])
    cache.release('shown')
    cache.add('third', 4 * MB)
    expect(gone).toContain('shown') // no longer on screen: now it can go
  })

  it('stays within the budget while 500 pictures are panned past, a screenful at a time', () => {
    const budget = PICTURE_LIMITS.memoryTouch
    const cache = new PictureCache(() => budget, () => undefined)
    let peak = 0
    const each = 1280 * 960 * 4 // a decoded Compressed picture
    for (let start = 0; start < 500; start += 6) {
      const shown = Array.from({ length: 12 }, (_, i) => `p${start + i}`).filter((_, i) => start + i < 500)
      for (const id of shown) {
        cache.add(id, each)
        cache.acquire(id)
      }
      peak = Math.max(peak, cache.totalBytes)
      for (const id of shown) cache.release(id)
    }
    expect(peak).toBeLessThanOrEqual(budget + 12 * each) // never more than the budget plus what is on screen
    expect(cache.totalBytes).toBeLessThanOrEqual(budget)
  })
})

describe('limits', () => {
  it('ok, soft notice at 400 pictures or 250 MB, hard stop at 2,000 pictures or 1 GB', () => {
    expect(limitState(10, 5 * MB).state).toBe('ok')
    expect(limitState(400, 5 * MB).state).toBe('soft')
    expect(limitState(10, 250 * MB).state).toBe('soft')
    expect(limitState(2000, 5 * MB).state).toBe('hard')
    expect(limitState(10, 1024 * MB).state).toBe('hard')
    expect(limitState(10, 5 * MB).message).toBeNull()
    expect(limitState(500, 5 * MB).message).toMatch(/500 pictures/)
  })
})

describe('thumbnails and sizes in the picture store', () => {
  it('keeps a small version per picture, and asking a size never reads the picture', async () => {
    const store = new IndexedDbImageStore('thumbs-test')
    const blob = new Blob([new Uint8Array(200_000)], { type: 'image/webp' })
    await store.put({ id: 'p-1', blob, width: 1280, height: 720, type: 'image/webp', size: blob.size })
    await store.putThumb('p-1', new Blob([new Uint8Array(5000)], { type: 'image/webp' }))
    expect((await store.getMeta('p-1'))?.size).toBe(200_000)
    expect((await store.getThumb('p-1'))?.size).toBe(5000)
    await store.delete('p-1')
    expect(await store.getThumb('p-1')).toBeUndefined()
    expect(await store.getMeta('p-1')).toBeUndefined()
  })

  it('a thumbnail is drawn at most 256 px on its longest side, keeping the shape', async () => {
    const { codec, log } = fakeCodec({ webp: true })
    const t = await makeThumb(source(2000, 1000, 'photo', 100), codec)
    expect(t).toBeTruthy()
    const r = log.renders.at(-1)
    expect(Math.max(r?.width ?? 0, r?.height ?? 0)).toBe(PICTURE_LIMITS.thumbSide)
    expect((r?.width ?? 0) / (r?.height ?? 1)).toBeCloseTo(2, 1)
    expect(t?.size).toBeLessThan(20_000)
  })
})

describe('"Download as a single file" and "Share a copy"', () => {
  const content = (() => {
    const doc = createMapDoc()
    ensureRoot(doc, 'Plan')
    return Y.encodeStateAsUpdate(doc.ydoc)
  })()

  async function stores() {
    const images = new MemoryImageStore()
    const attachments = new MemoryImageStore()
    for (const [id, kb] of [
      ['p-a', 40],
      ['p-b', 60],
    ] as const) {
      const blob = new Blob([new Uint8Array(kb * 1024).fill(kb)], { type: 'image/webp' })
      await images.put({ id, blob, width: 800, height: 600, type: 'image/webp', size: blob.size })
    }
    return { images, attachments }
  }
  const input = { type: 'map' as const, name: 'Plan', createdAt: 1, modifiedAt: 2, content, imageIds: ['p-a', 'p-b', 'p-a'] }

  it('a bundle is a zip: the map file plus a pictures folder, each picture once', async () => {
    const bytes = await makeBundle(input, await stores())
    expect(isZip(bytes)).toBe(true)
    const opened = openWishtaaFile(bytes)
    expect(opened.name).toBe('Plan')
    expect(opened.missing).toBe(0)
    expect(opened.images.map((i) => i.id).sort()).toEqual(['p-a', 'p-b'])
    expect(opened.images.find((i) => i.id === 'p-b')?.size).toBe(60 * 1024)
    expect(bytes.length).toBeLessThan(110 * 1024 + 4096) // about the pictures themselves, nothing doubled
  })

  it('a shared copy is one plain file with the pictures inside', async () => {
    const text = await makeSharedCopy(input, await stores())
    expect(isZip(new TextEncoder().encode(text))).toBe(false)
    const opened = openWishtaaFile(new TextEncoder().encode(text))
    expect(opened.images.map((i) => i.id).sort()).toEqual(['p-a', 'p-b'])
    expect(opened.version).toBe(1)
  })

  it('a bundle with a picture left out still opens, and says how many are missing', async () => {
    const full = await makeBundle(input, await stores())
    const { unzipSync, zipSync } = await import('fflate')
    const parts = unzipSync(full)
    delete parts['pictures/p-a.webp']
    const opened = openWishtaaFile(zipSync(parts))
    expect(opened.missing).toBe(1)
    expect(opened.images.map((i) => i.id)).toEqual(['p-b'])
  })

  it('a zip that is not a bundle is refused', async () => {
    const { zipSync, strToU8 } = await import('fflate')
    expect(() => openWishtaaFile(zipSync({ 'hello.txt': strToU8('hi') }))).toThrow(/not a Wishtaa Maps bundle/)
  })
})

describe('upload progress text', () => {
  it('names the count and the time left once a batch is big enough', () => {
    expect(uploadingText({ pictures: 3, batchTotal: 3, batchDone: 0, etaSeconds: null })).toBe('3 pictures uploading')
    expect(uploadingText({ pictures: 380, batchTotal: 500, batchDone: 119, etaSeconds: 372 })).toBe('Uploading pictures 120 of 500, about 6 minutes left')
    expect(uploadingText({ pictures: 400, batchTotal: 500, batchDone: 100, etaSeconds: null })).toBe('Uploading pictures 101 of 500')
    expect(uploadingText({ pictures: 8, batchTotal: 500, batchDone: 492, etaSeconds: 20 })).toMatch(/less than a minute left/)
  })
})

describe('a downloaded picture must match its content hash', () => {
  it('accepts the right bytes, rejects different ones, and cannot check older ids', async () => {
    const { matchesId } = await import('./verify')
    const { pictureIdOf } = await import('./sha256')
    const good = new Blob([new Uint8Array(1000).fill(5)], { type: 'image/webp' })
    const id = await pictureIdOf(good)
    expect(await matchesId(id, good)).toBe(true)
    expect(await matchesId(id, new Blob([new Uint8Array(1000).fill(6)], { type: 'image/webp' }))).toBe(false)
    expect(await matchesId('old-style-id', good)).toBe(true)
  })
})
