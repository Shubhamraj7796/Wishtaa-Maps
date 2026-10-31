import type { Viewport } from './store'

/** The zoom range: about 2% to 400%. */
export const MIN_ZOOM = 0.02
export const MAX_ZOOM = 4

export const clampZoom = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k))

/** What a plain mouse wheel does (a trackpad's two-finger scroll always moves the map). */
export type WheelMode = 'move' | 'zoom'

export interface WheelLike {
  deltaX: number
  deltaY: number
  /** 0 = pixels, 1 = lines, 2 = pages */
  deltaMode: number
  ctrlKey: boolean
  shiftKey: boolean
}

export type WheelAction = { kind: 'zoom'; factor: number } | { kind: 'pan'; dx: number; dy: number }

/** Pixels moved by one wheel line, and by one page. */
const LINE_PX = 32
const PAGE_PX = 400
/** How much one mouse-wheel notch zooms. */
export const NOTCH_ZOOM = 1.15
/** Trackpad pinch: zoom per pixel of delta (the browser reports a pinch as Ctrl + wheel with small deltas). */
const PINCH_RATE = 0.012
const PINCH_MAX = 60

const px = (e: WheelLike, d: number) => (e.deltaMode === 1 ? d * LINE_PX : e.deltaMode === 2 ? d * PAGE_PX : d)

/**
 * A real mouse wheel notch, as opposed to a trackpad's stream of small, often fractional deltas: line-mode events, or a whole
 * number of 100 or more on the vertical axis only.
 */
export function isMouseNotch(e: WheelLike): boolean {
  if (e.deltaMode !== 0) return true
  return e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 100
}

/**
 * What a wheel event means:
 *  - Ctrl + wheel (a trackpad pinch is reported this way too) zooms, centred on the pointer;
 *  - a mouse-wheel notch follows the "Mouse wheel" preference (move the map, or zoom);
 *  - anything else (two-finger scroll) moves the map; Shift + wheel moves it sideways.
 */
export function wheelAction(e: WheelLike, mouse: WheelMode): WheelAction {
  const notch = isMouseNotch(e)
  const notchZoom = (): WheelAction => ({ kind: 'zoom', factor: e.deltaY < 0 ? NOTCH_ZOOM : 1 / NOTCH_ZOOM })
  if (e.ctrlKey) {
    if (notch) return notchZoom()
    const d = Math.max(-PINCH_MAX, Math.min(PINCH_MAX, px(e, e.deltaY)))
    return { kind: 'zoom', factor: Math.exp(-d * PINCH_RATE) }
  }
  if (notch && mouse === 'zoom') return notchZoom()
  const dx = px(e, e.deltaX)
  const dy = px(e, e.deltaY)
  if (e.shiftKey && dx === 0) return { kind: 'pan', dx: dy, dy: 0 }
  return { kind: 'pan', dx, dy }
}

/** Wheel events that start in a text field, the notes editor or a scrolling panel belong to that element, not the canvas. */
export function wheelBelongsElsewhere(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el?.closest?.('input,textarea,select,[contenteditable="true"],[data-no-wheel]')
}

/** The viewport after zooming by `factor` around the point (cx, cy) of the canvas, kept inside the zoom range. */
export function zoomViewport(v: Viewport, factor: number, cx: number, cy: number): Viewport {
  const k = clampZoom(v.k * factor)
  const wx = (cx - v.x) / v.k
  const wy = (cy - v.y) / v.k
  return { k, x: cx - wx * k, y: cy - wy * k }
}

/** Moves the viewport by a scroll of (dx, dy): content follows the fingers, so the view offset goes the other way. */
export const panViewport = (v: Viewport, dx: number, dy: number): Viewport => ({ k: v.k, x: v.x - dx, y: v.y - dy })

// ---- gestures applied once per animation frame --------------------------------------------------------

export interface Pending {
  dx: number
  dy: number
  zoom: number
  cx: number
  cy: number
}

export const emptyPending = (): Pending => ({ dx: 0, dy: 0, zoom: 1, cx: 0, cy: 0 })

/** Adds one wheel action to what is waiting for the next frame (many events in one frame become one update). */
export function accumulate(p: Pending, a: WheelAction, cx: number, cy: number): Pending {
  if (a.kind === 'pan') return { ...p, dx: p.dx + a.dx, dy: p.dy + a.dy }
  return { ...p, zoom: p.zoom * a.factor, cx, cy }
}

/** Applies what is waiting: first the move, then the zoom around the pointer. */
export function flush(v: Viewport, p: Pending): Viewport {
  let out = v
  if (p.dx || p.dy) out = panViewport(out, p.dx, p.dy)
  if (p.zoom !== 1) out = zoomViewport(out, p.zoom, p.cx, p.cy)
  return out
}

// ---- touch fling (light inertia) ----------------------------------------------------------------------

export interface Sample {
  t: number
  x: number
  y: number
}

const FLING_WINDOW = 90
const FLING_MIN_SPEED = 0.35 // px per ms to start
const FLING_STOP = 0.03
const FLING_FRICTION = 0.0035 // per ms

/** Velocity (px per ms) of a finger from its last few moves, or null when it was held still or lifted slowly. */
export function flingVelocity(samples: Sample[], now: number): { vx: number; vy: number } | null {
  const recent = samples.filter((s) => now - s.t <= FLING_WINDOW)
  if (recent.length < 2) return null
  const a = recent[0] as Sample
  const b = recent[recent.length - 1] as Sample
  const dt = b.t - a.t
  if (dt <= 0) return null
  const vx = (b.x - a.x) / dt
  const vy = (b.y - a.y) / dt
  return Math.hypot(vx, vy) >= FLING_MIN_SPEED ? { vx, vy } : null
}

/** One step of the glide: how far to move and the slower velocity (null once it has come to rest). */
export function flingStep(vel: { vx: number; vy: number }, dt: number): { dx: number; dy: number; next: { vx: number; vy: number } | null } {
  const decay = Math.exp(-FLING_FRICTION * dt)
  const next = { vx: vel.vx * decay, vy: vel.vy * decay }
  return { dx: vel.vx * dt, dy: vel.vy * dt, next: Math.hypot(next.vx, next.vy) < FLING_STOP ? null : next }
}
