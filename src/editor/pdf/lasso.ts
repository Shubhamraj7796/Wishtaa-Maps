import { unionRect } from '@/core/pdf/geometry'
import type { MarkupObject, Point, Rect } from '@/core/pdf/types'
import { boundsOf } from './markup'

/**
 * Lasso select for markup: draw a loop round some markup on a page, then move, resize, recolour, copy or delete all of it at once.
 * This file is the maths only (which markup a loop catches, and what a move or a resize does to a piece of markup); the screen part is
 * in LassoLayer.tsx. Everything is in fractions of the page, as the markup itself is, so it works at any zoom and turn.
 */

/** Whether a point is inside a loop (the loop closes itself between its last and first point). */
export function pointInLoop(p: Point, loop: readonly Point[]): boolean {
  let inside = false
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i] as Point
    const b = loop[j] as Point
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

/** The size of the smallest box a piece of markup is treated as having (a thin line still has something to catch). */
const MIN_BOX = 0.006

const boxOf = (m: MarkupObject): Rect | null => {
  const b = boundsOf(m)
  if (!b) return null
  const w = Math.max(b.w, MIN_BOX)
  const h = Math.max(b.h, MIN_BOX)
  return { x: b.x - (w - b.w) / 2, y: b.y - (h - b.h) / 2, w, h }
}

/**
 * The markup a loop catches: a piece is taken when the middle of it is inside the loop, or most of it is (a grid of sample points over
 * its box, at least 60 percent of them inside). A loop that is too small or too thin to be one (a tap, a straight scribble) catches nothing.
 */
export function lassoPick(list: readonly MarkupObject[], loop: readonly Point[]): string[] {
  if (loop.length < 4) return []
  const xs = loop.map((p) => p[0])
  const ys = loop.map((p) => p[1])
  if (Math.max(...xs) - Math.min(...xs) < 0.01 || Math.max(...ys) - Math.min(...ys) < 0.01) return []
  const out: string[] = []
  for (const m of list) {
    if (m.kind === 'link') continue // a link is not moved about with the rest
    const b = boxOf(m)
    if (!b) continue
    if (pointInLoop([b.x + b.w / 2, b.y + b.h / 2], loop)) {
      out.push(m.id)
      continue
    }
    let inN = 0
    const N = 5
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (pointInLoop([b.x + (b.w * (i + 0.5)) / N, b.y + (b.h * (j + 0.5)) / N], loop)) inN++
    if (inN / (N * N) >= 0.6) out.push(m.id)
  }
  return out
}

/** The box round all the chosen markup, or null. */
export function selectionBounds(list: readonly MarkupObject[], ids: readonly string[]): Rect | null {
  const boxes: Rect[] = []
  for (const m of list) {
    if (!ids.includes(m.id)) continue
    const b = boundsOf(m)
    if (b) boxes.push(b)
  }
  return boxes.length ? unionRect(boxes) : null
}

/** A move and/or a resize: points are scaled about (ox, oy) by `s` and then moved by (dx, dy). */
export interface Move {
  dx: number
  dy: number
  s: number
  ox: number
  oy: number
}
export const NO_MOVE: Move = { dx: 0, dy: 0, s: 1, ox: 0, oy: 0 }

const mp = (p: Point, t: Move): Point => [t.ox + (p[0] - t.ox) * t.s + t.dx, t.oy + (p[1] - t.oy) * t.s + t.dy]
const mr = (r: Rect, t: Move): Rect => ({ x: t.ox + (r.x - t.ox) * t.s + t.dx, y: t.oy + (r.y - t.oy) * t.s + t.dy, w: r.w * t.s, h: r.h * t.s })

/** What a move or resize changes in one piece of markup (only the geometry; colour, note and the rest stay). A text box grows its letters with it. */
export function moved(m: MarkupObject, t: Move): Partial<MarkupObject> {
  return {
    ...(m.rects ? { rects: m.rects.map((r) => mr(r, t)) } : {}),
    ...(m.points ? { points: m.points.map((p) => mp(p, t)) } : {}),
    ...(m.fontSize ? { fontSize: m.fontSize * t.s } : {}),
  }
}

/** The list with the chosen markup moved (for showing a drag as it happens, without touching the map). */
export function withMove(list: readonly MarkupObject[], ids: readonly string[], t: Move): MarkupObject[] {
  return list.map((m) => (ids.includes(m.id) ? { ...m, ...moved(m, t) } : m))
}

/** Keeps a move inside the page: the chosen box, once moved, stays within 0 to 1 on both sides. */
export function clampMove(box: Rect, t: Move): Move {
  const nb = mr(box, t)
  let { dx, dy } = t
  if (nb.x < 0) dx -= nb.x
  if (nb.y < 0) dy -= nb.y
  if (nb.x + nb.w > 1) dx -= nb.x + nb.w - 1
  if (nb.y + nb.h > 1) dy -= nb.y + nb.h - 1
  return { ...t, dx, dy }
}

/** The markup a copy would add (the same piece, a little to one side, not tied to the topic the original made). */
export function copyOf(m: MarkupObject, dx: number, dy: number): Omit<MarkupObject, 'id' | 'createdAt'> {
  const { id: _id, createdAt: _at, topicId: _topic, ...rest } = m
  void _id
  void _at
  void _topic
  return { ...rest, ...moved(m, { dx, dy, s: 1, ox: 0, oy: 0 }) }
}
