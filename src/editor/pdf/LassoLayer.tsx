import { useRef, useState } from 'react'
import type { MarkupObject, Point, Rect } from '@/core/pdf/types'
import { Icon } from '@/ui/icons'
import { pointerMayDraw, noteStylus } from '../markup/layers'
import { setLasso } from './actions'
import { clampMove, copyOf, lassoPick, moved, NO_MOVE, selectionBounds, type Move } from './lasso'
import { addManyMarkup, deleteManyMarkup, updateManyMarkup } from './markup'
import { PALETTE } from './toolPrefs'

/** The surface size markup is drawn at: a page (or picture) of `w` by `h` units shown at `scale` pixels to a unit. */
interface Surface {
  w: number
  h: number
  scale: number
}

type ToPoint = (e: { clientX: number; clientY: number }, el: Element) => Point

const tap = 'grid h-8 min-w-8 shrink-0 place-items-center rounded px-1.5 text-xs hover:bg-bg [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-11'

/** The lasso tool: draw a loop round markup on this page to pick it. A tap on empty page lets the picture go. */
export function LassoDraw({ list, box, toPoint, surface, onPick }: { list: MarkupObject[]; box: Surface; toPoint: ToPoint; surface: string; onPick: (ids: string[]) => void }) {
  const root = useRef<HTMLDivElement>(null)
  const [loop, setLoop] = useState<Point[] | null>(null)
  const W = box.w * box.scale
  const H = box.h * box.scale
  const surfaceEl = () => root.current?.closest(surface) ?? null
  return (
    <div
      ref={root}
      data-lasso-layer
      className="absolute inset-0 cursor-crosshair"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        if (e.pointerType === 'pen') noteStylus()
        if (!pointerMayDraw(e, true)) return
        if (e.pointerType === 'mouse' && e.button !== 0) return
        const el = surfaceEl()
        if (!el) return
        e.currentTarget.setPointerCapture(e.pointerId)
        setLoop([toPoint(e, el)])
      }}
      onPointerMove={(e) => {
        const el = surfaceEl()
        if (!loop || !el) return
        const p = toPoint(e, el)
        const last = loop[loop.length - 1] as Point
        if (Math.hypot((p[0] - last[0]) * W, (p[1] - last[1]) * H) >= 2) setLoop([...loop, p])
      }}
      onPointerUp={() => {
        const l = loop
        setLoop(null)
        if (l) onPick(lassoPick(list, l))
      }}
      onPointerCancel={() => setLoop(null)}
    >
      {loop && (
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={W} height={H} aria-hidden="true">
          <polygon points={loop.map((p) => `${p[0] * W},${p[1] * H}`).join(' ')} fill="rgb(var(--c-brand) / 0.12)" stroke="rgb(var(--c-brand))" strokeWidth={1.5} strokeDasharray="6 4" />
        </svg>
      )}
    </div>
  )
}

/**
 * The markup picked with the lasso: a dashed box round it. Drag the box to move it, a corner to resize it (all together, keeping the shape),
 * and use the small bar for colour, Copy, Delete and Done. While a drag is going on the page shows the result (`onPreview`); it is kept in
 * the map, as one undo step, when the pointer is lifted.
 */
export function LassoSelection({ list, ids, box, rotationOf, onPreview, onDone }: { list: MarkupObject[]; ids: string[]; box: Surface; rotationOf: (e: { clientX: number; clientY: number }, el: Element) => Point; onPreview: (m: Move | null) => void; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const chosen = list.filter((m) => ids.includes(m.id))
  const bounds = selectionBounds(list, ids)
  const [live, setLive] = useState<Move | null>(null)
  const W = box.w * box.scale
  const H = box.h * box.scale
  if (!bounds || !chosen.length) return null

  const shown: Rect = live ? { x: live.ox + (bounds.x - live.ox) * live.s + live.dx, y: live.oy + (bounds.y - live.oy) * live.s + live.dy, w: bounds.w * live.s, h: bounds.h * live.s } : bounds
  const pageEl = () => root.current?.closest('[data-page]') ?? null

  /** Follows the pointer until it is lifted; `make` turns where it is now (and where it started) into the move. */
  const track = (e: React.PointerEvent, make: (now: Point, start: Point) => Move) => {
    const el = pageEl()
    if (!el) return
    e.preventDefault()
    e.stopPropagation()
    const start = rotationOf(e, el)
    let last: Move = NO_MOVE
    const move = (ev: PointerEvent) => {
      last = make(rotationOf(ev, el), start)
      setLive(last)
      onPreview(last)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      setLive(null)
      onPreview(null)
      if (last === NO_MOVE || (last.dx === 0 && last.dy === 0 && last.s === 1)) return
      const changes: Record<string, Partial<MarkupObject>> = {}
      for (const m of chosen) changes[m.id] = moved(m, last)
      updateManyMarkup(changes)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const drag = (e: React.PointerEvent) => track(e, (now, start) => clampMove(bounds, { dx: now[0] - start[0], dy: now[1] - start[1], s: 1, ox: 0, oy: 0 }))

  /** A corner: the box grows or shrinks about the opposite corner, keeping its shape, and stays inside the page. */
  const resize = (corner: 'nw' | 'ne' | 'sw' | 'se') => (e: React.PointerEvent) => {
    const ox = corner === 'nw' || corner === 'sw' ? bounds.x + bounds.w : bounds.x
    const oy = corner === 'nw' || corner === 'ne' ? bounds.y + bounds.h : bounds.y
    const cx = corner === 'nw' || corner === 'sw' ? bounds.x : bounds.x + bounds.w
    const cy = corner === 'nw' || corner === 'ne' ? bounds.y : bounds.y + bounds.h
    const base = Math.hypot((cx - ox) * W, (cy - oy) * H) || 1
    track(e, (now) => {
      let s = Math.hypot((now[0] - ox) * W, (now[1] - oy) * H) / base
      s = Math.min(8, Math.max(0.15, s))
      // Never past the page edge.
      const x0 = ox + (bounds.x - ox) * s
      const x1 = ox + (bounds.x + bounds.w - ox) * s
      const y0 = oy + (bounds.y - oy) * s
      const y1 = oy + (bounds.y + bounds.h - oy) * s
      if (x0 < 0) s = Math.min(s, (ox - 0) / Math.max(1e-6, ox - bounds.x))
      if (x1 > 1) s = Math.min(s, (1 - ox) / Math.max(1e-6, bounds.x + bounds.w - ox))
      if (y0 < 0) s = Math.min(s, oy / Math.max(1e-6, oy - bounds.y))
      if (y1 > 1) s = Math.min(s, (1 - oy) / Math.max(1e-6, bounds.y + bounds.h - oy))
      return { dx: 0, dy: 0, s, ox, oy }
    })
  }

  const recolour = (color: string) => {
    const changes: Record<string, Partial<MarkupObject>> = {}
    for (const m of chosen) if (m.kind !== 'whiteout' && m.kind !== 'link') changes[m.id] = { color }
    updateManyMarkup(changes)
  }
  const copy = () => {
    // A little down and to the right, kept inside the page.
    const t = clampMove(bounds, { dx: 0.025, dy: 0.02, s: 1, ox: 0, oy: 0 })
    const made = addManyMarkup(chosen.map((m) => copyOf(m, t.dx, t.dy)))
    if (made.length) setLasso({ sourceId: chosen[0]!.sourceId, page: chosen[0]!.page, ids: made })
  }

  const pad = 5
  const barBelow = shown.y * H < 56
  const handle = 'absolute h-3 w-3 rounded-sm border-2 border-brand bg-white [@media(pointer:coarse)]:h-5 [@media(pointer:coarse)]:w-5'
  return (
    <div ref={root} data-lasso-selection className="absolute inset-0 z-10" style={{ pointerEvents: 'none' }}>
      <div
        className="absolute cursor-move border-2 border-dashed border-brand"
        style={{ left: shown.x * W - pad, top: shown.y * H - pad, width: shown.w * W + pad * 2, height: shown.h * H + pad * 2, pointerEvents: 'auto', touchAction: 'none', background: 'rgb(var(--c-brand) / 0.06)' }}
        onPointerDown={drag}
        data-lasso-box
        aria-label={`${chosen.length} piece${chosen.length === 1 ? '' : 's'} of markup chosen. Drag to move`}
        role="group"
      >
        {(['nw', 'ne', 'sw', 'se'] as const).map((c) => (
          <div
            key={c}
            data-lasso-handle={c}
            aria-label="Resize the chosen markup"
            className={`${handle} ${c.includes('n') ? '-top-2' : '-bottom-2'} ${c.includes('w') ? '-left-2' : '-right-2'} ${c === 'nw' || c === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize'}`}
            style={{ touchAction: 'none' }}
            onPointerDown={resize(c)}
          />
        ))}
      </div>
      <div
        role="group"
        aria-label="Chosen markup"
        data-lasso-bar
        className="absolute z-10 flex max-w-[96%] flex-wrap items-center gap-0.5 rounded-ui border border-line bg-surface px-1.5 py-1 shadow-lg"
        style={{ left: Math.max(0, Math.min(shown.x * W - pad, W - 200)), top: barBelow ? (shown.y + shown.h) * H + pad + 8 : shown.y * H - pad - 46, pointerEvents: 'auto' }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="px-1 text-xs font-medium">{chosen.length} chosen</span>
        <div role="radiogroup" aria-label="Change colour" className="flex items-center">
          {PALETTE.slice(0, 9).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={chosen.every((m) => m.color.toLowerCase() === c)} aria-label={`Colour ${c}`} data-lasso-colour={c} onClick={() => recolour(c)} className="grid h-8 w-6 place-items-center [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-8">
              <span className="h-4 w-4 rounded-full border border-line" style={{ background: c }} />
            </button>
          ))}
        </div>
        <button type="button" className={tap} data-lasso-copy onClick={copy}>
          <Icon name="copy" size={15} />
          <span className="sr-only">Copy the chosen markup</span>
        </button>
        <button type="button" className={`${tap} text-bad`} data-lasso-delete aria-label="Delete the chosen markup" onClick={() => deleteManyMarkup(ids)}>
          <Icon name="trash" size={15} />
        </button>
        <button type="button" className={tap} aria-label="Done" onClick={onDone}>
          <Icon name="close" size={15} />
        </button>
      </div>
    </div>
  )
}
