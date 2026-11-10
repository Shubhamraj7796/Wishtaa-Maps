import { describe, expect, it } from 'vitest'
import type { Point, Rect } from '@/core/pdf/types'
import { HOLD_MS, recognize, STILL_PX, straightEnd, type Snap } from './recognize'

const W = 600
const H = 800
const ON = { lines: true, shapes: true }
/** A tiny deterministic wobble (pixels), so the strokes are not perfect. */
const wob = (i: number, amp = 1.2) => Math.sin(i * 12.9898) * amp
const pt = (x: number, y: number): Point => [x / W, y / H]

/** A path through pixel corners, with `per` points on each side and a little wobble. */
function path(corners: [number, number][], per = 12, amp = 1.2): Point[] {
  const out: Point[] = []
  let k = 0
  for (let c = 1; c < corners.length; c++) {
    const a = corners[c - 1] as [number, number]
    const b = corners[c] as [number, number]
    for (let i = 0; i < per; i++) {
      const t = i / per
      out.push(pt(a[0] + (b[0] - a[0]) * t + wob(k++, amp), a[1] + (b[1] - a[1]) * t + wob(k++, amp)))
    }
  }
  out.push(pt((corners[corners.length - 1] as [number, number])[0], (corners[corners.length - 1] as [number, number])[1]))
  return out
}
const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 48): Point[] => Array.from({ length: n + 1 }, (_, i) => pt(cx + rx * Math.cos((i / n) * 2 * Math.PI) + wob(i), cy + ry * Math.sin((i / n) * 2 * Math.PI) + wob(i + 99)))
const px = (p: Point) => [p[0] * W, p[1] * H] as const

describe('straight-angle correction: the decisions', () => {
  it('holds still for 0.6 seconds', () => {
    expect(HOLD_MS).toBe(600)
    expect(STILL_PX).toBeGreaterThan(0)
  })

  it('a nearly straight stroke becomes a line; a nearly flat one becomes exactly flat', () => {
    const s = recognize(path([[100, 200], [420, 205]]), W, H, ON) as Extract<Snap, { a: Point }>
    expect(s.kind).toBe('line')
    expect(px(s.a)[0]).toBeCloseTo(100, 0)
    expect(s.b[1]).toBeCloseTo(s.a[1], 10) // exactly flat
    expect(px(s.b)[0]).toBeGreaterThan(410)
  })

  it('a line near upright becomes exactly upright; a diagonal near 45 degrees becomes 45 exactly', () => {
    const up = recognize(path([[300, 100], [304, 480]]), W, H, ON) as Extract<Snap, { a: Point }>
    expect(up.kind).toBe('line')
    expect(up.b[0]).toBeCloseTo(up.a[0], 10)
    const diag = recognize(path([[100, 100], [400, 395]]), W, H, ON) as Extract<Snap, { a: Point }>
    expect(diag.kind).toBe('line')
    const [ax, ay] = px(diag.a)
    const [bx, by] = px(diag.b)
    expect(Math.abs(bx - ax)).toBeCloseTo(Math.abs(by - ay), 4)
  })

  it('a line at an odd angle stays where it is (it is straightened, not turned)', () => {
    const s = recognize(path([[100, 100], [500, 260]]), W, H, ON) as Extract<Snap, { a: Point }>
    expect(s.kind).toBe('line')
    expect(px(s.b)[0]).toBeCloseTo(500, 0)
    expect(px(s.b)[1]).toBeCloseTo(260, 0)
  })

  it('a stroke with a hooked end is an arrow, from the start to the tip', () => {
    const s = recognize(path([[100, 300], [420, 300], [385, 270]], 16, 0.8), W, H, ON) as Extract<Snap, { a: Point }>
    expect(s.kind).toBe('arrow')
    expect(px(s.b)[0]).toBeCloseTo(420, -1)
    expect(s.b[1]).toBeCloseTo(s.a[1], 10)
  })

  it('a nearly closed loop with corners becomes a rectangle', () => {
    const s = recognize(path([[100, 100], [400, 100], [400, 300], [100, 300], [104, 108]], 14), W, H, ON) as Extract<Snap, { rect: Rect }>
    expect(s.kind).toBe('rect')
    expect(s.rect.x * W).toBeCloseTo(100, -1)
    expect(s.rect.w * W).toBeCloseTo(300, -1)
    expect(s.rect.h * H).toBeCloseTo(200, -1)
  })

  it('a nearly closed round loop becomes an ellipse, and a round one a clean circle', () => {
    const e = recognize(ellipse(300, 300, 180, 90), W, H, ON) as Extract<Snap, { rect: Rect }>
    expect(e.kind).toBe('ellipse')
    expect(e.rect.w * W).toBeGreaterThan(e.rect.h * H * 1.5)
    const c = recognize(ellipse(300, 400, 100, 104), W, H, ON) as Extract<Snap, { rect: Rect }>
    expect(c.kind).toBe('ellipse')
    expect(c.rect.w * W).toBeCloseTo(c.rect.h * H, 6) // a clean circle
  })

  it('a scribble, a wave and a half-open curve stay as drawn', () => {
    const wave = Array.from({ length: 60 }, (_, i) => pt(80 + i * 7, 300 + Math.sin(i / 4) * 40))
    expect(recognize(wave, W, H, ON)).toBeNull()
    const c = ellipse(300, 300, 150, 150, 48).slice(0, 30) // three quarters of a circle: not closed
    expect(recognize(c, W, H, ON)).toBeNull()
    const scribble = Array.from({ length: 80 }, (_, i) => pt(200 + Math.sin(i * 1.3) * 60, 200 + Math.cos(i * 0.9) * 60 + i))
    expect(recognize(scribble, W, H, ON)).toBeNull()
  })

  it('a dot or a very short stroke is left alone', () => {
    expect(recognize([pt(10, 10), pt(11, 10), pt(12, 11)], W, H, ON)).toBeNull()
  })

  it('each kind can be switched off on its own', () => {
    const line = path([[100, 200], [420, 205]])
    const loop = path([[100, 100], [400, 100], [400, 300], [100, 300], [104, 108]], 14)
    expect(recognize(line, W, H, { lines: false, shapes: true })).toBeNull()
    expect(recognize(loop, W, H, { lines: true, shapes: false })).toBeNull()
    expect(recognize(loop, W, H, { lines: false, shapes: true })?.kind).toBe('rect')
    expect(recognize(line, W, H, { lines: true, shapes: false })?.kind).toBe('line')
  })

  it('straightEnd leaves a clearly slanted end alone', () => {
    expect(straightEnd([0.1, 0.1], [0.5, 0.3], W, H)).toEqual([0.5, 0.3])
  })
})
