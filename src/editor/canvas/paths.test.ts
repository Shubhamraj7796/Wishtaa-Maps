import { describe, expect, it } from 'vitest'
import type { LaidOut, SceneEdge } from '@/core/layout/types'
import { anchor, bracePath, edgePath, patternStyle, roundedPolyline, wedgePath } from './paths'

const box = (id: string, x: number, y: number, w = 100, h = 40): LaidOut => ({ id, x, y, w, h, side: 'right', depth: 1, branch: 0, flow: 'r' })
const edge = (over: Partial<SceneEdge>): SceneEdge => ({ from: 'a', to: 'b', fromSide: 'r', toSide: 'l', kind: 'curve', ...over })

describe('connector geometry', () => {
  const a = box('a', 0, 0)
  const b = box('b', 200, 100)

  it('anchors on the right sides of a box', () => {
    expect(anchor(a, 'r')).toEqual({ x: 100, y: 20 })
    expect(anchor(a, 'l')).toEqual({ x: 0, y: 20 })
    expect(anchor(a, 't')).toEqual({ x: 50, y: 0 })
    expect(anchor(a, 'b', 14)).toEqual({ x: 14, y: 40 })
    expect(anchor(a, 'b', 14, true)).toEqual({ x: 86, y: 40 }) // mirrored layouts measure from the right
    expect(anchor(a, 'c')).toEqual({ x: 50, y: 20 })
  })

  it('starts and ends on the anchors for every connector kind', () => {
    for (const kind of ['curve', 'elbow', 'straight'] as const) {
      const d = edgePath(a, b, edge({ kind }))
      expect(d.startsWith('M100 20')).toBe(true)
      expect(d.endsWith('200 120')).toBe(true)
    }
  })

  it('curves leave sideways for horizontal flow and downwards for vertical flow', () => {
    expect(edgePath(a, b, edge({ kind: 'curve' }))).toMatch(/^M100 20C150 20 150 120 200 120$/)
    const c = box('c', 0, 100)
    expect(edgePath(a, c, edge({ kind: 'curve', fromSide: 'b', toSide: 't' }))).toMatch(/^M50 40C50 70 50 70 50 100$/)
  })

  it('draws outline stacks as an L-shape from the parent’s bottom to the child’s left side', () => {
    const child = box('k', 28, 60)
    const d = edgePath(a, child, edge({ kind: 'elbow', fromSide: 'b', toSide: 'l', fromDx: 14 }))
    expect(d.startsWith('M14 40')).toBe(true)
    expect(d.endsWith('28 80')).toBe(true)
  })

  it('rounds corners without leaving the path', () => {
    const d = roundedPolyline([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }], 10)
    expect(d).toBe('M0 0L40 0Q50 0 50 10L50 50')
    expect(roundedPolyline([{ x: 0, y: 0 }], 5)).toBe('')
  })

  it('draws braces that reach every child and handle a single child', () => {
    const d = bracePath({ kind: 'brace', x0: 100, x1: 200, y0: 0, y1: 100, ym: 50, ys: [0, 50, 100], dir: 'r', branch: 0 })
    expect(d).toContain('L200 0')
    expect(d).toContain('L200 100')
    const single = bracePath({ kind: 'brace', x0: 100, x1: 200, y0: 50, y1: 50, ym: 50, ys: [50], dir: 'r', branch: 0 })
    expect(single).toContain('L200 50')
    const left = bracePath({ kind: 'brace', x0: 100, x1: 0, y0: 0, y1: 100, ym: 50, ys: [0, 100], dir: 'l', branch: 0 })
    expect(left).toContain('L0 0')
  })

  it('draws a closed wedge', () => {
    const d = wedgePath({ kind: 'wedge', cx: 0, cy: 0, r0: 10, r1: 100, a0: 0, a1: Math.PI / 2, branch: 0 })
    expect(d.startsWith('M10 0L100 0A100 100 0 0 1')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect(wedgePath({ kind: 'wedge', cx: 0, cy: 0, r0: 10, r1: 100, a0: 0, a1: Math.PI * 1.5, branch: 0 })).toContain(' 0 1 1 ')
  })

  it('has a background for every pattern but "none", scaled by zoom', () => {
    for (const p of ['dots', 'grid', 'lines', 'cross'] as const) {
      expect(patternStyle(p, '#ffffff', '#000000', 1).backgroundImage).toBeTruthy()
    }
    expect(patternStyle('none', '#ffffff', '#000000', 1)).toEqual({})
    expect(patternStyle('dots', '#ffffff', '#000000', 2).backgroundSize).toBe('48px 48px')
  })
})
