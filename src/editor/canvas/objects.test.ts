import { describe, expect, it } from 'vitest'
import {
  arrowEnds,
  arrowHeadPath,
  bendForPointer,
  boundaryGeometry,
  calloutGeometry,
  calloutSize,
  edgePoint,
  relationshipGeometry,
  summaryGeometry,
  summaryLabelSize,
  union,
  type Box,
} from './objects'

const box = (x: number, y: number, w = 100, h = 40): Box => ({ x, y, w, h })

describe('relationship lines', () => {
  const a = box(0, 0)
  const b = box(300, 200)

  it('leaves each box on its edge, never inside it', () => {
    const g = relationshipGeometry(a, b, 60)
    const onEdge = (p: { x: number; y: number }, bx: Box) => {
      const inside = p.x > bx.x + 0.01 && p.x < bx.x + bx.w - 0.01 && p.y > bx.y + 0.01 && p.y < bx.y + bx.h - 0.01
      const touching = Math.abs(p.x - bx.x) < 0.01 || Math.abs(p.x - bx.x - bx.w) < 0.01 || Math.abs(p.y - bx.y) < 0.01 || Math.abs(p.y - bx.y - bx.h) < 0.01
      return !inside && touching
    }
    expect(onEdge(g.start, a)).toBe(true)
    expect(onEdge(g.end, b)).toBe(true)
    expect(g.d.startsWith('M')).toBe(true)
  })

  it('bends to one side or the other, and straight when bend is 0', () => {
    const up = relationshipGeometry(a, b, 80)
    const down = relationshipGeometry(a, b, -80)
    const straight = relationshipGeometry(a, b, 0)
    expect(up.control.x).not.toBeCloseTo(down.control.x)
    const chordMid = { x: 200, y: 120 }
    expect(straight.control.x).toBeCloseTo(chordMid.x)
    expect(straight.control.y).toBeCloseTo(chordMid.y)
  })

  it('round-trips: dragging the middle to a point gives the bend that reaches it', () => {
    const bend = 90
    const g = relationshipGeometry(a, b, bend)
    const recovered = bendForPointer(a, b, g.mid)
    expect(Math.abs(recovered - bend)).toBeLessThanOrEqual(1)
    expect(bendForPointer(a, b, { x: 200, y: 120 })).toBe(0) // on the straight line
  })

  it('copes with topics on top of each other', () => {
    const g = relationshipGeometry(box(0, 0), box(0, 0), 50)
    expect(Number.isFinite(g.start.x) && Number.isFinite(g.end.y)).toBe(true)
  })

  it('finds the exit point of a box', () => {
    expect(edgePoint(box(0, 0, 100, 40), { x: 300, y: 20 })).toEqual({ x: 100, y: 20 })
    expect(edgePoint(box(0, 0, 100, 40), { x: 50, y: -100 })).toEqual({ x: 50, y: 0 })
    expect(edgePoint(box(0, 0, 100, 40), { x: 50, y: 20 })).toEqual({ x: 50, y: 20 })
  })

  it('draws arrow heads at the chosen ends', () => {
    expect(arrowEnds('end')).toEqual({ start: false, end: true })
    expect(arrowEnds('start')).toEqual({ start: true, end: false })
    expect(arrowEnds('both')).toEqual({ start: true, end: true })
    expect(arrowEnds('none')).toEqual({ start: false, end: false })
    const d = arrowHeadPath({ x: 10, y: 10 }, 0, 10)
    expect(d.startsWith('M10 10L')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
  })
})

describe('boundaries', () => {
  const boxes = [box(0, 0), box(200, 100)]
  it('encloses every box with padding', () => {
    expect(union(boxes)).toEqual({ x: 0, y: 0, w: 300, h: 140 })
    const g = boundaryGeometry(boxes, 'rounded', 16)!
    expect(g.box).toEqual({ x: -16, y: -16, w: 332, h: 172 })
    expect(g.rx).toBeGreaterThan(boundaryGeometry(boxes, 'rect')!.rx)
    expect(boundaryGeometry([], 'rect')).toBeNull()
  })
  it('the ellipse contains the corners of the group', () => {
    const g = boundaryGeometry(boxes, 'ellipse', 10)!
    const cx = g.box.x + g.box.w / 2
    const cy = g.box.y + g.box.h / 2
    for (const [x, y] of [[0, 0], [300, 0], [0, 140], [300, 140]] as const) {
      const v = ((x - cx) / (g.box.w / 2)) ** 2 + ((y - cy) / (g.box.h / 2)) ** 2
      expect(v).toBeLessThanOrEqual(1.0001)
    }
  })
})

describe('summary brackets', () => {
  const kids = [box(200, 0), box(200, 60), box(200, 120)]
  const label = summaryLabelSize('Summary')

  it('sits beside the children on the side they hang from', () => {
    const r = summaryGeometry(kids, 'r', label)!
    expect(r.label.x).toBeGreaterThan(300) // right of the children (they end at x = 300)
    expect(r.label.y + r.label.h / 2).toBeCloseTo(80) // centred on the group
    const l = summaryGeometry(kids, 'l', label)!
    expect(l.label.x + l.label.w).toBeLessThan(200)
    const below = summaryGeometry([box(0, 0), box(150, 0)], 'b', label)!
    expect(below.label.y).toBeGreaterThan(40)
    const above = summaryGeometry([box(0, 100), box(150, 100)], 't', label)!
    expect(above.label.y + above.label.h).toBeLessThan(100)
    expect(r.d.startsWith('M')).toBe(true)
  })
  it('handles a single child and no children', () => {
    expect(summaryGeometry([box(0, 0)], 'r', label)).not.toBeNull()
    expect(summaryGeometry([], 'r', label)).toBeNull()
  })
  it('sizes the summary box for its text', () => {
    expect(summaryLabelSize('x').w).toBe(90)
    expect(summaryLabelSize('x'.repeat(100)).w).toBe(260)
  })
})

describe('callouts', () => {
  it('sizes the bubble for its text', () => {
    expect(calloutSize('hi')).toEqual({ w: 110, h: 37 })
    expect(calloutSize('x'.repeat(300)).w).toBe(230)
    expect(calloutSize('x'.repeat(300)).h).toBeGreaterThan(calloutSize('hi').h)
    expect(calloutSize('').h).toBeGreaterThan(0)
  })
  it('places the bubble away from the topic with a tail that reaches it', () => {
    const topic = box(100, 100, 100, 40)
    const size = calloutSize('note')
    const g = calloutGeometry(topic, 40, -80, size)
    expect(g.box.y + g.box.h).toBeLessThan(topic.y + topic.h) // above
    expect(g.tail.startsWith('M')).toBe(true)
    expect(g.tail.endsWith('Z')).toBe(true)
    const moved = calloutGeometry({ ...topic, x: topic.x + 500 }, 40, -80, size)
    expect(moved.box.x - g.box.x).toBeCloseTo(500) // follows the topic
  })
})
