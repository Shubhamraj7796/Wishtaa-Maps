/** Crop rectangle maths, all in picture pixels. The screen only draws it and translates pointer moves. */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
export interface Size {
  w: number
  h: number
}

export const MIN_CROP = 16
/** Every handle can be hit within this many screen px, so a finger can grab it. */
export const HANDLE_HIT = 44

export const fullRect = (b: Size): Rect => ({ x: 0, y: 0, w: b.w, h: b.h })

/** Keeps a rectangle inside the picture and at least MIN_CROP in size. */
export function clampRect(r: Rect, b: Size, min = MIN_CROP): Rect {
  const w = Math.min(b.w, Math.max(Math.min(min, b.w), r.w))
  const h = Math.min(b.h, Math.max(Math.min(min, b.h), r.h))
  const x = Math.min(b.w - w, Math.max(0, r.x))
  const y = Math.min(b.h - h, Math.max(0, r.y))
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move'

/**
 * Which handle a point on screen grabs. `rect` is the crop rectangle in screen px. Corners win, then edges, then the inside
 * (move). A small rectangle still gets 44 px targets: corners are checked first and the hit zones may overlap.
 */
export function hitHandle(p: { x: number; y: number }, rect: Rect, hit = HANDLE_HIT): Handle | null {
  const half = hit / 2
  const near = (a: number, b: number) => Math.abs(a - b) <= half
  const l = rect.x
  const r = rect.x + rect.w
  const t = rect.y
  const bt = rect.y + rect.h
  const mx = rect.x + rect.w / 2
  const my = rect.y + rect.h / 2
  const corners: [Handle, number, number][] = [
    ['nw', l, t],
    ['ne', r, t],
    ['se', r, bt],
    ['sw', l, bt],
  ]
  for (const [h, x, y] of corners) if (near(p.x, x) && near(p.y, y)) return h
  const edges: [Handle, number, number][] = [
    ['n', mx, t],
    ['s', mx, bt],
    ['w', l, my],
    ['e', r, my],
  ]
  for (const [h, x, y] of edges) if (near(p.x, x) && near(p.y, y)) return h
  if (p.y >= t - half && p.y <= bt + half) {
    if (near(p.x, l)) return 'w'
    if (near(p.x, r)) return 'e'
  }
  if (p.x >= l - half && p.x <= r + half) {
    if (near(p.y, t)) return 'n'
    if (near(p.y, bt)) return 's'
  }
  if (p.x >= l && p.x <= r && p.y >= t && p.y <= bt) return 'move'
  return null
}

/** The rectangle after dragging a handle by (dx, dy) picture px from its starting rectangle. */
export function dragRect(start: Rect, handle: Handle, dx: number, dy: number, bounds: Size): Rect {
  let { x, y, w, h } = start
  if (handle === 'move') return clampRect({ x: x + dx, y: y + dy, w, h }, bounds)
  if (handle.includes('w')) {
    x += dx
    w -= dx
  }
  if (handle.includes('e')) w += dx
  if (handle.includes('n')) {
    y += dy
    h -= dy
  }
  if (handle.includes('s')) h += dy
  // Dragging an edge past the opposite one stops at the minimum size instead of flipping.
  if (w < MIN_CROP) {
    if (handle.includes('w')) x -= MIN_CROP - w
    w = MIN_CROP
  }
  if (h < MIN_CROP) {
    if (handle.includes('n')) y -= MIN_CROP - h
    h = MIN_CROP
  }
  x = Math.max(0, x)
  y = Math.max(0, y)
  w = Math.min(w, bounds.w - x)
  h = Math.min(h, bounds.h - y)
  return clampRect({ x, y, w, h }, bounds)
}

/** Rotating the picture by 90 degrees turns the crop with it. Returns the new rectangle and the new picture size. */
export function rotateRect(r: Rect, b: Size, dir: 'left' | 'right'): { rect: Rect; bounds: Size } {
  const bounds = { w: b.h, h: b.w }
  const rect = dir === 'right' ? { x: b.h - (r.y + r.h), y: r.x, w: r.h, h: r.w } : { x: r.y, y: b.w - (r.x + r.w), w: r.h, h: r.w }
  return { rect: clampRect(rect, bounds), bounds }
}

/** Arrow keys nudge by 1 px (10 with Shift). Alt + arrows resize from the bottom-right instead of moving. */
export function nudgeRect(r: Rect, key: string, shift: boolean, resize: boolean, b: Size): Rect {
  const step = shift ? 10 : 1
  const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0
  const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0
  if (!dx && !dy) return r
  return resize ? dragRect(r, 'se', dx, dy, b) : dragRect(r, 'move', dx, dy, b)
}

export const pixelSize = (r: Rect): Size => ({ w: Math.round(r.w), h: Math.round(r.h) })

/** Pinch and pan of the view while cropping (screen px). */
export interface View {
  scale: number
  x: number
  y: number
}
export const MIN_VIEW_SCALE = 1
export const MAX_VIEW_SCALE = 8

export function zoomView(v: View, factor: number, around: { x: number; y: number }): View {
  const scale = Math.min(MAX_VIEW_SCALE, Math.max(MIN_VIEW_SCALE, v.scale * factor))
  const k = scale / v.scale
  return { scale, x: around.x - (around.x - v.x) * k, y: around.y - (around.y - v.y) * k }
}

/** The pan can never leave the picture's edge visible beyond the frame. */
export function clampView(v: View, frame: Size): View {
  const minX = frame.w - frame.w * v.scale
  const minY = frame.h - frame.h * v.scale
  return { scale: v.scale, x: Math.min(0, Math.max(minX, v.x)), y: Math.min(0, Math.max(minY, v.y)) }
}
