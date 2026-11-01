import { useRef, useState } from 'react'
import type { PdfHandle } from '@/core/pdf/engine'
import { clamp01, fromShown, rectFrom } from '@/core/pdf/geometry'
import type { PageLines } from '@/core/pdf/text'
import type { PdfSource, Point, Rect } from '@/core/pdf/types'
import { useEditor } from '../store'
import type { PageBox } from './PageView'
import { captureArea } from './capture'

/** A point in a pointer event as a fraction of the page as it is READ, given the page element it happened over (which may be turned). */
export function pagePoint(e: { clientX: number; clientY: number }, pageEl: Element, rotation: PageBox['rotation']) {
  const b = pageEl.getBoundingClientRect()
  return fromShown([clamp01((e.clientX - b.left) / b.width), clamp01((e.clientY - b.top) / b.height)], rotation)
}

/** What is drawn above a page's text: markup, and the tool the person is using. */
export function PageLayers({ source, handle, n, box }: { source: PdfSource; handle: PdfHandle; n: number; box: PageBox; lines: PageLines | null }) {
  const tool = useEditor((s) => s.pdfPanel.tool)
  return tool === 'capture' ? <CaptureLayer source={source} handle={handle} n={n} box={box} /> : null
}

/** Drag a rectangle over the page: it is taken as a picture and goes through the Add picture steps. */
function CaptureLayer({ handle, n, box, source }: { source: PdfSource; handle: PdfHandle; n: number; box: PageBox }) {
  const [drag, setDrag] = useState<{ a: Point; b: Point } | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const pageEl = () => root.current?.closest('[data-page]') ?? null
  const rect: Rect | null = drag ? rectFrom(drag.a, drag.b) : null
  return (
    <div
      ref={root}
      data-capture-layer
      className="absolute inset-0 cursor-crosshair touch-none"
      onPointerDown={(e) => {
        const el = pageEl()
        if (!el) return
        e.currentTarget.setPointerCapture(e.pointerId)
        const p = pagePoint(e, el, box.rotation)
        setDrag({ a: p, b: p })
      }}
      onPointerMove={(e) => {
        const el = pageEl()
        if (drag && el) setDrag({ a: drag.a, b: pagePoint(e, el, box.rotation) })
      }}
      onPointerUp={() => {
        const r = rect
        setDrag(null)
        if (r && r.w * box.w > 12 && r.h * box.h > 12) void captureArea(source, handle, n, r)
      }}
      onPointerCancel={() => setDrag(null)}
    >
      {rect && <div className="pointer-events-none absolute border-2 border-brand bg-brand/20" style={{ left: rect.x * box.w * box.scale, top: rect.y * box.h * box.scale, width: rect.w * box.w * box.scale, height: rect.h * box.h * box.scale }} />}
    </div>
  )
}
