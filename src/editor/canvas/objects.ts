import type { Side } from '@/core/layout/types'
import type { ArrowEnds, BoundaryShape } from '@/core/model/objects'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}
export interface Pt {
  x: number
  y: number
}

const f = (n: number) => Math.round(n * 100) / 100
const center = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

/** Where the line from a box's centre towards `target` leaves the box. */
export function edgePoint(b: Box, target: Pt): Pt {
  const c = center(b)
  const dx = target.x - c.x
  const dy = target.y - c.y
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return c
  const sx = dx === 0 ? Infinity : b.w / 2 / Math.abs(dx)
  const sy = dy === 0 ? Infinity : b.h / 2 / Math.abs(dy)
  const s = Math.min(sx, sy)
  return { x: c.x + dx * s, y: c.y + dy * s }
}

export interface RelationshipGeometry {
  d: string
  start: Pt
  end: Pt
  control: Pt
  /** Middle of the curve: where the label sits and the bend handle is drawn. */
  mid: Pt
  startAngle: number
  endAngle: number
}

/** A curved line between two topics. `bend` is how far the middle is pushed to the side, in pixels. */
export function relationshipGeometry(a: Box, b: Box, bend: number): RelationshipGeometry {
  const ca = center(a)
  const cb = center(b)
  const dx = cb.x - ca.x
  const dy = cb.y - ca.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const mid0 = { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 }
  const control = { x: mid0.x + nx * bend, y: mid0.y + ny * bend }
  const start = edgePoint(a, control)
  const end = edgePoint(b, control)
  const mid = { x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x, y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y }
  return {
    d: `M${f(start.x)} ${f(start.y)}Q${f(control.x)} ${f(control.y)} ${f(end.x)} ${f(end.y)}`,
    start,
    end,
    control,
    mid,
    startAngle: Math.atan2(start.y - control.y, start.x - control.x),
    endAngle: Math.atan2(end.y - control.y, end.x - control.x),
  }
}

/** The bend that puts the middle of the line under the pointer (solved exactly, since the ends are clipped to the boxes). */
export function bendForPointer(a: Box, b: Box, pointer: Pt): number {
  const ca = center(a)
  const cb = center(b)
  const dx = cb.x - ca.x
  const dy = cb.y - ca.y
  const len = Math.hypot(dx, dy) || 1
  const side = (p: Pt) => ((p.x - ca.x) * -dy + (p.y - ca.y) * dx) / len // signed distance from the straight line
  const target = side(pointer)
  let lo = -3000
  let hi = 3000
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2
    if (side(relationshipGeometry(a, b, m).mid) < target) lo = m
    else hi = m
  }
  return Math.round((lo + hi) / 2) || 0 // never -0
}

/** Triangle arrow head with its tip at `tip`, pointing along `angle` (radians, direction of travel). */
export function arrowHeadPath(tip: Pt, angle: number, size: number): string {
  const back = angle + Math.PI
  const spread = 0.42
  const p1 = { x: tip.x + Math.cos(back + spread) * size, y: tip.y + Math.sin(back + spread) * size }
  const p2 = { x: tip.x + Math.cos(back - spread) * size, y: tip.y + Math.sin(back - spread) * size }
  return `M${f(tip.x)} ${f(tip.y)}L${f(p1.x)} ${f(p1.y)}L${f(p2.x)} ${f(p2.y)}Z`
}

/** Which ends of a relationship carry an arrow head. */
export function arrowEnds(arrows: ArrowEnds): { start: boolean; end: boolean } {
  return { start: arrows === 'start' || arrows === 'both', end: arrows === 'end' || arrows === 'both' }
}

export const union = (boxes: Box[]): Box | null => {
  if (!boxes.length) return null
  const x0 = Math.min(...boxes.map((b) => b.x))
  const y0 = Math.min(...boxes.map((b) => b.y))
  const x1 = Math.max(...boxes.map((b) => b.x + b.w))
  const y1 = Math.max(...boxes.map((b) => b.y + b.h))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export interface BoundaryGeometry {
  shape: BoundaryShape
  /** Rectangle for rounded/rect, or the enclosing ellipse's bounding box. */
  box: Box
  rx: number
}

/** The shape drawn around a group of boxes. */
export function boundaryGeometry(boxes: Box[], shape: BoundaryShape, pad = 16): BoundaryGeometry | null {
  const u = union(boxes)
  if (!u) return null
  if (shape === 'ellipse') {
    // An ellipse that contains the rectangle's corners.
    const cx = u.x + u.w / 2
    const cy = u.y + u.h / 2
    const rx = (u.w / 2 + pad) * Math.SQRT2
    const ry = (u.h / 2 + pad) * Math.SQRT2
    return { shape, box: { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 }, rx: 0 }
  }
  return { shape, box: { x: u.x - pad, y: u.y - pad, w: u.w + pad * 2, h: u.h + pad * 2 }, rx: shape === 'rounded' ? 18 : 3 }
}

export interface SummaryGeometry {
  d: string
  /** Where the summary text box goes. */
  label: Box
}

/**
 * A curly bracket beside a group of sibling topics, with a box for the summary text beyond its tip.
 * `flow` is the side the children hang on (right, left, below or above the parent).
 */
export function summaryGeometry(children: Box[], flow: Side, labelSize: { w: number; h: number }): SummaryGeometry | null {
  const u = union(children)
  if (!u) return null
  const gap = 14
  const depth = 20
  const horizontal = flow === 'r' || flow === 'l' || flow === 'c'
  const dir = flow === 'l' || flow === 't' ? -1 : 1
  // Work in a frame where the bracket runs along `a` and sticks out along `b`.
  const a0 = horizontal ? u.y : u.x
  const a1 = horizontal ? u.y + u.h : u.x + u.w
  const am = (a0 + a1) / 2
  const edge = horizontal ? (dir === 1 ? u.x + u.w : u.x) : dir === 1 ? u.y + u.h : u.y
  const b0 = edge + dir * gap
  const r = Math.max(2, Math.min(12, (a1 - a0) / 4))
  const P = (a: number, b: number) => (horizontal ? `${f(b)} ${f(a)}` : `${f(a)} ${f(b)}`)
  const mid = b0 + dir * 10
  const tip = b0 + dir * depth
  const d =
    `M${P(a0, b0)}Q${P(a0, mid)} ${P(a0 + r, mid)}L${P(am - r, mid)}Q${P(am, mid)} ${P(am, tip)}` +
    `M${P(am, tip)}Q${P(am, mid)} ${P(am + r, mid)}L${P(a1 - r, mid)}Q${P(a1, mid)} ${P(a1, b0)}`
  const lb = tip + dir * 8
  const label: Box = horizontal
    ? { x: dir === 1 ? lb : lb - labelSize.w, y: am - labelSize.h / 2, w: labelSize.w, h: labelSize.h }
    : { x: am - labelSize.w / 2, y: dir === 1 ? lb : lb - labelSize.h, w: labelSize.w, h: labelSize.h }
  return { d, label }
}

/** Size of a callout bubble for its text. */
export function calloutSize(text: string): { w: number; h: number } {
  const w = Math.min(230, Math.max(110, Math.ceil(text.length * 7.2 + 32)))
  const perLine = Math.max(8, Math.floor((w - 28) / 7.2))
  const lines = Math.max(1, Math.ceil(Math.max(text.length, 1) / perLine))
  return { w, h: lines * 19 + 18 }
}

export interface CalloutGeometry {
  box: Box
  /** Pointer from the bubble to the topic. */
  tail: string
}

/** A bubble placed `dx`,`dy` from the topic's centre, with a tail touching the topic. */
export function calloutGeometry(topic: Box, dx: number, dy: number, size: { w: number; h: number }): CalloutGeometry {
  const c = center(topic)
  const box: Box = { x: c.x + dx - size.w / 2, y: c.y + dy - size.h / 2, w: size.w, h: size.h }
  const tip = edgePoint(topic, center(box))
  const from = edgePoint(box, tip)
  const vx = tip.x - from.x
  const vy = tip.y - from.y
  const len = Math.hypot(vx, vy) || 1
  const nx = (-vy / len) * 9
  const ny = (vx / len) * 9
  const tail = `M${f(from.x + nx)} ${f(from.y + ny)}L${f(tip.x)} ${f(tip.y)}L${f(from.x - nx)} ${f(from.y - ny)}Z`
  return { box, tail }
}

/** Size of a summary text box. */
export function summaryLabelSize(text: string): { w: number; h: number } {
  return { w: Math.min(260, Math.max(90, Math.ceil(text.length * 7.8 + 36))), h: 36 }
}
