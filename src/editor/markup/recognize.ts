import { rectFrom } from '@/core/pdf/geometry'
import type { Point, Rect } from '@/core/pdf/types'

/**
 * Straight-angle correction: what a pen stroke becomes when the pen is held still at its end. Pure maths on the stroke's points (fractions
 * of the page or picture) and the size it is drawn at in pixels, so it is easy to test. It only ever says "this stroke is really a line, an
 * arrow, a rectangle or an ellipse"; when it is not sure it says nothing and the stroke stays as drawn.
 */
export type Snap = { kind: 'line' | 'arrow'; a: Point; b: Point } | { kind: 'rect' | 'ellipse'; rect: Rect }

export interface SnapOptions {
  /** A nearly straight stroke becomes a line (and a line with a hooked end an arrow). */
  lines: boolean
  /** A nearly closed stroke becomes a rectangle, circle or ellipse. */
  shapes: boolean
}

/** How long the pen must be held still before the stroke snaps (the decision: 0.6 s). */
export const HOLD_MS = 600
/** How far the pen may wander while "still" (CSS pixels). */
export const STILL_PX = 3

const px = (p: Point, W: number, H: number): [number, number] => [p[0] * W, p[1] * H]
const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** A line is pulled to flat, upright or 45 degrees when it is already within this many degrees of one of them. */
const SNAP_WITHIN = 4

/** The end of a line from `a`, turned to the nearest flat, upright or 45 degree direction when it is already within a few degrees of one. */
export function straightEnd(a: Point, b: Point, W: number, H: number): Point {
  const dx = (b[0] - a[0]) * W
  const dy = (b[1] - a[1]) * H
  const len = Math.hypot(dx, dy)
  if (len < 1) return b
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI
  const near = Math.round(deg / 45) * 45
  if (Math.abs(deg - near) > SNAP_WITHIN) return b
  const rad = (near * Math.PI) / 180
  // Exact zeros for flat and upright, so the line is truly flat or upright.
  const cos = Math.abs(Math.cos(rad)) < 1e-9 ? 0 : Math.cos(rad)
  const sin = Math.abs(Math.sin(rad)) < 1e-9 ? 0 : Math.sin(rad)
  return [a[0] + (cos * len) / W, a[1] + (sin * len) / H]
}

/** The distance of the farthest point from the straight chord a to b, in pixels. */
function maxDeviation(pts: [number, number][], a: [number, number], b: [number, number]): number {
  const len = dist(a, b)
  if (len < 1e-6) return Math.max(...pts.map((p) => dist(p, a)))
  let worst = 0
  for (const p of pts) worst = Math.max(worst, Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / len)
  return worst
}

function pathLength(pts: [number, number][]): number {
  let n = 0
  for (let i = 1; i < pts.length; i++) n += dist(pts[i - 1] as [number, number], pts[i] as [number, number])
  return n
}

/** `count` points spaced evenly along the path. */
function resample(pts: [number, number][], count: number): [number, number][] {
  const total = pathLength(pts)
  if (total === 0) return pts
  const step = total / (count - 1)
  const out: [number, number][] = [pts[0] as [number, number]]
  let carried = 0
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1] as [number, number]
    const b = pts[i] as [number, number]
    let seg = dist(a, b)
    while (carried + seg >= step && out.length < count) {
      const t = (step - carried) / seg
      a = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      out.push(a)
      seg = dist(a, b)
      carried = 0
    }
    carried += seg
  }
  while (out.length < count) out.push(pts[pts.length - 1] as [number, number])
  return out
}

/** What the stroke really is, or null when it is just a drawing. `W` and `H` are the size the stroke is drawn at, in pixels. */
export function recognize(points: readonly Point[], W: number, H: number, opts: SnapOptions): Snap | null {
  if (points.length < 3) return null
  const pts = points.map((p) => px(p, W, H))
  const first = pts[0] as [number, number]
  const last = pts[pts.length - 1] as [number, number]
  const total = pathLength(pts)
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const y0 = Math.min(...ys)
  const y1 = Math.max(...ys)
  const w = x1 - x0
  const h = y1 - y0
  const diag = Math.hypot(w, h)
  if (total < 24 || diag < 16) return null

  // A nearly closed loop: a rectangle, a circle or an ellipse.
  if (opts.shapes && Math.min(w, h) > 14 && dist(first, last) < diag * 0.25 && total > diag * 1.7) {
    const cx = x0 + w / 2
    const cy = y0 + h / 2
    const rs = resample(pts, 72)
    let ell = 0
    let box = 0
    for (const p of rs) {
      const u = (p[0] - cx) / (w / 2)
      const v = (p[1] - cy) / (h / 2)
      ell += Math.abs(Math.hypot(u, v) - 1)
      box += Math.abs(Math.max(Math.abs(u), Math.abs(v)) - 1)
    }
    ell /= rs.length
    box /= rs.length
    const best = Math.min(ell, box)
    if (best < 0.16) {
      const kind = box < ell ? 'rect' : 'ellipse'
      // A "nearly square" shape becomes exactly square (a clean circle for the ellipse), kept about the same centre.
      let rw = w
      let rh = h
      if (Math.abs(w - h) / Math.max(w, h) < 0.12) rw = rh = (w + h) / 2
      return { kind, rect: rectFrom([(cx - rw / 2) / W, (cy - rh / 2) / H], [(cx + rw / 2) / W, (cy + rh / 2) / H]) }
    }
    return null
  }

  if (!opts.lines) return null

  // An arrow: a straight shaft that ends with a short hook turned back toward where it came from.
  let tip = 0
  for (let i = 0; i < pts.length; i++) if (dist(pts[i] as [number, number], first) > dist(pts[tip] as [number, number], first)) tip = i
  const tipP = pts[tip] as [number, number]
  const shaft = pts.slice(0, tip + 1)
  const tail = pts.slice(tip)
  const shaftLen = pathLength(shaft)
  const tailLen = pathLength(tail)
  if (tail.length > 2 && shaft.length > 2 && dist(first, tipP) > 40 && tailLen > total * 0.08 && tailLen < total * 0.4 && maxDeviation(shaft, first, tipP) < Math.max(5, shaftLen * 0.06)) {
    const shaftDir = Math.atan2(tipP[1] - first[1], tipP[0] - first[0])
    const tailDir = Math.atan2(last[1] - tipP[1], last[0] - tipP[0])
    let turn = Math.abs(((tailDir - shaftDir) * 180) / Math.PI)
    if (turn > 180) turn = 360 - turn
    if (turn > 120 && turn < 175) {
      const b = straightEnd(points[0] as Point, [tipP[0] / W, tipP[1] / H], W, H)
      return { kind: 'arrow', a: points[0] as Point, b }
    }
  }

  // A line: close to straight from end to end.
  const chord = dist(first, last)
  if (chord > 20 && maxDeviation(pts, first, last) < Math.max(4, chord * 0.07)) {
    return { kind: 'line', a: points[0] as Point, b: straightEnd(points[0] as Point, points[points.length - 1] as Point, W, H) }
  }
  return null
}
