import { useEffect, useMemo, useRef, useState } from 'react'
import type { PdfHandle } from '@/core/pdf/engine'
import { clamp01, fromShown, rectFrom } from '@/core/pdf/geometry'
import type { PageLines } from '@/core/pdf/text'
import type { MarkupObject, PdfSource, Point, Rect } from '@/core/pdf/types'
import { showNotice } from '../notice'
import { useEditor, type PdfTool } from '../store'
import type { PageBox } from './PageView'
import { captureArea } from './capture'
import { setPdfPage } from './actions'
import { addMarkup, boundsOf, deleteMarkup, markupAt, markupOfPage } from './markup'
import { hasStyle, strokeWidth, textSize, type ToolStyle } from './toolPrefs'

/** A point in a pointer event as a fraction of the page as it is READ, given the page element it happened over (which may be turned). */
export function pagePoint(e: { clientX: number; clientY: number }, pageEl: Element, rotation: PageBox['rotation']): Point {
  const b = pageEl.getBoundingClientRect()
  return fromShown([clamp01((e.clientX - b.left) / b.width), clamp01((e.clientY - b.top) / b.height)], rotation)
}

const DRAW_TOOLS: readonly PdfTool[] = ['pen', 'text', 'rect', 'ellipse', 'line', 'arrow', 'whiteout', 'link']

/** Once a pen has touched the screen, fingers scroll instead of drawing (so a hand resting on the glass does no harm). */
let penSeen = false

/** What is drawn above a page's text: the markup, and the tool the person is using. */
export function PageLayers({ source, handle, n, box }: { source: PdfSource; handle: PdfHandle; n: number; box: PageBox; lines: PageLines | null }) {
  const tool = useEditor((s) => s.pdfPanel.tool)
  const readOnly = useEditor((s) => s.readOnly)
  const all = useEditor((s) => s.pdf.markup)
  const markId = useEditor((s) => s.pdfPanel.markId)
  const list = useMemo(() => markupOfPage(all, source.id, n), [all, source.id, n])
  return (
    <>
      {list.length > 0 && <MarkupLayer list={list} box={box} markId={markId} />}
      {!readOnly && tool === 'capture' && <CaptureLayer source={source} handle={handle} n={n} box={box} />}
      {!readOnly && tool === 'eraser' && list.length > 0 && <EraseLayer list={list} box={box} />}
      {!readOnly && DRAW_TOOLS.includes(tool) && <DrawLayer source={source} n={n} box={box} tool={tool} />}
    </>
  )
}

const px = (v: number, size: number) => v * size

/** The arrow's head: a small triangle at `to`. */
function arrowHead(from: Point, to: Point, W: number, H: number, size: number): string {
  const x1 = from[0] * W
  const y1 = from[1] * H
  const x2 = to[0] * W
  const y2 = to[1] * H
  const a = Math.atan2(y2 - y1, x2 - x1)
  const p = (k: number) => `${x2 - size * Math.cos(a + k)},${y2 - size * Math.sin(a + k)}`
  return `${x2},${y2} ${p(0.45)} ${p(-0.45)}`
}

/** All the markup of one page, drawn in the page's own coordinates (so it turns and zooms with it). */
function MarkupLayer({ list, box, markId }: { list: MarkupObject[]; box: PageBox; markId: string | null }) {
  const W = box.w * box.scale
  const H = box.h * box.scale
  const texts = list.filter((m) => m.kind === 'text')
  const selected = markId ? list.find((m) => m.id === markId) : undefined
  const sb = selected && boundsOf(selected)
  return (
    <>
      <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={W} height={H} data-markup-layer aria-hidden="true">
        {list.map((m) => {
          const sw = Math.max(1, (m.width ?? 0.004) * W)
          switch (m.kind) {
            case 'highlight':
              return m.rects?.map((r, i) => <rect key={`${m.id}${i}`} data-markup={m.id} x={px(r.x, W)} y={px(r.y, H)} width={px(r.w, W)} height={px(r.h, H)} fill={m.color} fillOpacity={m.opacity ?? 0.4} style={{ mixBlendMode: 'multiply' }} />)
            case 'underline':
            case 'strike':
              return m.rects?.map((r, i) => {
                const y = px(m.kind === 'underline' ? r.y + r.h * 0.92 : r.y + r.h * 0.55, H)
                return <line key={`${m.id}${i}`} data-markup={m.id} x1={px(r.x, W)} x2={px(r.x + r.w, W)} y1={y} y2={y} stroke={m.color} strokeWidth={m.width ? Math.max(1, m.width * W) : Math.max(1.5, r.h * H * 0.08)} />
              })
            case 'pen':
              return <polyline key={m.id} data-markup={m.id} points={(m.points ?? []).map((p) => `${p[0] * W},${p[1] * H}`).join(' ')} fill="none" stroke={m.color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
            case 'rect':
            case 'whiteout':
            case 'link': {
              const r = m.rects?.[0]
              if (!r) return null
              if (m.kind === 'link') {
                const go = () => (m.link && 'page' in m.link ? setPdfPage(m.link.page) : m.link && 'url' in m.link ? window.open(m.link.url, '_blank', 'noopener,noreferrer') : undefined)
                return <rect key={m.id} data-markup={m.id} data-link x={px(r.x, W)} y={px(r.y, H)} width={px(r.w, W)} height={px(r.h, H)} fill={m.color} fillOpacity={0.08} stroke={m.color} strokeDasharray="4 3" strokeWidth={1} style={{ pointerEvents: 'all', cursor: 'pointer' }} onClick={go} />
              }
              return <rect key={m.id} data-markup={m.id} x={px(r.x, W)} y={px(r.y, H)} width={px(r.w, W)} height={px(r.h, H)} fill={m.kind === 'whiteout' ? '#ffffff' : 'none'} stroke={m.kind === 'whiteout' ? 'none' : m.color} strokeWidth={sw} />
            }
            case 'ellipse': {
              const r = m.rects?.[0]
              return r ? <ellipse key={m.id} data-markup={m.id} cx={px(r.x + r.w / 2, W)} cy={px(r.y + r.h / 2, H)} rx={px(r.w / 2, W)} ry={px(r.h / 2, H)} fill="none" stroke={m.color} strokeWidth={sw} /> : null
            }
            case 'line':
            case 'arrow': {
              const [a, b] = m.points ?? []
              if (!a || !b) return null
              return (
                <g key={m.id} data-markup={m.id}>
                  <line x1={a[0] * W} y1={a[1] * H} x2={b[0] * W} y2={b[1] * H} stroke={m.color} strokeWidth={sw} strokeLinecap="round" />
                  {m.kind === 'arrow' && <polygon points={arrowHead(a, b, W, H, Math.max(8, sw * 4))} fill={m.color} />}
                </g>
              )
            }
            default:
              return null
          }
        })}
        {sb && <rect x={px(sb.x, W) - 3} y={px(sb.y, H) - 3} width={px(sb.w, W) + 6} height={px(sb.h, H) + 6} fill="none" stroke="rgb(var(--c-brand))" strokeWidth={1.5} strokeDasharray="5 3" data-markup-selected={selected?.id} />}
      </svg>
      {texts.map((m) => {
        const r = m.rects?.[0]
        if (!r) return null
        return (
          <div key={m.id} data-markup={m.id} className="pointer-events-none absolute whitespace-pre-wrap leading-tight" style={{ left: r.x * W, top: r.y * H, width: r.w * W, height: r.h * H, color: m.color, fontSize: (m.fontSize ?? 0.02) * H, overflow: 'hidden' }}>
            {m.text}
          </div>
        )
      })}
    </>
  )
}

/** The pen and shape tools: the stroke is drawn as the finger or pen moves, and kept as markup when it is lifted. */
function DrawLayer({ source, n, box, tool }: { source: PdfSource; n: number; box: PageBox; tool: PdfTool }) {
  const style = useEditor((s) => (hasStyle(tool) ? s.pdfPanel.styles[tool] : s.pdfPanel.styles.pen))
  const color = style.color
  const pen = strokeWidth(style.size)
  const root = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<{ a: Point; b: Point; pts: Point[] } | null>(null)
  const [editor, setEditor] = useState<{ rect: Rect; kind: 'text' | 'link' } | null>(null)
  const [touchOk, setTouchOk] = useState(!penSeen)
  const W = box.w * box.scale
  const H = box.h * box.scale
  const pageEl = () => root.current?.closest('[data-page]') ?? null

  useEffect(() => setEditor(null), [tool])

  const finish = (d: { a: Point; b: Point; pts: Point[] }) => {
    const base = { sourceId: source.id, page: n, color }
    const stroke = strokeWidth(style.size)
    const rect = rectFrom(d.a, d.b)
    const big = rect.w * W > 6 || rect.h * H > 6
    switch (tool) {
      case 'pen':
        if (d.pts.length > 1) addMarkup({ ...base, kind: 'pen', points: d.pts, width: stroke })
        break
      case 'rect':
      case 'ellipse':
        if (big) addMarkup({ ...base, kind: tool, rects: [rect], width: stroke })
        break
      case 'whiteout':
        if (big) addMarkup({ ...base, kind: 'whiteout', color: '#ffffff', rects: [rect] })
        break
      case 'line':
      case 'arrow':
        if (Math.hypot((d.b[0] - d.a[0]) * W, (d.b[1] - d.a[1]) * H) > 8) addMarkup({ ...base, kind: tool, points: [d.a, d.b], width: stroke })
        break
      case 'text':
      case 'link': {
        const r = big ? rect : { x: Math.min(d.a[0], 0.7), y: Math.min(d.a[1], 0.96), w: 0.3, h: 0.04 }
        setEditor({ rect: r, kind: tool })
        break
      }
    }
  }

  return (
    <div
      ref={root}
      data-draw-layer={tool}
      className="absolute inset-0 cursor-crosshair"
      style={{ touchAction: touchOk ? 'none' : 'pan-x pan-y' }}
      onPointerDown={(e) => {
        if (e.pointerType === 'pen') {
          penSeen = true
          setTouchOk(false)
        }
        if (e.pointerType === 'touch' && penSeen) return // a resting hand scrolls, it does not draw
        if (e.pointerType === 'mouse' && e.button !== 0) return
        const el = pageEl()
        if (!el || editor) return
        e.currentTarget.setPointerCapture(e.pointerId)
        const p = pagePoint(e, el, box.rotation)
        setDraft({ a: p, b: p, pts: [p] })
      }}
      onPointerMove={(e) => {
        const el = pageEl()
        if (!draft || !el) return
        const events = tool === 'pen' && 'getCoalescedEvents' in e.nativeEvent ? (e.nativeEvent as PointerEvent).getCoalescedEvents() : []
        const moves = events.length ? events : [e.nativeEvent as PointerEvent]
        let pts = draft.pts
        let b = draft.b
        for (const ev of moves) {
          b = pagePoint(ev, el, box.rotation)
          const last = pts[pts.length - 1] as Point
          if (tool === 'pen' && Math.hypot((b[0] - last[0]) * W, (b[1] - last[1]) * H) >= 1.5) pts = [...pts, b]
        }
        setDraft({ a: draft.a, b, pts })
      }}
      onPointerUp={() => {
        const d = draft
        setDraft(null)
        if (d) finish(d)
      }}
      onPointerCancel={() => setDraft(null)}
    >
      {draft && (
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={W} height={H} aria-hidden="true">
          {tool === 'pen' && <polyline points={draft.pts.map((p) => `${p[0] * W},${p[1] * H}`).join(' ')} fill="none" stroke={color} strokeWidth={pen * W} strokeLinecap="round" strokeLinejoin="round" />}
          {(tool === 'rect' || tool === 'whiteout' || tool === 'text' || tool === 'link') && <DraftRect a={draft.a} b={draft.b} W={W} H={H} tool={tool} color={color} pen={pen} />}
          {tool === 'ellipse' && <DraftEllipse a={draft.a} b={draft.b} W={W} H={H} color={color} pen={pen} />}
          {(tool === 'line' || tool === 'arrow') && (
            <>
              <line x1={draft.a[0] * W} y1={draft.a[1] * H} x2={draft.b[0] * W} y2={draft.b[1] * H} stroke={color} strokeWidth={pen * W} strokeLinecap="round" />
              {tool === 'arrow' && <polygon points={arrowHead(draft.a, draft.b, W, H, Math.max(8, pen * W * 4))} fill={color} />}
            </>
          )}
        </svg>
      )}
      {editor && <InlineEditor source={source} n={n} box={box} rect={editor.rect} kind={editor.kind} style={style} done={() => setEditor(null)} />}
    </div>
  )
}

function DraftRect({ a, b, W, H, tool, color, pen }: { a: Point; b: Point; W: number; H: number; tool: PdfTool; color: string; pen: number }) {
  const r = rectFrom(a, b)
  return <rect x={r.x * W} y={r.y * H} width={r.w * W} height={r.h * H} fill={tool === 'whiteout' ? '#fff' : 'none'} stroke={tool === 'whiteout' ? '#9ca3af' : color} strokeWidth={tool === 'rect' ? pen * W : 1.5} strokeDasharray={tool === 'text' || tool === 'link' ? '4 3' : undefined} />
}

function DraftEllipse({ a, b, W, H, color, pen }: { a: Point; b: Point; W: number; H: number; color: string; pen: number }) {
  const r = rectFrom(a, b)
  return <ellipse cx={(r.x + r.w / 2) * W} cy={(r.y + r.h / 2) * H} rx={(r.w / 2) * W} ry={(r.h / 2) * H} fill="none" stroke={color} strokeWidth={pen * W} />
}

/** A link goes to a page of this PDF (a number) or a web address; anything else is refused. */
export function parseLink(input: string, pages: number): { page: number } | { url: string } | null {
  const t = input.trim()
  if (/^\d+$/.test(t)) {
    const page = Number(t)
    return page >= 1 && page <= pages ? { page } : null
  }
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`)
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:' ? { url: u.href } : null
  } catch {
    return null
  }
}

/** The small box for typing a text box's words or a link's target, right on the page. */
function InlineEditor({ source, n, box, rect, kind, style, done }: { source: PdfSource; n: number; box: PageBox; rect: Rect; kind: 'text' | 'link'; style: ToolStyle; done: () => void }) {
  const W = box.w * box.scale
  const H = box.h * box.scale
  const [value, setValue] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)
  useEffect(() => input.current?.focus(), [])
  const commit = () => {
    const text = value.trim()
    if (!text) return done()
    if (kind === 'text') {
      addMarkup({ sourceId: source.id, page: n, kind: 'text', color: style.color, rects: [rect], text, fontSize: textSize(style.size) })
    } else {
      const link = parseLink(text, source.pages)
      if (!link) {
        showNotice(`That is not a page of this PDF (1 to ${source.pages}) or a web address.`)
        return
      }
      addMarkup({ sourceId: source.id, page: n, kind: 'link', color: '#2563eb', rects: [rect], link })
    }
    done()
  }
  return (
    <div className="absolute z-10" style={{ left: rect.x * W, top: rect.y * H, width: Math.max(rect.w * W, 150) }} onPointerDown={(e) => e.stopPropagation()}>
      <textarea
        ref={input}
        value={value}
        rows={kind === 'text' ? 2 : 1}
        placeholder={kind === 'text' ? 'Type here' : 'Page number or web address'}
        aria-label={kind === 'text' ? 'Text box' : 'Link target'}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') done()
          if (e.key === 'Enter' && (kind === 'link' || e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            commit()
          }
        }}
        className="w-full resize rounded border border-brand bg-white p-1 text-black shadow"
        style={{ fontSize: Math.max(12, textSize(style.size) * H) }}
      />
      <div className="mt-1 flex gap-1 text-xs">
        <button type="button" className="rounded bg-brand px-2 py-1 font-semibold text-brand-ink [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:px-3" onClick={commit}>
          {kind === 'text' ? 'Add text' : 'Add link'}
        </button>
        <button type="button" className="rounded border border-line bg-white px-2 py-1 text-black [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:px-3" onClick={done}>
          Cancel
        </button>
      </div>
    </div>
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

/** The eraser: touch (or drag across) a piece of markup to delete it. Each piece deleted is one undo step. */
function EraseLayer({ list, box }: { list: MarkupObject[]; box: PageBox }) {
  const root = useRef<HTMLDivElement>(null)
  const down = useRef(false)
  const erase = (e: React.PointerEvent) => {
    const el = root.current?.closest('[data-page]')
    if (!el) return
    const hit = markupAt(list, pagePoint(e, el, box.rotation), 0.01)
    if (hit) deleteMarkup(hit.id)
  }
  return (
    <div
      ref={root}
      data-erase-layer
      className="absolute inset-0 cursor-cell touch-none"
      onPointerDown={(e) => {
        if (e.pointerType === 'touch' && penSeen) return
        down.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        erase(e)
      }}
      onPointerMove={(e) => down.current && erase(e)}
      onPointerUp={() => (down.current = false)}
      onPointerCancel={() => (down.current = false)}
    />
  )
}
