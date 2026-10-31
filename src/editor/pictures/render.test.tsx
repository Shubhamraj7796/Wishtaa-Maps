// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotUploadedYet } from '@/core/drive/pictures'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { PICTURE_LIMITS } from '@/core/images/limits'
import { addChild, setImage } from '@/core/model/commands'
import type { Codec, Decoded, Raster } from '@/core/images/pipeline'
import { fakeCodec } from '../../test/fakeCodec'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { imageStore, setPictureFallback, useImageUrl } from '../images'
import { closeFile, mapDoc, openFile } from '../session'
import { useEditor } from '../store'
import { setPictureCodec } from './flow'
import { applyOptimize, planOptimize } from './optimize'

let n = 0
URL.createObjectURL = vi.fn(() => `blob:fake-${++n}`) as never
URL.revokeObjectURL = vi.fn()

function Show({ id, thumb = false }: { id: string; thumb?: boolean }) {
  const { url, pending, missing } = useImageUrl(id, { thumb })
  return <output data-testid={`u-${id}`}>{url ?? (pending ? 'pending' : missing ? 'missing' : 'none')}</output>
}
const text = (id: string) => screen.getByTestId(`u-${id}`).textContent

const { codec } = fakeCodec({ webp: true })

/** Every picture decodes as 3000 x 2000 and "compresses" to 30% of its bytes as WebP. */
const squeeze: Codec = {
  async decode(blob: Blob): Promise<Decoded> {
    return { width: 3000, height: 2000, raw: { bytes: blob.size }, close: () => undefined }
  },
  async render(src: Decoded, o): Promise<Raster> {
    return { width: o.width, height: o.height, raw: src.raw, pixels: () => ({ data: new Uint8ClampedArray(o.width * o.height * 4).fill(255) }) }
  },
  async encode(r: Raster, type: string): Promise<Blob | null> {
    return new Blob([new Uint8Array(Math.round((r.raw as { bytes: number }).bytes * (type === 'image/webp' ? 0.3 : 0.4)))], { type })
  },
  canEncode: async () => true,
}
const put = (id: string, blob: Blob = new Blob([id]), w = 10, h = 10) => imageStore.put({ id, width: w, height: h, type: blob.type || 'image/png', size: blob.size, blob })

beforeEach(() => {
  installMemoryLocalStorage()
  setPictureCodec(codec)
})
afterEach(() => {
  cleanup()
  setPictureFallback(null)
})

describe('a picture this device does not have is fetched when it is shown, once', () => {
  it('downloads it lazily, keeps it, and shows it; a second place showing it does not download again', async () => {
    const full = vi.fn(async (id: string) => {
      await put(id)
      return (await imageStore.get(id)) ?? null
    })
    setPictureFallback({ full, thumb: async () => null })
    render(
      <>
        <Show id="far-1" />
        <Show id="far-1" />
      </>
    )
    await waitFor(() => expect(screen.getAllByTestId('u-far-1')[0]?.textContent).toMatch(/^blob:/))
    expect(full).toHaveBeenCalledTimes(1)
    cleanup()
    render(<Show id="far-1" />)
    await waitFor(() => expect(text('far-1')).toMatch(/^blob:/))
    expect(full).toHaveBeenCalledTimes(1) // cached in this browser now
  })

  it('shows "still uploading" when the other device has not finished sending it', async () => {
    setPictureFallback({
      full: async () => {
        throw new NotUploadedYet()
      },
      thumb: async () => null,
    })
    render(<Show id="late-1" />)
    await waitFor(() => expect(text('late-1')).toBe('pending'))
  })

  it('reads at most 4 pictures at the same time, however many are on screen', async () => {
    let now = 0
    let peak = 0
    setPictureFallback({
      full: async (id) => {
        now++
        peak = Math.max(peak, now)
        await new Promise((r) => setTimeout(r, 15))
        now--
        await put(id)
        return (await imageStore.get(id)) ?? null
      },
      thumb: async () => null,
    })
    const ids = Array.from({ length: 14 }, (_, i) => `many-${i}`)
    render(
      <>
        {ids.map((id) => (
          <Show key={id} id={id} />
        ))}
      </>
    )
    await waitFor(() => expect(ids.every((id) => /^blob:/.test(text(id) ?? ''))).toBe(true), { timeout: 3000 })
    expect(peak).toBeLessThanOrEqual(PICTURE_LIMITS.concurrentLoads)
    expect(peak).toBeGreaterThan(1)
  })
})

describe('thumbnails come first', () => {
  it('the small version is shown without downloading the full picture', async () => {
    const full = vi.fn(async () => null)
    const thumb = vi.fn(async () => new Blob(['t'], { type: 'image/webp' }))
    setPictureFallback({ full, thumb })
    render(<Show id="th-1" thumb />)
    await waitFor(() => expect(text('th-1')).toMatch(/^blob:/))
    expect(full).not.toHaveBeenCalled()
    expect(thumb).toHaveBeenCalledTimes(1)
    expect(await imageStore.getThumb('th-1')).toBeTruthy() // kept for next time
  })

  it('a stored small version is used straight away; the full picture is made on demand later', async () => {
    await imageStore.putThumb('th-2', new Blob(['t'], { type: 'image/webp' }))
    const thumb = vi.fn(async () => null)
    setPictureFallback({ full: async () => null, thumb })
    const { rerender } = render(<Show id="th-2" thumb />)
    await waitFor(() => expect(text('th-2')).toMatch(/^blob:/))
    const small = text('th-2')
    expect(thumb).not.toHaveBeenCalled()
    await put('th-2', new Blob(['full-size'], { type: 'image/png' }))
    rerender(<Show id="th-2" thumb={false} />)
    await waitFor(() => expect(text('th-2')).not.toBe(small))
    expect(text('th-2')).toMatch(/^blob:/)
  })
})

describe('Optimize pictures', () => {
  let a = ''
  let b = ''
  beforeEach(async () => {
    const repo = new RepositoryCore(new MemoryBackend(), () => Date.now())
    const f = await repo.create({ type: 'kb', name: 'Opt', content: buildStarterContent('kb') })
    await openFile(f.id, repo)
    a = addChild(mapDoc, useEditor.getState().rootId, 'A')
    b = addChild(mapDoc, useEditor.getState().rootId, 'B')
    await put('big-1', new Blob([new Uint8Array(600 * 1024)], { type: 'image/jpeg' }), 3000, 2000)
    await put('small-1', new Blob([new Uint8Array(4 * 1024)], { type: 'image/webp' }), 300, 200)
    setImage(mapDoc, a, { imageId: 'big-1', width: 300, height: 200 })
    setImage(mapDoc, b, { imageId: 'big-1', width: 150, height: 100 }) // the same picture, shown smaller
    await act(async () => void (await new Promise((r) => setTimeout(r, 30))))
    mapDoc.undo.stopCapturing()
    mapDoc.undo.clear()
  })
  afterEach(async () => {
    await closeFile()
  })

  it('works out the saving first and changes nothing', async () => {
    const plan = await planOptimize(undefined, squeeze)
    expect(plan.total).toBe(1)
    expect(plan.items).toHaveLength(1)
    expect(plan.after).toBeLessThan(plan.before * 0.75)
    expect(useEditor.getState().topics[a]?.image?.imageId).toBe('big-1')
    expect(mapDoc.undo.undoStack.length).toBe(0)
  })

  it('swaps every use of the picture in ONE undo step, keeps display sizes, and Undo brings the original back', async () => {
    const plan = await planOptimize(undefined, squeeze)
    expect(await applyOptimize(plan)).toBe(1)
    const ta = useEditor.getState().topics[a]?.image
    const tb = useEditor.getState().topics[b]?.image
    expect(ta?.imageId).not.toBe('big-1')
    expect(tb?.imageId).toBe(ta?.imageId) // still one picture, used twice
    expect([ta?.width, ta?.height, tb?.width, tb?.height]).toEqual([300, 200, 150, 100])
    expect(mapDoc.undo.undoStack.length).toBe(1)
    mapDoc.undo.undo()
    await act(async () => void (await new Promise((r) => setTimeout(r, 10))))
    expect(useEditor.getState().topics[a]?.image?.imageId).toBe('big-1')
    expect(useEditor.getState().topics[b]?.image?.imageId).toBe('big-1')
    expect(await imageStore.getMeta('big-1')).toBeTruthy() // the original is still stored
  })
})
