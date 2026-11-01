import { useEffect, useRef, useState } from 'react'
import { rectFrom } from '@/core/pdf/geometry'
import type { MarkupObject, Point, Rect } from '@/core/pdf/types'
import { showNotice } from '../notice'
import type { PdfTool } from '../store'
import { boundsOf, markupAt } from '../pdf/markup'
import { strokeWidth, textSize, type ToolStyle } from '../pdf/toolPrefs'

/**
 * The layers that draw markup and take it from the pointer. They know nothing about PDFs or pictures: they work in the coordinates of
 * the thing marked (fractions of it from its top left) and are given the way to turn a pointer position into such a point, and what to
 * do with a finished mark. The PDF pages and the picture viewer each use them.
 */

/** The size the marks are drawn in: the marked thing is `w` by `h` units, shown at `scale` pixels to a unit. */
export interface Surface {
  w: number
  h: number
  scale: number
}

/** A mark as it is handed over: everything except what the owner fills in (its id, time, and where it belongs). */
export type NewShape = Omit<MarkupObject, 'id' | 'createdAt' | 'sourceId' | 'page'>

export const DRAW_TOOLS: readonly PdfTool[] = ['pen', 'text', 'rect', 'ellipse', 'line', 'arrow', 'whiteout', 'link']
/** On a picture there is no text to select, so these three are drawn as a rectangle too. */
export const RECT_MARK_TOOLS: readonly PdfTool[] = ['highlight', 'underline', 'strike']

/** Once a pen has touched the screen, fingers scroll instead of drawing (so a hand resting on the glass does no harm). */
let penSeen = false
export const noteStylus = () => void (penSeen = true)
export const stylusSeen = () => penSeen

const px = (v: number, size: number) => v * size

/** The arrow's head: a small triangle at `to`. */
export function arrowHead(from: Point, to: Point, W: number, H: number, size: number): string {
  const x1 = from[0] * W
  const y1 = from[1] * H
  const x2 = to[0] * W
  const y2 = to[1] * H
  const a = Math.atan2(y2 - y1, x2 - x1)
  const p = (k: number) => `${x2 - size * Math.cos(a + k)},${y2 - size * Math.sin(a + k)}`
  return `${x2},${y2} ${p(0.45)} ${p(-0.45)}`
}

/** All the marks of one page or picture, drawn in its own coordinates (so they turn and zoom with it). */
export function MarkupLayer({ list, box, markId, onGoPage }: { list: MarkupObject[]; box: Surface; markId?: string | null; onGoPage?: (page: number) => void }) {
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
                const go = () => (m.link && 'page' in m.link ? onGoPage?.(m.link.page) : m.link && 'url' in m.link ? window.open(m.link.url, '_blank', 'noopener,noreferrer') : undefined)
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

export interface DrawProps {
  tool: PdfTool
  style: ToolStyle
  box: Surface
  /** The element whose box the pointer is measured in (the shown page or picture: it may be turned, the layer is not). */
  surface: string
  /** A pointer position as a point of the marked thing. `el` is the surface element. */
  toPoint: (e: { clientX: number; clientY: number }, el: Element) => Point
  onAdd: (m: NewShape) => void
  /** How many pages a link may name (0: only web addresses). */
  linkPages: number
  /** A finger draws too (false: only a mouse or a stylus draws, and a finger is left to pan and zoom). */
  touchDraws?: boolean
}

/** The pen and shape tools: the stroke is drawn as the finger or pen moves, and kept as markup when it is lifted. */
export function DrawLayer({ tool, style, box, surface, toPoint, onAdd, linkPages, touchDraws = true }: DrawProps) {
  const color = style.color
  const pen = strokeWidth(style.size)
  const root = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<{ a: Point; b: Point; pts: Point[] } | null>(null)
  const [editor, setEditor] = useState<{ rect: Rect; kind: 'text' | 'link' } | null>(null)
  const [touchOk, setTouchOk] = useState(!penSeen)
  const W = box.w * box.scale
  const H = box.h * box.scale
  const surfaceEl = () => root.current?.closest(surface) ?? null

  useEffect(() => setEditor(null), [tool])

  const finish = (d: { a: Point; b: Point; pts: Point[] }) => {
    const rect = rectFrom(d.a, d.b)
    const big = rect.w * W > 6 || rect.h * H > 6
    switch (tool) {
      case 'pen':
        if (d.pts.length > 1) onAdd({ kind: 'pen', color, points: d.pts, width: pen })
        break
      case 'rect':
      case 'ellipse':
        if (big) onAdd({ kind: tool, color, rects: [rect], width: pen })
        break
      case 'whiteout':
        if (big) onAdd({ kind: 'whiteout', color: '#ffffff', rects: [rect] })
        break
      case 'highlight':
        if (big) onAdd({ kind: 'highlight', color, rects: [rect], opacity: style.opacity })
        break
      case 'underline':
      case 'strike':
        if (big) onAdd({ kind: tool, color, rects: [rect], width: pen })
        break
      case 'line':
      case 'arrow':
        if (Math.hypot((d.b[0] - d.a[0]) * W, (d.b[1] - d.a[1]) * H) > 8) onAdd({ kind: tool, color, points: [d.a, d.b], width: pen })
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
      style={{ touchAction: touchOk && touchDraws ? 'none' : 'pan-x pan-y' }}
      onPointerDown={(e) => {
        if (e.pointerType === 'pen') {
          penSeen = true
          setTouchOk(false)
        }
        if (e.pointerType === 'touch' && (penSeen || !touchDraws)) return // a resting hand scrolls, it does not draw
        if (e.pointerType === 'mouse' && e.button !== 0) return
        const el = surfaceEl()
        if (!el || editor) return
        e.currentTarget.setPointerCapture(e.pointerId)
        const p = toPoint(e, el)
        setDraft({ a: p, b: p, pts: [p] })
      }}
      onPointerMove={(e) => {
        const el = surfaceEl()
        if (!draft || !el) return
        const events = tool === 'pen' && 'getCoalescedEvents' in e.nativeEvent ? (e.nativeEvent as PointerEvent).getCoalescedEvents() : []
        const moves = events.length ? events : [e.nativeEvent as PointerEvent]
        let pts = draft.pts
        let b = draft.b
        for (const ev of moves) {
          b = toPoint(ev, el)
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
          {(tool === 'rect' || tool === 'whiteout' || tool === 'text' || tool === 'link' || tool === 'highlight' || tool === 'underline' || tool === 'strike') && <DraftRect a={draft.a} b={draft.b} W={W} H={H} tool={tool} color={color} pen={pen} />}
          {tool === 'ellipse' && <DraftEllipse a={draft.a} b={draft.b} W={W} H={H} color={color} pen={pen} />}
          {(tool === 'line' || tool === 'arrow') && (
            <>
              <line x1={draft.a[0] * W} y1={draft.a[1] * H} x2={draft.b[0] * W} y2={draft.b[1] * H} stroke={color} strokeWidth={pen * W} strokeLinecap="round" />
              {tool === 'arrow' && <polygon points={arrowHead(draft.a, draft.b, W, H, Math.max(8, pen * W * 4))} fill={color} />}
            </>
          )}
        </svg>
      )}
      {editor && <InlineEditor box={box} rect={editor.rect} kind={editor.kind} style={style} linkPages={linkPages} onAdd={onAdd} done={() => setEditor(null)} />}
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

/** A link goes to a page of this PDF (a number, when there are pages) or a web address; anything else is refused. */
export function parseLink(input: string, pages: number): { page: number } | { url: string } | null {
  const t = input.trim()
  if (/^\d+$/.test(t)) {
    const page = Number(t)
    return pages > 0 && page >= 1 && page <= pages ? { page } : null
  }
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`)
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:' ? { url: u.href } : null
  } catch {
    return null
  }
}

/** The small box for typing a text box's words or a link's target, right on the page. */
function InlineEditor({ box, rect, kind, style, linkPages, onAdd, done }: { box: Surface; rect: Rect; kind: 'text' | 'link'; style: ToolStyle; linkPages: number; onAdd: (m: NewShape) => void; done: () => void }) {
  const W = box.w * box.scale
  const H = box.h * box.scale
  const [value, setValue] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)
  useEffect(() => input.current?.focus(), [])
  const commit = () => {
    const text = value.trim()
    if (!text) return done()
    if (kind === 'text') {
      onAdd({ kind: 'text', color: style.color, rects: [rect], text, fontSize: textSize(style.size) })
    } else {
      const link = parseLink(text, linkPages)
      if (!link) {
        showNotice(linkPages > 0 ? `That is not a page of this PDF (1 to ${linkPages}) or a web address.` : 'That is not a web address.')
        return
      }
      onAdd({ kind: 'link', color: '#2563eb', rects: [rect], link })
    }
    done()
  }
  return (
    <div className="absolute z-10" style={{ left: rect.x * W, top: rect.y * H, width: Math.max(rect.w * W, 150) }} onPointerDown={(e) => e.stopPropagation()}>
      <textarea
        ref={input}
        value={value}
        rows={kind === 'text' ? 2 : 1}
        placeholder={kind === 'text' ? 'Type here' : linkPages > 0 ? 'Page number or web address' : 'Web address'}
        aria-label={kind === 'text' ? 'Text box' : 'Link target'}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            done()
          }
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

/** The eraser: touch (or drag across) a piece of markup to delete it. Each piece deleted is one undo step. */
export function EraseLayer({ list, surface, toPoint, onErase, touchDraws = true }: { list: MarkupObject[]; surface: string; toPoint: (e: { clientX: number; clientY: number }, el: Element) => Point; onErase: (id: string) => void; touchDraws?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const down = useRef(false)
  const erase = (e: React.PointerEvent) => {
    const el = root.current?.closest(surface)
    if (!el) return
    const hit = markupAt(list, toPoint(e, el), 0.01)
    if (hit) onErase(hit.id)
  }
  return (
    <div
      ref={root}
      data-erase-layer
      className="absolute inset-0 cursor-cell touch-none"
      onPointerDown={(e) => {
        if (e.pointerType === 'touch' && (penSeen || !touchDraws)) return
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
