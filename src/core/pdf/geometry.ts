import type { Point, Rect, Turn } from './types'

/** Normalises any angle to 0, 90, 180 or 270. */
export function turn(angle: number): Turn {
  return ((((Math.round(angle / 90) * 90) % 360) + 360) % 360) as Turn
}

/** The union of rectangles. */
export function unionRect(rects: readonly Rect[]): Rect | null {
  if (!rects.length) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const r of rects) {
    x0 = Math.min(x0, r.x)
    y0 = Math.min(y0, r.y)
    x1 = Math.max(x1, r.x + r.w)
    y1 = Math.max(y1, r.y + r.h)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** A rectangle from two corners in any order, kept on the page. */
export function rectFrom(a: Point, b: Point): Rect {
  const x0 = clamp01(Math.min(a[0], b[0]))
  const y0 = clamp01(Math.min(a[1], b[1]))
  const x1 = clamp01(Math.max(a[0], b[0]))
  const y1 = clamp01(Math.max(a[1], b[1]))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/**
 * The page as it is SHOWN when the person has turned it by `rotation` (clockwise). A point stored on the page as read (turn 0)
 * is at (x, y); this says where it is on the turned page. The page's shape swaps for 90 and 270.
 */
export function toShown(p: Point, rotation: Turn): Point {
  const [x, y] = p
  switch (rotation) {
    case 90:
      return [1 - y, x]
    case 180:
      return [1 - x, 1 - y]
    case 270:
      return [y, 1 - x]
    default:
      return [x, y]
  }
}

/** The way back: a point on the turned page, to where it is on the page as read. */
export function fromShown(p: Point, rotation: Turn): Point {
  const [u, v] = p
  switch (rotation) {
    case 90:
      return [v, 1 - u]
    case 180:
      return [1 - u, 1 - v]
    case 270:
      return [1 - v, u]
    default:
      return [u, v]
  }
}

/** A rectangle on the page as read, as it appears on the turned page. */
export function rectToShown(r: Rect, rotation: Turn): Rect {
  const a = toShown([r.x, r.y], rotation)
  const b = toShown([r.x + r.w, r.y + r.h], rotation)
  return rectFrom(a, b)
}

export function rectFromShown(r: Rect, rotation: Turn): Rect {
  const a = fromShown([r.x, r.y], rotation)
  const b = fromShown([r.x + r.w, r.y + r.h], rotation)
  return rectFrom(a, b)
}

/** The size of a page once turned. */
export function shownSize(w: number, h: number, rotation: Turn): { w: number; h: number } {
  return rotation === 90 || rotation === 270 ? { w: h, h: w } : { w, h }
}

/**
 * From a point on the page as read (fractions, y down) to PDF coordinates (points, y up) on the page's own, unrotated box.
 * `own` is the rotation stored in the PDF page itself (0, 90, 180, 270, clockwise) and `w`, `h` the unrotated box in points.
 * The page "as read" is the page with its own rotation applied.
 */
export function toPdf(p: Point, w: number, h: number, own: Turn): Point {
  const [u, v] = p
  switch (own) {
    case 90:
      // read upright: width h, height w. Top left of the read page is the bottom left of the box, and its x runs up the box.
      return [v * w, u * h]
    case 180:
      return [(1 - u) * w, v * h]
    case 270:
      return [(1 - v) * w, (1 - u) * h]
    default:
      return [u * w, (1 - v) * h]
  }
}

/** Size of one unit of the read page's width and height in points (the read page is taller than wide for a portrait page). */
export function readSize(w: number, h: number, own: Turn): { w: number; h: number } {
  return shownSize(w, h, own)
}

/** A rectangle's four corners, in PDF coordinates, lower left first. */
export function rectToPdf(r: Rect, w: number, h: number, own: Turn): { x: number; y: number; width: number; height: number } {
  const a = toPdf([r.x, r.y], w, h, own)
  const b = toPdf([r.x + r.w, r.y + r.h], w, h, own)
  const x = Math.min(a[0], b[0])
  const y = Math.min(a[1], b[1])
  return { x, y, width: Math.abs(a[0] - b[0]), height: Math.abs(a[1] - b[1]) }
}
