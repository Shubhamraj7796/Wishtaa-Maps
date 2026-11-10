import { useEffect, useRef, useState } from 'react'
import type { PdfHandle } from '@/core/pdf/engine'
import { setPdfPage } from './actions'
import { releaseCanvas, renderPage } from './render'
import { docFilter, PAPER, type DocColor } from './docColor'

/** Width of a thumbnail, in CSS pixels. */
export const THUMB_W = 64

/**
 * The optional strip of page thumbnails beside the pages (off by default). Only the thumbnails near the strip's own view are drawn, and a
 * thumbnail that scrolls out of view lets go of its picture, so 200 pages cost the same as 20. Clicking one goes to that page.
 */
export function Thumbs({ handle, pages, page, ratio, docColor }: { handle: PdfHandle; pages: number[]; page: number; ratio: number; docColor?: DocColor }) {
  const strip = useRef<HTMLDivElement>(null)
  // The thumbnail of the page being looked at stays in view.
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>(`[data-thumb="${page}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [page])
  return (
    <div ref={strip} data-thumbs role="navigation" aria-label="Page thumbnails" className="flex min-h-0 shrink-0 flex-col items-center gap-2 overflow-y-auto border-r border-line bg-surface px-1.5 py-2" style={{ width: THUMB_W + 16 }}>
      {pages.map((n) => (
        <Thumb key={n} handle={handle} n={n} current={n === page} ratio={ratio} root={strip} docColor={docColor} />
      ))}
    </div>
  )
}

function Thumb({ handle, n, current, ratio, root, docColor }: { handle: PdfHandle; n: number; current: boolean; ratio: number; root: React.RefObject<HTMLDivElement | null>; docColor?: DocColor }) {
  const box = useRef<HTMLButtonElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  // Without IntersectionObserver (old browsers, tests) the first few are drawn.
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined' && n <= 12)
  useEffect(() => {
    const el = box.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => setNear(entries.some((e) => e.isIntersecting)), { root: root.current, rootMargin: '300px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [root])
  useEffect(() => {
    const c = canvas.current
    if (!near || !c) return
    const job = renderPage(handle, n, c, THUMB_W / 595) // the scale is per point; a thumbnail is about THUMB_W wide for an A4 page
    return () => {
      job.cancel()
      releaseCanvas(c)
    }
  }, [near, handle, n])
  return (
    <button
      ref={box}
      type="button"
      data-thumb={n}
      aria-label={`Go to page ${n}`}
      aria-current={current ? 'true' : undefined}
      onClick={() => setPdfPage(n)}
      className={`relative shrink-0 rounded-sm shadow ${current ? 'outline outline-2 outline-brand' : 'hover:outline hover:outline-1 hover:outline-line'} [@media(pointer:coarse)]:min-h-11`}
      style={{ width: THUMB_W, height: Math.round(THUMB_W * ratio), background: PAPER[docColor ?? 'light'] }}
    >
      {near && <canvas ref={canvas} className="absolute left-0 top-0 h-full w-full" style={{ filter: docFilter(docColor) }} aria-hidden="true" />}
      <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 text-[10px] leading-4 text-white">{n}</span>
    </button>
  )
}
