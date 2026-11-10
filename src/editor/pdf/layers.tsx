import { useMemo, useRef, useState } from 'react'
import type { PdfHandle } from '@/core/pdf/engine'
import { clamp01, fromShown, rectFrom } from '@/core/pdf/geometry'
import type { PageLines } from '@/core/pdf/text'
import type { PdfSource, Point, Rect } from '@/core/pdf/types'
import { DrawLayer, DRAW_TOOLS, EraseLayer, MarkupLayer, parseLink, type NewShape } from '../markup/layers'
import { useEditor } from '../store'
import type { PageBox } from './PageView'
import { captureArea } from './capture'
import { setLasso, setPdfPage } from './actions'
import { LassoDraw, LassoSelection } from './LassoLayer'
import { withMove, type Move } from './lasso'
import { addMarkup, deleteMarkup, markupOfPage } from './markup'
import { hasStyle } from './toolPrefs'

export { parseLink }

/** A point in a pointer event as a fraction of the page as it is READ, given the page element it happened over (which may be turned). */
export function pagePoint(e: { clientX: number; clientY: number }, pageEl: Element, rotation: PageBox['rotation']): Point {
  const b = pageEl.getBoundingClientRect()
  return fromShown([clamp01((e.clientX - b.left) / b.width), clamp01((e.clientY - b.top) / b.height)], rotation)
}

/** What is drawn above a page's text: the markup, and the tool the person is using. */
export function PageLayers({ source, handle, n, box }: { source: PdfSource; handle: PdfHandle; n: number; box: PageBox; lines: PageLines | null }) {
  const tool = useEditor((s) => s.pdfPanel.tool)
  const readOnly = useEditor((s) => s.readOnly)
  const all = useEditor((s) => s.pdf.markup)
  const markId = useEditor((s) => s.pdfPanel.markId)
  const style = useEditor((s) => (hasStyle(tool) ? s.pdfPanel.styles[tool] : s.pdfPanel.styles.pen))
  const list = useMemo(() => markupOfPage(all, source.id, n), [all, source.id, n])
  // Markup picked with the lasso, and what a drag in progress would do to it (shown without touching the map until it is let go).
  const lasso = useEditor((s) => s.pdfPanel.lasso)
  const [preview, setPreview] = useState<Move | null>(null)
  const picked = useMemo(() => (lasso && lasso.sourceId === source.id && lasso.page === n ? lasso.ids.filter((id) => list.some((m) => m.id === id)) : []), [lasso, source.id, n, list])
  const shown = useMemo(() => (preview && picked.length ? withMove(list, picked, preview) : list), [list, picked, preview])
  const toPoint = (e: { clientX: number; clientY: number }, el: Element) => pagePoint(e, el, box.rotation)
  const add = (m: NewShape) => void addMarkup({ sourceId: source.id, page: n, ...m })
  return (
    <>
      {shown.length > 0 && <MarkupLayer list={shown} box={box} markId={markId} onGoPage={setPdfPage} />}
      {!readOnly && tool === 'capture' && <CaptureLayer source={source} handle={handle} n={n} box={box} />}
      {!readOnly && tool === 'eraser' && list.length > 0 && <EraseLayer list={list} surface="[data-page]" toPoint={toPoint} onErase={deleteMarkup} />}
      {!readOnly && tool === 'lasso' && <LassoDraw list={list} box={box} surface="[data-page]" toPoint={toPoint} onPick={(ids) => setLasso(ids.length ? { sourceId: source.id, page: n, ids } : null)} />}
      {!readOnly && tool === 'lasso' && picked.length > 0 && <LassoSelection list={list} ids={picked} box={box} rotationOf={toPoint} onPreview={setPreview} onDone={() => setLasso(null)} />}
      {!readOnly && DRAW_TOOLS.includes(tool) && <DrawLayer tool={tool} style={style} box={box} surface="[data-page]" toPoint={toPoint} onAdd={add} linkPages={source.pages} />}
    </>
  )
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
