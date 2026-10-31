import { describe, expect, it } from 'vitest'
import { SHAPES, type Shape } from '../model/types'
import { samplePath, type Pt } from '../theme/taper'
import { DEFAULT_GAP, DEFAULT_RING, DOUBLE_GAP, edgeAtX, fitBox, insideShape, isRectLike, outlinePoints, SHAPE_DEFS, shapeAnchors, shapeDef, shapeGeometry, shapeOutline, textArea } from './index'

const SIZES: [number, number][] = [[160, 60], [100, 100], [60, 160], [300, 120], [90, 40]]
/** Shapes whose text area is a deliberate approximation (the box is mostly padding already), kept exactly as before. */
const LEGACY = new Set<Shape>(['rounded', 'rect', 'pill', 'ellipse', 'diamond', 'underline'])
/** Shapes with no outline of their own, or boxes whose corners only clip a little: not checked against the outline. */
const SKIP_CONTAINMENT = new Set<Shape>([...LEGACY, 'doubleUnderline', 'textOnly', 'dashedBox', 'dottedBox', 'doubleCircle'])

const numbers = (d: string) => (d.match(/-?\d*\.?\d+/g) ?? []).map(Number)

function distToPolygon(p: Pt, poly: Pt[]): number {
  let best = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as Pt
    const b = poly[(i + 1) % poly.length] as Pt
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)))
  }
  return best
}

describe('the shape list', () => {
  it('has a definition for every shape, with a unique id and a spoken name', () => {
    expect(SHAPE_DEFS.map((d) => d.id).sort()).toEqual([...SHAPES].sort())
    expect(new Set(SHAPE_DEFS.map((d) => d.name)).size).toBe(SHAPE_DEFS.length)
    for (const d of SHAPE_DEFS) expect(d.name.length).toBeGreaterThan(2)
    expect(SHAPES.length).toBeGreaterThanOrEqual(30)
  })

  it('includes every shape that was asked for', () => {
    const names = SHAPE_DEFS.map((d) => d.name.toLowerCase()).join('|')
    for (const w of ['box', 'rounded box', 'ellipse', 'circle', 'underline', 'double underline', 'dashed box', 'dotted box', 'diamond', 'parallelogram', 'hexagon', 'octagon', 'pill', 'tag', 'cloud', 'burst', 'starburst', 'spikes', 'speech bubble', 'heart', 'star', 'cross', 'clover', 'gem', 'shield', 'soft square', 'snipped box', 'text only', 'ring', 'double circle']) {
      expect(names, w).toContain(w)
    }
  })

  it('falls back to the rounded box for an unknown id', () => {
    expect(shapeDef('nonsense').id).toBe('rounded')
  })
})

describe('shape geometry', () => {
  it.each(SHAPES)('%s stays inside its box, is closed, and is cached', (id) => {
    for (const [w, h] of SIZES) {
      const g = shapeGeometry(id, w, h, { bw: 2 })
      expect(g.outline.endsWith('Z')).toBe(true)
      for (const layer of g.layers) for (const n of numbers(layer.d)) expect(n).toBeGreaterThanOrEqual(-0.6)
      for (const n of numbers(g.outline)) expect(n).toBeLessThanOrEqual(Math.max(w, h) + 0.6)
      const pts = outlinePoints(id, w, h)
      for (const p of pts) {
        expect(p.x, `${id} ${w}x${h}`).toBeGreaterThanOrEqual(-0.6)
        expect(p.x).toBeLessThanOrEqual(w + 0.6)
        expect(p.y).toBeGreaterThanOrEqual(-0.6)
        expect(p.y).toBeLessThanOrEqual(h + 0.6)
      }
      expect(shapeGeometry(id, w, h, { bw: 2 })).toBe(g) // cached: same object
    }
    expect(shapeGeometry(id, 100, 50, { bw: 2 })).not.toBe(shapeGeometry(id, 101, 50, { bw: 2 }))
  })

  it('draws something for every shape except text only', () => {
    for (const id of SHAPES) expect(shapeGeometry(id, 120, 60, { bw: 2 }).layers.length > 0, id).toBe(id !== 'textOnly')
  })

  it('keeps the border inside the box (the outline is inset by half the border)', () => {
    const body = shapeGeometry('rect', 100, 50, { bw: 8 }).layers[0]!.d
    for (const n of numbers(body)) expect(n).toBeGreaterThanOrEqual(4)
    expect(Math.max(...numbers(body))).toBeLessThanOrEqual(96)
  })

  it('dashed and dotted boxes carry their own dash pattern', () => {
    expect(shapeGeometry('dashedBox', 100, 40, { bw: 2 }).layers[0]?.dash).toBe('8 5')
    expect(shapeGeometry('dottedBox', 100, 40, { bw: 2 }).layers[0]?.dash).toBe('1.5 5')
    expect(shapeGeometry('rect', 100, 40, { bw: 2 }).layers[0]?.dash).toBeUndefined()
  })

  it('the underline shapes are lines, not boxes', () => {
    const one = shapeGeometry('underline', 100, 40, { bw: 2 })
    expect(one.layers.map((l) => l.kind)).toEqual(['fillOnly', 'stroke'])
    const two = shapeGeometry('doubleUnderline', 100, 40, { bw: 2 })
    expect(two.layers.filter((l) => l.kind === 'stroke')).toHaveLength(2)
    const ys = two.layers.filter((l) => l.kind === 'stroke').map((l) => numbers(l.d)[1] as number)
    expect(Math.abs((ys[0] as number) - (ys[1] as number))).toBeCloseTo(2 + DOUBLE_GAP, 5)
  })
})

describe('corners', () => {
  const body = (o: Parameters<typeof shapeGeometry>[3], id: Shape = 'rect') => shapeGeometry(id, 160, 60, o).layers[0]!.d
  it('square has no curves; pill is as round as the box is high; rounded is 12 px', () => {
    expect(body({ bw: 2, corner: 'square' })).not.toContain('C')
    const pill = body({ bw: 2, corner: 'pill' })
    expect(numbers(pill)[0]).toBeCloseTo(1 + (60 - 2) / 2, 1) // starts one radius in
    const rounded = body({ bw: 2, corner: 'rounded' })
    expect(numbers(rounded)[0]).toBeCloseTo(1 + 12, 1)
  })
  it('without a topic choice, the theme’s radius and then the shape’s own are used', () => {
    expect(numbers(body({ bw: 2, cornerPx: 20 }))[0]).toBeCloseTo(1 + 20, 1)
    expect(numbers(body({ bw: 2 }))[0]).toBeCloseTo(1 + 4, 1)
    expect(numbers(body({ bw: 2 }, 'rounded'))[0]).toBeCloseTo(1 + 12, 1)
  })
  it('only box shapes change; others ignore it', () => {
    for (const id of SHAPES) {
      const a = shapeGeometry(id, 120, 60, { bw: 2, corner: 'pill' }).outline
      const b = shapeGeometry(id, 120, 60, { bw: 2, corner: 'square' }).outline
      if (isRectLike(id)) expect(a, id).not.toBe(b)
      else expect(a, id).toBe(b)
    }
    expect(SHAPES.filter(isRectLike).sort()).toEqual(['dashedBox', 'dottedBox', 'pill', 'rect', 'rounded', 'softSquare'])
  })
})

describe('the text-safe area', () => {
  const checked = SHAPES.filter((s) => !SKIP_CONTAINMENT.has(s))

  it.each(checked)('%s: the whole text rectangle lies inside the outline, at every box proportion', (id) => {
    for (const [w, h] of [...SIZES, [200, 200], [400, 90]] as [number, number][]) {
      const t = textArea(id, w, h)
      const poly = outlinePoints(id, w, h)
      const shrink = 0.5
      for (let i = 0; i <= 20; i++) {
        const u = i / 20
        const x = t.x + shrink + u * (t.w - 2 * shrink)
        const y = t.y + shrink + u * (t.h - 2 * shrink)
        for (const [px, py] of [[x, t.y + shrink], [x, t.y + t.h - shrink], [t.x + shrink, y], [t.x + t.w - shrink, y]] as [number, number][]) {
          expect(insideShape(poly, px, py), `${id} ${w}x${h} at ${px.toFixed(1)},${py.toFixed(1)}`).toBe(true)
        }
      }
    }
  })

  it('every text area is inside its box and has room', () => {
    for (const id of SHAPES)
      for (const [w, h] of SIZES) {
        const t = textArea(id, w, h)
        expect(t.x).toBeGreaterThanOrEqual(0)
        expect(t.y).toBeGreaterThanOrEqual(0)
        expect(t.x + t.w).toBeLessThanOrEqual(w + 0.001)
        expect(t.y + t.h).toBeLessThanOrEqual(h + 0.001)
        expect(t.w).toBeGreaterThan(0)
        expect(t.h).toBeGreaterThan(0)
      }
  })

  it('a box fitted to some content always has a text area at least that big', () => {
    for (const id of SHAPES)
      for (const [cw, ch] of [[80, 30], [200, 60], [60, 120], [140, 140]] as [number, number][]) {
        const box = fitBox(id, cw, ch)
        const t = textArea(id, box.w, box.h)
        expect(t.w, `${id} width for ${cw}x${ch}`).toBeGreaterThanOrEqual(cw - 1)
        expect(t.h, `${id} height for ${cw}x${ch}`).toBeGreaterThanOrEqual(ch - 1)
      }
  })

  it('circles are always square, and big enough for the text corners (inscribed-square rule)', () => {
    for (const id of ['circle', 'ring', 'doubleCircle'] as const) {
      const b = fitBox(id, 150, 40)
      expect(b.w).toBe(b.h)
      expect(b.w).toBeGreaterThanOrEqual(Math.ceil(Math.hypot(150, 40)))
    }
  })

  it('keeps the sizes the older shapes always had (so existing maps lay out the same)', () => {
    expect(fitBox('rounded', 100, 40)).toEqual({ w: 100, h: 40 })
    expect(fitBox('rect', 100, 40)).toEqual({ w: 100, h: 40 })
    expect(fitBox('pill', 100, 40)).toEqual({ w: 100, h: 40 })
    expect(fitBox('underline', 100, 40)).toEqual({ w: 100, h: 40 })
    expect(fitBox('ellipse', 100, 40)).toEqual({ w: Math.ceil(100 * 1.2), h: Math.ceil(40 * 1.25) })
    expect(fitBox('diamond', 100, 40)).toEqual({ w: Math.ceil(100 * 1.5), h: Math.ceil(40 * 1.6) })
  })

  it('odd shapes need more room than a box for the same content', () => {
    for (const id of ['cloud', 'star', 'heart', 'burst', 'starburst', 'spikes', 'hexagon', 'octagon', 'clover', 'cross'] as const) {
      const b = fitBox(id, 100, 40)
      expect(b.w * b.h, id).toBeGreaterThan(100 * 40)
    }
  })
})

describe('connection points', () => {
  it('rectangles connect at the middle of each side', () => {
    for (const id of ['rect', 'rounded', 'pill', 'softSquare', 'underline', 'textOnly'] as const) {
      const a = shapeAnchors(id, 120, 50)
      expect(a.l).toEqual({ x: 0, y: 25 })
      expect(a.r).toEqual({ x: 120, y: 25 })
      expect(a.t).toEqual({ x: 60, y: 0 })
      expect(a.b).toEqual({ x: 60, y: 50 })
    }
  })

  it('a diamond connects at its four corners; an ellipse at its four extremes', () => {
    const d = shapeAnchors('diamond', 100, 60)
    expect(d.l).toEqual({ x: 0, y: 30 })
    expect(d.t).toEqual({ x: 50, y: 0 })
    const e = shapeAnchors('ellipse', 100, 60)
    expect(e.l.x).toBeCloseTo(0, 1)
    expect(e.r.x).toBeCloseTo(100, 1)
    expect(e.t.y).toBeCloseTo(0, 1)
  })

  it.each(SHAPES)('%s: every connection point is on the outline and inside the box', (id) => {
    for (const [w, h] of SIZES) {
      const a = shapeAnchors(id, w, h)
      const poly = outlinePoints(id, w, h)
      for (const p of [a.l, a.r, a.t, a.b]) {
        expect(p.x).toBeGreaterThanOrEqual(-0.01)
        expect(p.x).toBeLessThanOrEqual(w + 0.01)
        expect(p.y).toBeGreaterThanOrEqual(-0.01)
        expect(p.y).toBeLessThanOrEqual(h + 0.01)
        expect(distToPolygon(p, poly), `${id} ${w}x${h}`).toBeLessThan(1.5)
      }
      expect(a.l.x).toBeLessThanOrEqual(a.r.x)
      expect(a.t.y).toBeLessThanOrEqual(a.b.y)
    }
  })

  it('symmetric shapes connect symmetrically', () => {
    for (const id of ['rounded', 'ellipse', 'circle', 'diamond', 'hexagon', 'octagon', 'cross', 'clover', 'doubleCircle', 'ring', 'softSquare', 'snippedBox'] as const) {
      const a = shapeAnchors(id, 140, 140)
      expect(a.l.x + a.r.x, id).toBeCloseTo(140, 0)
      expect(a.t.y + a.b.y, id).toBeCloseTo(140, 0)
    }
  })

  it('the heart’s lower connection point is its tip, the tag’s right one is its point', () => {
    expect(shapeAnchors('heart', 100, 100).b.y).toBeCloseTo(100, 0)
    const tag = shapeAnchors('tag', 100, 50)
    expect(tag.r.x).toBeCloseTo(100, 0)
    expect(tag.l.x).toBeCloseTo(0, 0)
  })

  it('attaching away from the centre follows the outline', () => {
    expect(edgeAtX('rect', 100, 50, 20, 't')).toBe(0)
    expect(edgeAtX('rect', 100, 50, 20, 'b')).toBe(50)
    const top = edgeAtX('circle', 100, 100, 50, 't')
    expect(top).toBeCloseTo(0, 0)
    expect(edgeAtX('circle', 100, 100, 5, 't')).toBeGreaterThan(25) // near the side, the circle is far from the top
  })
})

describe('the double circle', () => {
  const o = { bw: 2 }
  const rings = (w = 120, h = 120, opts: Parameters<typeof shapeGeometry>[3] = o) => shapeGeometry('doubleCircle', w, h, opts)
  const radii = (d: string) => {
    // Each circle path starts at the rightmost point: (cx + r, cy).
    const starts = [...d.matchAll(/M([\d.]+) ([\d.]+)C/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }))
    return starts.map((p) => p.x)
  }

  it('is an outer ring, a gap, and an inner circle (ring and inner drawn separately)', () => {
    const g = rings()
    expect(g.layers.map((l) => l.kind)).toEqual(['ring', 'inner'])
    expect(g.layers[0]?.evenodd).toBe(true)
    const [outerX, ringInnerX] = radii(g.layers[0]!.d)
    const cx = 60
    const R = (outerX as number) - cx
    expect(R).toBeCloseTo(59, 1) // half the box, less the border inset
    expect((ringInnerX as number) - cx).toBeCloseTo(R - DEFAULT_RING, 1) // ring thickness (default 6)
    const inner = radii(g.layers[1]!.d)[0] as number
    expect(inner - cx).toBeCloseTo(R - DEFAULT_RING - DEFAULT_GAP, 1) // then the gap (default 4)
  })

  it('ring thickness and gap are independent', () => {
    const base = rings()
    const thick = rings(120, 120, { ...o, ringWidth: 12 })
    const wide = rings(120, 120, { ...o, ringGap: 10 })
    const innerR = (g: ReturnType<typeof rings>) => (radii(g.layers[1]!.d)[0] as number) - 60
    const ringIn = (g: ReturnType<typeof rings>) => (radii(g.layers[0]!.d)[1] as number) - 60
    expect(ringIn(thick)).toBeLessThan(ringIn(base)) // thicker ring reaches further in
    expect(ringIn(wide)).toBeCloseTo(ringIn(base), 3) // gap doesn't change the ring
    expect(innerR(thick)).toBeLessThan(innerR(base))
    expect(innerR(wide)).toBeLessThan(innerR(base))
    expect(innerR(base) - innerR(wide)).toBeCloseTo(6, 1)
    expect(innerR(base) - innerR(thick)).toBeCloseTo(6, 1)
  })

  it('branches attach to the outer ring', () => {
    const a = shapeAnchors('doubleCircle', 120, 120)
    for (const p of [a.l, a.r, a.t, a.b]) expect(Math.hypot(p.x - 60, p.y - 60)).toBeCloseTo(60, 0)
    expect(shapeOutline('doubleCircle', 120, 120)).toBe(shapeGeometry('doubleCircle', 120, 120, { bw: 0 }).outline)
  })

  it('the text sits in the inner circle (its corners are inside it), centred', () => {
    for (const [ring, gap] of [[6, 4], [3, 0], [12, 8]] as const) {
      const t = textArea('doubleCircle', 160, 160, { ringWidth: ring, ringGap: gap })
      const rin = 80 - ring - gap
      expect(Math.hypot(t.w / 2, t.h / 2)).toBeLessThanOrEqual(rin + 0.001)
      expect(t.x + t.w / 2).toBeCloseTo(80, 5)
      expect(t.y + t.h / 2).toBeCloseTo(80, 5)
    }
  })

  it('is sized so text fits inside the inner circle, with the ring and gap on top', () => {
    const b = fitBox('doubleCircle', 120, 40)
    expect(b.w).toBe(b.h)
    expect(b.w).toBe(Math.ceil(120 * Math.SQRT2 + 2 * (DEFAULT_RING + DEFAULT_GAP)))
    const thick = fitBox('doubleCircle', 120, 40, { ringWidth: 14, ringGap: 8 })
    expect(thick.w).toBeGreaterThan(b.w)
    const t = textArea('doubleCircle', thick.w, thick.h, { ringWidth: 14, ringGap: 8 })
    expect(t.w).toBeGreaterThanOrEqual(119)
  })

  it('the border style "double" does not add a line to it (it already has its own ring)', () => {
    expect(shapeGeometry('doubleCircle', 100, 100, { bw: 2, borderLine: 'double' }).layers).toHaveLength(2)
  })
})

describe('double border', () => {
  it('adds a second line inside the first for shapes with an outline', () => {
    for (const id of ['rect', 'rounded', 'ellipse', 'hexagon', 'heart', 'cloud', 'ring'] as const) {
      const single = shapeGeometry(id, 160, 80, { bw: 2 })
      const dbl = shapeGeometry(id, 160, 80, { bw: 2, borderLine: 'double' })
      expect(dbl.layers.length, id).toBe(single.layers.length + 1)
      const inner = dbl.layers[dbl.layers.length - 1]!
      expect(inner.kind).toBe('stroke')
      const outer = outlinePoints(id, 160, 80)
      void outer
      const xs = samplePath(inner.d, 4).map((p) => p.x)
      const outerXs = samplePath(single.layers[0]!.d, 4).map((p) => p.x)
      expect(Math.min(...xs), id).toBeGreaterThan(Math.min(...outerXs) + 2) // inside the first line
      expect(Math.max(...xs), id).toBeLessThan(Math.max(...outerXs) - 2)
    }
  })

  it('leaves shapes with no outline of their own alone', () => {
    for (const id of ['underline', 'doubleUnderline', 'textOnly', 'doubleCircle'] as const) {
      expect(shapeGeometry(id, 100, 50, { bw: 2, borderLine: 'double' }).layers).toHaveLength(shapeGeometry(id, 100, 50, { bw: 2 }).layers.length)
    }
  })

  it('is not drawn when there is no border', () => {
    expect(shapeGeometry('rect', 100, 50, { bw: 0, borderLine: 'double' }).layers).toHaveLength(1)
  })
})
