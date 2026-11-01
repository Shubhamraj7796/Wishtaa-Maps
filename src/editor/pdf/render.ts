import type { PdfHandle } from '@/core/pdf/engine'
import { PDF_LIMITS } from '@/core/pdf/types'

/** At most a couple of pages are drawn at the same moment, so a fast scroll through 200 pages never piles work up. */
class Queue {
  private waiting: (() => void)[] = []
  private busy = 0
  constructor(private limit: number) {}
  async run<T>(fn: () => Promise<T>, cancelled: () => boolean): Promise<T | null> {
    while (this.busy >= this.limit) await new Promise<void>((r) => this.waiting.push(r))
    if (cancelled()) {
      this.waiting.shift()?.()
      return null
    }
    this.busy++
    try {
      return await fn()
    } finally {
      this.busy--
      this.waiting.shift()?.()
    }
  }
}
const queue = new Queue(PDF_LIMITS.concurrentRenders)

export interface Rendering {
  /** Stops it (the page scrolled away, or the zoom changed). Safe to call any time. */
  cancel(): void
  done: Promise<boolean>
}

/**
 * Draws page n into `canvas` at `cssScale` CSS pixels per point (with the screen's pixel density, capped so one page never takes more
 * than about 16 million pixels). The page is drawn as it is READ (its own rotation); turning it for the person is done by CSS.
 */
export function renderPage(handle: PdfHandle, n: number, canvas: HTMLCanvasElement, cssScale: number): Rendering {
  let stopped = false
  let task: { cancel(): void } | null = null
  const done = (async () => {
    const result = await queue.run(async () => {
      if (stopped) return false
      const page = await handle.page(n)
      try {
        let scale = cssScale * Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1)
        let vp = page.getViewport({ scale })
        const px = vp.width * vp.height
        if (px > PDF_LIMITS.maxPagePixels) {
          scale *= Math.sqrt(PDF_LIMITS.maxPagePixels / px)
          vp = page.getViewport({ scale })
        }
        // Drawn off screen, then put in place in one go, so a redraw never flashes blank.
        const off = document.createElement('canvas')
        off.width = Math.max(1, Math.floor(vp.width))
        off.height = Math.max(1, Math.floor(vp.height))
        const ctx = off.getContext('2d')
        if (!ctx) return false
        const render = page.render({ canvasContext: ctx, viewport: vp })
        task = render
        await render.promise
        if (stopped) return false
        canvas.width = off.width
        canvas.height = off.height
        canvas.getContext('2d')?.drawImage(off, 0, 0)
        off.width = 0
        return true
      } finally {
        page.cleanup()
      }
    }, () => stopped)
    return result === true
  })().catch(() => false)
  return {
    cancel() {
      stopped = true
      task?.cancel()
    },
    done,
  }
}

/** Gives the memory of a canvas back (a page that has scrolled far away). */
export function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0
  canvas.height = 0
}

/**
 * A picture (PNG) of part of a page, drawn fresh from the PDF so it is sharp however far the screen is zoomed. `rect` is in page
 * fractions as the page is read; the longest side comes out about `longest` pixels (at least 1 pixel per point, never over 3).
 */
export async function renderRegion(handle: PdfHandle, n: number, rect: { x: number; y: number; w: number; h: number }, longest = 1800): Promise<Blob | null> {
  const result = await queue.run(async () => {
    const page = await handle.page(n)
    try {
      const base = page.getViewport({ scale: 1 })
      const w = rect.w * base.width
      const h = rect.h * base.height
      const scale = Math.min(3, Math.max(1, longest / Math.max(w, h)))
      const vp = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(w * scale))
      canvas.height = Math.max(1, Math.round(h * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, viewport: vp, transform: [1, 0, 0, 1, -rect.x * base.width * scale, -rect.y * base.height * scale] }).promise
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
      canvas.width = 0
      return blob
    } finally {
      page.cleanup()
    }
  }, () => false)
  return result
}
