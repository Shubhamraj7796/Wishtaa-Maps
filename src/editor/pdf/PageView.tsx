import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { PdfHandle } from '@/core/pdf/engine'
import type { PageLines } from '@/core/pdf/text'
import type { Rect, Turn } from '@/core/pdf/types'
import { releaseCanvas, renderPage } from './render'
import { docFilter, PAPER, type DocColor } from './docColor'

/** How a page is placed: the page as it is READ, in CSS pixels; and how the person has turned it. */
export interface PageBox {
  /** Size of the page as read, in points. */
  w: number
  h: number
  /** CSS pixels per point. */
  scale: number
  rotation: Turn
}

/** The width and height of the page on screen once turned. */
export const shownPx = (b: PageBox) => (b.rotation === 90 || b.rotation === 270 ? { w: b.h * b.scale, h: b.w * b.scale } : { w: b.w * b.scale, h: b.h * b.scale })

/** The CSS that turns the page as read into the turned page (the page box is w*scale by h*scale, its top left at the origin). */
export function turnStyle(b: PageBox): React.CSSProperties {
  const w = b.w * b.scale
  const h = b.h * b.scale
  const t = b.rotation === 90 ? `translate(${h}px, 0) rotate(90deg)` : b.rotation === 180 ? `translate(${w}px, ${h}px) rotate(180deg)` : b.rotation === 270 ? `translate(0, ${w}px) rotate(270deg)` : undefined
  return { position: 'absolute', left: 0, top: 0, width: w, height: h, transformOrigin: '0 0', ...(t ? { transform: t } : {}) }
}

/**
 * One page: the picture of it, an invisible layer of its text (so words can be selected), and whatever the tools draw on it. All of
 * them share the page's own coordinates; turning the page turns the lot together.
 */
export const PageView = memo(function PageView({
  handle,
  n,
  box,
  lines,
  selectable,
  focus,
  docColor,
  children,
}: {
  handle: PdfHandle
  n: number
  box: PageBox
  /** The text of the page, once it is known. */
  lines: PageLines | null
  /** Text can be selected here (the Select and text-marking tools). */
  selectable: boolean
  /** A passage to mark for a moment (a source link was followed). */
  focus: Rect | null
  /** Document colour: the filter goes on the page PICTURE only; the layers above keep their own colours. */
  docColor?: DocColor
  /** Layers drawn above the text (markup, the tool's own drawing). */
  children?: ReactNode
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [drawn, setDrawn] = useState(false)
  const shown = shownPx(box)

  // Draws the page when it appears or the zoom settles; lets the memory go when it leaves.
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    setDrawn(false)
    let job: ReturnType<typeof renderPage> | null = null
    const timer = setTimeout(() => {
      job = renderPage(handle, n, c, box.scale)
      void job.done.then((ok) => ok && setDrawn(true))
    }, 60) // a zoom in progress does not draw every step
    return () => {
      clearTimeout(timer)
      job?.cancel()
    }
  }, [handle, n, box.scale])
  useEffect(() => {
    const c = canvas.current
    return () => {
      if (c) releaseCanvas(c)
    }
  }, [])

  return (
    <div className="relative mx-auto shadow" style={{ width: shown.w, height: shown.h, background: PAPER[docColor ?? 'light'] }} data-doc-color={docColor ?? 'light'} data-page={n} aria-label={`Page ${n}`}>
      <div style={turnStyle(box)}>
        <canvas ref={canvas} className="absolute left-0 top-0 h-full w-full" style={{ filter: docFilter(docColor) }} data-page-picture aria-hidden="true" />
        {!drawn && <div className="absolute inset-0 grid place-items-center text-xs text-neutral-400">Page {n}</div>}
        {lines && <TextLayer lines={lines} scale={box.scale} selectable={selectable} />}
        {focus && (
          <div
            data-focus-rect
            className="pointer-events-none absolute animate-pulse rounded-sm border-2 border-brand bg-brand/25"
            style={{ left: focus.x * box.w * box.scale - 3, top: focus.y * box.h * box.scale - 3, width: focus.w * box.w * box.scale + 6, height: focus.h * box.h * box.scale + 6 }}
          />
        )}
        {children}
      </div>
    </div>
  )
})

/** The words of the page, invisible, placed over their pictures. Each line is stretched to the width the picture has for it. */
function TextLayer({ lines, scale, selectable }: { lines: PageLines; scale: number; selectable: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const spans = [...el.children] as HTMLElement[]
    const natural = spans.map((s) => {
      s.style.transform = ''
      return s.getBoundingClientRect().width
    })
    spans.forEach((s, i) => {
      const want = (lines.lines[i]?.w ?? 0) * scale
      const have = natural[i] ?? 0
      if (have > 1 && want > 1) s.style.transform = `scaleX(${want / have})`
    })
  }, [lines, scale])
  return (
    <div ref={root} className="absolute inset-0" data-text-layer style={{ userSelect: selectable ? 'text' : 'none', pointerEvents: selectable ? 'auto' : 'none', cursor: selectable ? 'text' : undefined }}>
      {lines.lines.map((l, i) => (
        <div
          key={i}
          data-line={i}
          style={{ position: 'absolute', left: l.x * scale, top: l.y * scale, fontSize: l.h * scale, lineHeight: `${l.h * scale}px`, whiteSpace: 'pre', color: 'transparent', transformOrigin: '0 0', display: 'inline-block' }}
        >
          {l.text}
        </div>
      ))}
    </div>
  )
}
