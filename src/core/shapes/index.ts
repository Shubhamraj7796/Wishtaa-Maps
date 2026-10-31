import type { Shape } from '../model/types'
import type { Look } from '../theme/resolve'
import { samplePath, type Pt } from '../theme/taper'
import { makeBox, shapeDef, SHAPE_DEFS, type Geometry, type Layer, type ShapeDef, type ShapeOpts } from './defs'

export { SHAPE_DEFS, shapeDef, type Geometry, type Layer, type ShapeDef, type ShapeOpts }

export const DEFAULT_RING = 6
export const DEFAULT_GAP = 4
/** Gap between the two lines of a double border (px, besides the border width). */
export const DOUBLE_GAP = 3

/** Width of the text-safe area of a shape that is `w` wide (circles are square, so their width sets their height). */
export function innerWidth(id: Shape, w: number, o: Pick<ShapeOpts, 'ringWidth' | 'ringGap'> = {}): number {
  const def = shapeDef(id)
  return def.square ? textArea(id, w, w, o).w : textArea(id, w, 100, o).w
}

export const SHAPE_NAME = (id: Shape): string => shapeDef(id).name

/** Whether the corner style (square, rounded, pill) applies to this shape. */
export const isRectLike = (id: Shape): boolean => !!shapeDef(id).rectLike

// ---- geometry (cached: a map redraws with thousands of topics, but only a handful of distinct shape and size pairs) ----

const CACHE_LIMIT = 4000
const cache = new Map<string, Geometry>()

const optsKey = (o: ShapeOpts) => `${o.bw}|${o.corner ?? ''}|${o.cornerPx ?? ''}|${o.borderLine ?? ''}|${o.ringWidth ?? ''}|${o.ringGap ?? ''}`

/** The SVG layers of a shape in a `w` by `h` box: filled body, border, rings, extra lines. The border stays inside the box. */
export function shapeGeometry(id: Shape, w: number, h: number, o: ShapeOpts): Geometry {
  const key = `${id}|${Math.round(w * 10)}|${Math.round(h * 10)}|${optsKey(o)}`
  const hit = cache.get(key)
  if (hit) return hit
  const def = shapeDef(id)
  const inset = Math.max(0.5, o.bw / 2)
  const main = def.build(makeBox(w, h, inset), o)
  const layers: Layer[] = [...main.layers]
  if (o.borderLine === 'double' && !def.noDouble && o.bw > 0) {
    // A second line inside the first (the same shape, built a little smaller).
    const inner = def.build(makeBox(w, h, inset + o.bw + DOUBLE_GAP), o)
    layers.push({ d: inner.outline, kind: 'stroke' })
  }
  const out: Geometry = { layers, outline: def.build(makeBox(w, h, 0), o).outline }
  if (cache.size >= CACHE_LIMIT) cache.clear()
  cache.set(key, out)
  return out
}

/** Just the outline of the whole shape (selection ring, connection points). */
export const shapeOutline = (id: Shape, w: number, h: number): string => shapeGeometry(id, w, h, { bw: 0 }).outline

// ---- text-safe area and sizing ------------------------------------------------------------------------------------

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const SQRT2 = Math.SQRT2

/** The rectangle inside a `w` by `h` shape where text, pictures and badges may go. */
export function textArea(id: Shape, w: number, h: number, o: Pick<ShapeOpts, 'ringWidth' | 'ringGap'> = {}): Rect {
  if (id === 'doubleCircle') {
    // The text sits in the inner circle: its inscribed square.
    const d = Math.min(w, h)
    const rin = Math.max(1, d / 2 - (o.ringWidth ?? DEFAULT_RING) - (o.ringGap ?? DEFAULT_GAP))
    const side = rin * SQRT2
    return { x: (w - side) / 2, y: (h - side) / 2, w: side, h: side }
  }
  const def = shapeDef(id)
  const [l, t, r, b] = def.inset
  if (def.square) {
    // A circle in a box that isn't square is as big as the shorter side; the text area is centred in it.
    const d = Math.min(w, h)
    const side = Math.max(1, d * (1 - l - r))
    return { x: (w - side) / 2, y: (h - side) / 2, w: side, h: side }
  }
  return { x: w * l, y: h * t, w: Math.max(1, w * (1 - l - r)), h: Math.max(1, h * (1 - t - b)) }
}

/** The outer box a shape needs to hold content of `cw` by `ch` inside its text-safe area. Rounded up to whole pixels. */
export function fitBox(id: Shape, cw: number, ch: number, o: Pick<ShapeOpts, 'ringWidth' | 'ringGap'> = {}): { w: number; h: number } {
  const def = shapeDef(id)
  if (id === 'doubleCircle') {
    const d = Math.ceil(Math.max(cw, ch) * SQRT2 + 2 * ((o.ringWidth ?? DEFAULT_RING) + (o.ringGap ?? DEFAULT_GAP)))
    return { w: d, h: d }
  }
  const [l, t, r, b] = def.inset
  // Rounded to 6 places first so 100 / (5/6) is 120, not 120.00000000000001 (which would round up to 121).
  const up = (n: number) => Math.ceil(Math.round(n * 1e6) / 1e6)
  const w = up(cw / (1 - l - r))
  const h = up(ch / (1 - t - b))
  if (def.square) {
    const s = Math.max(w, h)
    return { w: s, h: s }
  }
  return { w, h }
}

// ---- connection points ----------------------------------------------------------------------------------------------

const polyCache = new Map<string, Pt[]>()

function outlinePolygon(id: Shape, w: number, h: number): Pt[] {
  const key = `${id}|${Math.round(w * 10)}|${Math.round(h * 10)}`
  const hit = polyCache.get(key)
  if (hit) return hit
  const pts = samplePath(shapeOutline(id, w, h), 10)
  if (polyCache.size >= CACHE_LIMIT) polyCache.clear()
  polyCache.set(key, pts)
  return pts
}

/** The outline as a polygon, for point-in-shape checks. */
export const outlinePoints = outlinePolygon

/** Crossings of the polygon with a horizontal (y = c) or vertical (x = c) line, as positions along that line. */
function crossings(poly: Pt[], axis: 'h' | 'v', c: number): number[] {
  const out: number[] = []
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const p = poly[i] as Pt
    const q = poly[(i + 1) % n] as Pt
    const a = axis === 'h' ? p.y : p.x
    const b = axis === 'h' ? q.y : q.x
    if ((a - c) * (b - c) > 0) continue
    if (a === b) {
      out.push(axis === 'h' ? p.x : p.y, axis === 'h' ? q.x : q.y)
      continue
    }
    const t = (c - a) / (b - a)
    out.push(axis === 'h' ? p.x + t * (q.x - p.x) : p.y + t * (q.y - p.y))
  }
  return out
}

export type AnchorSide = 'l' | 'r' | 't' | 'b'

export interface Anchors {
  l: Pt
  r: Pt
  t: Pt
  b: Pt
}

const anchorCache = new Map<string, Anchors>()

/**
 * Where branches attach: the outline's crossing with the horizontal and vertical lines through the middle, outermost
 * first (so a star's tip or a heart's point is used, not a dip). Positions are relative to the box's top-left corner.
 */
export function shapeAnchors(id: Shape, w: number, h: number): Anchors {
  const key = `${id}|${Math.round(w * 10)}|${Math.round(h * 10)}`
  const hit = anchorCache.get(key)
  if (hit) return hit
  const poly = outlinePolygon(id, w, h)
  const cx = w / 2
  const cy = h / 2
  const hx = crossings(poly, 'h', cy)
  const vy = crossings(poly, 'v', cx)
  const out: Anchors = {
    l: { x: hx.length ? Math.min(...hx) : 0, y: cy },
    r: { x: hx.length ? Math.max(...hx) : w, y: cy },
    t: { x: cx, y: vy.length ? Math.min(...vy) : 0 },
    b: { x: cx, y: vy.length ? Math.max(...vy) : h },
  }
  if (anchorCache.size >= CACHE_LIMIT) anchorCache.clear()
  anchorCache.set(key, out)
  return out
}

/** Where a branch meets the top or bottom of the shape at horizontal offset `x` (for layouts that attach away from the centre). */
export function edgeAtX(id: Shape, w: number, h: number, x: number, side: 't' | 'b'): number {
  const ys = crossings(outlinePolygon(id, w, h), 'v', Math.min(w - 0.01, Math.max(0.01, x)))
  if (!ys.length) return side === 't' ? 0 : h
  return side === 't' ? Math.min(...ys) : Math.max(...ys)
}

/** Whether a point is inside the shape's outline. */
export function insideShape(poly: Pt[], x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as Pt
    const b = poly[j] as Pt
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** The geometry options a topic's look asks for. */
export function optsOfLook(l: Pick<Look, 'borderWidth' | 'corner' | 'cornerPx' | 'borderLine' | 'ringWidth' | 'ringGap'>): ShapeOpts {
  return { bw: l.borderWidth, corner: l.corner, cornerPx: l.cornerPx, borderLine: l.borderLine, ringWidth: l.ringWidth, ringGap: l.ringGap }
}
