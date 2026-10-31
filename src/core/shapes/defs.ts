import type { Corner, Shape } from '../model/types'

/**
 * Every topic shape, drawn by us as SVG paths. For each shape: how to build its outline for any box size, the
 * text-safe area inside it (so text never touches the edge), and how big the box must be to hold some content.
 * Connection points (where branches attach) are found from the outline, see `anchors.ts`.
 */
export type ShapeGroup = 'Boxes' | 'Circles' | 'Lines' | 'Polygons' | 'Fancy'

/** Where each part of a shape is painted. */
export type LayerKind =
  | 'body' // filled with the topic's filling and stroked with its border
  | 'fillOnly' // filled, no border
  | 'stroke' // border only (second line of a double border, underlines)
  | 'ring' // filled with the ring colour (double circle)
  | 'inner' // filled with the inner colour (double circle)

export interface Layer {
  d: string
  kind: LayerKind
  evenodd?: boolean
  /** Dash pattern this shape draws its border with unless the topic sets one (dashed and dotted boxes). */
  dash?: string
}

export interface ShapeOpts {
  /** Border thickness (px). The outline is inset by half of it so the stroke stays inside the box. */
  bw: number
  corner?: Corner | null
  /** A corner radius in px from the theme, used when the topic sets no corner. */
  cornerPx?: number | null
  borderLine?: 'single' | 'double'
  ringWidth?: number
  ringGap?: number
}

export interface Geometry {
  layers: Layer[]
  /** One closed outline of the whole shape: used for the selection ring, connection points and the text-area checks. */
  outline: string
}

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
  w: number
  h: number
  cx: number
  cy: number
}

/** The text-safe area as fractions of the box: left, top, right, bottom. */
export type Inset = readonly [number, number, number, number]

export interface ShapeDef {
  id: Shape
  /** Spoken and shown name. */
  name: string
  group: ShapeGroup
  inset: Inset
  /** The box is always square (circles). */
  square?: boolean
  /** Corner style applies (rectangles). */
  rectLike?: boolean
  /** Shapes with no outline of their own (underline, text only) can't have a double border. */
  noDouble?: boolean
  /** Builds the shape inside `b` (already inset for the border). */
  build(b: Box, o: ShapeOpts): { layers: Layer[]; outline: string }
}

export const f = (n: number) => Math.round(n * 100) / 100
export const K = 0.5522847498

export const makeBox = (w: number, h: number, i: number): Box => {
  const x0 = i
  const y0 = i
  const x1 = Math.max(x0 + 1, w - i)
  const y1 = Math.max(y0 + 1, h - i)
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }
}

export const poly = (pts: readonly (readonly [number, number])[]) => `M${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join('L')}Z`

export function rrect(b: Box, r: number): string {
  const rr = Math.max(0, Math.min(r, b.w / 2, b.h / 2))
  if (rr < 0.5) return poly([[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]])
  const c = rr * (1 - K)
  return (
    `M${f(b.x0 + rr)} ${f(b.y0)}L${f(b.x1 - rr)} ${f(b.y0)}C${f(b.x1 - c)} ${f(b.y0)} ${f(b.x1)} ${f(b.y0 + c)} ${f(b.x1)} ${f(b.y0 + rr)}` +
    `L${f(b.x1)} ${f(b.y1 - rr)}C${f(b.x1)} ${f(b.y1 - c)} ${f(b.x1 - c)} ${f(b.y1)} ${f(b.x1 - rr)} ${f(b.y1)}` +
    `L${f(b.x0 + rr)} ${f(b.y1)}C${f(b.x0 + c)} ${f(b.y1)} ${f(b.x0)} ${f(b.y1 - c)} ${f(b.x0)} ${f(b.y1 - rr)}` +
    `L${f(b.x0)} ${f(b.y0 + rr)}C${f(b.x0)} ${f(b.y0 + c)} ${f(b.x0 + c)} ${f(b.y0)} ${f(b.x0 + rr)} ${f(b.y0)}Z`
  )
}

export function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  const kx = rx * K
  const ky = ry * K
  return (
    `M${f(cx + rx)} ${f(cy)}C${f(cx + rx)} ${f(cy + ky)} ${f(cx + kx)} ${f(cy + ry)} ${f(cx)} ${f(cy + ry)}` +
    `C${f(cx - kx)} ${f(cy + ry)} ${f(cx - rx)} ${f(cy + ky)} ${f(cx - rx)} ${f(cy)}` +
    `C${f(cx - rx)} ${f(cy - ky)} ${f(cx - kx)} ${f(cy - ry)} ${f(cx)} ${f(cy - ry)}` +
    `C${f(cx + kx)} ${f(cy - ry)} ${f(cx + rx)} ${f(cy - ky)} ${f(cx + rx)} ${f(cy)}Z`
  )
}

const body = (d: string, extra: Partial<Layer> = {}): Layer => ({ d, kind: 'body', ...extra })

/** A radius for box-like shapes: the topic's corner choice, else the theme's, else the shape's own. */
function radius(b: Box, o: ShapeOpts, own: number): number {
  const m = Math.min(b.w, b.h)
  if (o.corner === 'square') return 0
  if (o.corner === 'pill') return m / 2
  if (o.corner === 'rounded') return Math.min(12, m / 2)
  if (typeof o.cornerPx === 'number') return Math.min(o.cornerPx, m / 2)
  if (own < 0) return m * 0.28
  return own === Infinity ? m / 2 : own
}

const boxShape = (id: Shape, name: string, own: number, inset: Inset, extra: Partial<Layer> = {}): ShapeDef => ({
  id,
  name,
  group: 'Boxes',
  inset,
  rectLike: true,
  build: (b, o) => {
    const d = rrect(b, radius(b, o, own))
    return { layers: [body(d, extra)], outline: d }
  },
})

/** Corner points of a regular star or burst, stretched to the box. */
function starPoints(b: Box, points: number, inner: number): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? 1 : inner
    const a = -Math.PI / 2 + (i * Math.PI) / points
    out.push([b.cx + Math.cos(a) * r * (b.w / 2), b.cy + Math.sin(a) * r * (b.h / 2)])
  }
  return out
}

const polyShape = (id: Shape, name: string, group: ShapeGroup, inset: Inset, pts: (b: Box) => [number, number][]): ShapeDef => ({
  id,
  name,
  group,
  inset,
  build: (b) => {
    const d = poly(pts(b))
    return { layers: [body(d)], outline: d }
  },
})

/** The outline of four overlapping circles, as a polygon (the clover). */
function cloverPoints(b: Box): [number, number][] {
  const r = 0.27
  const centres: [number, number][] = [[0, -0.23], [0.23, 0], [0, 0.23], [-0.23, 0]]
  const out: [number, number][] = []
  const steps = 96
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    let best = 0
    for (const [px, py] of centres) {
      const proj = dx * px + dy * py
      const disc = r * r - (px * px + py * py) + proj * proj
      if (disc >= 0) best = Math.max(best, proj + Math.sqrt(disc))
    }
    out.push([b.cx + dx * best * b.w * 1.0, b.cy + dy * best * b.h * 1.0])
  }
  return out
}

export const SHAPE_DEFS: ShapeDef[] = [
  boxShape('rounded', 'Rounded box', 12, [0, 0, 0, 0]),
  boxShape('rect', 'Box', 4, [0, 0, 0, 0]),
  boxShape('pill', 'Pill', Infinity, [0, 0, 0, 0]),
  boxShape('softSquare', 'Soft square', -1, [0.08, 0.09, 0.08, 0.09]),
  {
    id: 'snippedBox',
    name: 'Snipped box',
    group: 'Boxes',
    inset: [0.07, 0.15, 0.07, 0.15],
    build: (b) => {
      const c = Math.min(b.w, b.h) * 0.22
      const d = poly([[b.x0 + c, b.y0], [b.x1 - c, b.y0], [b.x1, b.y0 + c], [b.x1, b.y1 - c], [b.x1 - c, b.y1], [b.x0 + c, b.y1], [b.x0, b.y1 - c], [b.x0, b.y0 + c]])
      return { layers: [body(d)], outline: d }
    },
  },
  boxShape('dashedBox', 'Dashed box', 4, [0, 0, 0, 0], { dash: '8 5' }),
  boxShape('dottedBox', 'Dotted box', 4, [0, 0, 0, 0], { dash: '1.5 5' }),

  {
    id: 'ellipse',
    name: 'Ellipse',
    group: 'Circles',
    inset: [1 / 12, 0.1, 1 / 12, 0.1],
    build: (b) => {
      const d = ellipse(b.cx, b.cy, b.w / 2, b.h / 2)
      return { layers: [body(d)], outline: d }
    },
  },
  {
    id: 'circle',
    name: 'Circle',
    group: 'Circles',
    inset: [0.15, 0.15, 0.15, 0.15],
    square: true,
    build: (b) => {
      const r = Math.min(b.w, b.h) / 2
      const d = ellipse(b.cx, b.cy, r, r)
      return { layers: [body(d)], outline: d }
    },
  },
  {
    id: 'ring',
    name: 'Ring',
    group: 'Circles',
    inset: [0.15, 0.15, 0.15, 0.15],
    square: true,
    build: (b) => {
      const r = Math.min(b.w, b.h) / 2
      const d = ellipse(b.cx, b.cy, r, r)
      return { layers: [{ d, kind: 'stroke' }], outline: d }
    },
  },
  {
    id: 'doubleCircle',
    name: 'Double circle',
    group: 'Circles',
    inset: [0.2, 0.2, 0.2, 0.2], // replaced by `textArea`, which depends on the ring and the gap
    square: true,
    noDouble: true,
    build: (b, o) => {
      // An outer ring, a gap (nothing is drawn: the canvas shows through), then the inner circle holding the text.
      const R = Math.min(b.w, b.h) / 2
      const ring = Math.max(1, Math.min(o.ringWidth ?? 6, R * 0.6))
      const gap = Math.max(0, Math.min(o.ringGap ?? 4, R * 0.5))
      const rin = Math.max(1, R - ring - gap)
      const outer = ellipse(b.cx, b.cy, R, R)
      return {
        layers: [
          { d: `${outer}${ellipse(b.cx, b.cy, R - ring, R - ring)}`, kind: 'ring', evenodd: true },
          { d: ellipse(b.cx, b.cy, rin, rin), kind: 'inner' },
        ],
        outline: outer,
      }
    },
  },

  {
    id: 'underline',
    name: 'Underline',
    group: 'Lines',
    inset: [0, 0, 0, 0],
    noDouble: true,
    build: (b, o) => {
      const y = b.y1 - 0
      const rect = poly([[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]])
      void o
      return { layers: [{ d: rect, kind: 'fillOnly' }, { d: `M${f(b.x0)} ${f(y)}L${f(b.x1)} ${f(y)}`, kind: 'stroke' }], outline: rect }
    },
  },
  {
    id: 'doubleUnderline',
    name: 'Double underline',
    group: 'Lines',
    inset: [0, 0, 0, 0.06],
    noDouble: true,
    build: (b, o) => {
      const gap = o.bw + 3
      const rect = poly([[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]])
      return {
        layers: [
          { d: rect, kind: 'fillOnly' },
          { d: `M${f(b.x0)} ${f(b.y1)}L${f(b.x1)} ${f(b.y1)}`, kind: 'stroke' },
          { d: `M${f(b.x0)} ${f(b.y1 - gap)}L${f(b.x1)} ${f(b.y1 - gap)}`, kind: 'stroke' },
        ],
        outline: rect,
      }
    },
  },
  {
    id: 'textOnly',
    name: 'Text only',
    group: 'Lines',
    inset: [0, 0, 0, 0],
    noDouble: true,
    build: (b) => {
      const rect = poly([[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]])
      return { layers: [], outline: rect }
    },
  },

  polyShape('diamond', 'Diamond', 'Polygons', [1 / 6, 0.1875, 1 / 6, 0.1875], (b) => [[b.cx, b.y0], [b.x1, b.cy], [b.cx, b.y1], [b.x0, b.cy]]),
  polyShape('parallelogram', 'Parallelogram', 'Polygons', [0.18, 0.04, 0.18, 0.04], (b) => {
    const s = b.w * 0.18
    return [[b.x0 + s, b.y0], [b.x1, b.y0], [b.x1 - s, b.y1], [b.x0, b.y1]]
  }),
  polyShape('hexagon', 'Hexagon', 'Polygons', [0.18, 0.1, 0.18, 0.1], (b) => {
    const s = b.w * 0.22
    return [[b.x0 + s, b.y0], [b.x1 - s, b.y0], [b.x1, b.cy], [b.x1 - s, b.y1], [b.x0 + s, b.y1], [b.x0, b.cy]]
  }),
  polyShape('octagon', 'Octagon', 'Polygons', [0.15, 0.15, 0.15, 0.15], (b) => {
    const cx = b.w * 0.28
    const cy = b.h * 0.28
    return [[b.x0 + cx, b.y0], [b.x1 - cx, b.y0], [b.x1, b.y0 + cy], [b.x1, b.y1 - cy], [b.x1 - cx, b.y1], [b.x0 + cx, b.y1], [b.x0, b.y1 - cy], [b.x0, b.y0 + cy]]
  }),
  polyShape('tag', 'Tag', 'Polygons', [0.03, 0.1, 0.17, 0.1], (b) => {
    const p = b.w * 0.2
    return [[b.x0, b.y0], [b.x1 - p, b.y0], [b.x1, b.cy], [b.x1 - p, b.y1], [b.x0, b.y1]]
  }),
  polyShape('gem', 'Gem', 'Polygons', [0.21, 0.02, 0.21, 0.4], (b) => [[b.x0 + b.w * 0.2, b.y0], [b.x1 - b.w * 0.2, b.y0], [b.x1, b.y0 + b.h * 0.34], [b.cx, b.y1], [b.x0, b.y0 + b.h * 0.34]]),
  {
    id: 'shield',
    name: 'Shield',
    group: 'Polygons',
    inset: [0.08, 0.08, 0.08, 0.3],
    build: (b) => {
      const d =
        `M${f(b.x0)} ${f(b.y0)}L${f(b.x1)} ${f(b.y0)}L${f(b.x1)} ${f(b.y0 + b.h * 0.55)}` +
        `C${f(b.x1)} ${f(b.y0 + b.h * 0.85)} ${f(b.cx + b.w * 0.2)} ${f(b.y0 + b.h * 0.95)} ${f(b.cx)} ${f(b.y1)}` +
        `C${f(b.cx - b.w * 0.2)} ${f(b.y0 + b.h * 0.95)} ${f(b.x0)} ${f(b.y0 + b.h * 0.85)} ${f(b.x0)} ${f(b.y0 + b.h * 0.55)}Z`
      return { layers: [body(d)], outline: d }
    },
  },

  {
    id: 'cloud',
    name: 'Cloud',
    group: 'Fancy',
    inset: [0.25, 0.25, 0.25, 0.25],
    build: (b) => {
      const n = 10
      const rx = (b.w / 2) * 0.8
      const ry = (b.h / 2) * 0.8
      const pt = (a: number, k: number): [number, number] => [b.cx + Math.cos(a) * rx * k, b.cy + Math.sin(a) * ry * k]
      const pts: [number, number][] = []
      for (let i = 0; i < n; i++) pts.push(pt((i / n) * Math.PI * 2 - Math.PI / 2, 1))
      let d = `M${f((pts[0] as [number, number])[0])} ${f((pts[0] as [number, number])[1])}`
      for (let i = 0; i < n; i++) {
        const next = pts[(i + 1) % n] as [number, number]
        const c = pt(((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2, 1.24)
        d += `Q${f(c[0])} ${f(c[1])} ${f(next[0])} ${f(next[1])}`
      }
      d += 'Z'
      return { layers: [body(d)], outline: d }
    },
  },
  polyShape('burst', 'Burst', 'Fancy', [0.24, 0.24, 0.24, 0.24], (b) => starPoints(b, 12, 0.78)),
  polyShape('starburst', 'Starburst', 'Fancy', [0.3, 0.3, 0.3, 0.3], (b) => starPoints(b, 16, 0.6)),
  polyShape('spikes', 'Spikes', 'Fancy', [0.33, 0.33, 0.33, 0.33], (b) => starPoints(b, 8, 0.5)),
  {
    id: 'callout',
    name: 'Speech bubble',
    group: 'Fancy',
    inset: [0.06, 0.06, 0.06, 0.26],
    build: (b) => {
      const yb = b.y0 + b.h * 0.8
      const r = Math.min(12, b.w / 4, (yb - b.y0) / 2)
      const c = r * (1 - K)
      const tx0 = b.x0 + b.w * 0.14
      const d =
        `M${f(b.x0 + r)} ${f(b.y0)}L${f(b.x1 - r)} ${f(b.y0)}C${f(b.x1 - c)} ${f(b.y0)} ${f(b.x1)} ${f(b.y0 + c)} ${f(b.x1)} ${f(b.y0 + r)}` +
        `L${f(b.x1)} ${f(yb - r)}C${f(b.x1)} ${f(yb - c)} ${f(b.x1 - c)} ${f(yb)} ${f(b.x1 - r)} ${f(yb)}` +
        `L${f(tx0 + b.w * 0.2)} ${f(yb)}L${f(b.x0 + b.w * 0.07)} ${f(b.y1)}L${f(tx0)} ${f(yb)}` +
        `L${f(b.x0 + r)} ${f(yb)}C${f(b.x0 + c)} ${f(yb)} ${f(b.x0)} ${f(yb - c)} ${f(b.x0)} ${f(yb - r)}` +
        `L${f(b.x0)} ${f(b.y0 + r)}C${f(b.x0)} ${f(b.y0 + c)} ${f(b.x0 + c)} ${f(b.y0)} ${f(b.x0 + r)} ${f(b.y0)}Z`
      return { layers: [body(d)], outline: d }
    },
  },
  {
    id: 'heart',
    name: 'Heart',
    group: 'Fancy',
    inset: [0.2, 0.22, 0.2, 0.34],
    build: (b) => {
      const p = (u: number, v: number) => `${f(b.x0 + u * b.w)} ${f(b.y0 + v * b.h)}`
      const d = `M${p(0.5, 1)}C${p(0.15, 0.74)} ${p(0, 0.52)} ${p(0, 0.3)}C${p(0, 0.1)} ${p(0.15, 0)} ${p(0.3, 0)}C${p(0.4, 0)} ${p(0.47, 0.05)} ${p(0.5, 0.16)}C${p(0.53, 0.05)} ${p(0.6, 0)} ${p(0.7, 0)}C${p(0.85, 0)} ${p(1, 0.1)} ${p(1, 0.3)}C${p(1, 0.52)} ${p(0.85, 0.74)} ${p(0.5, 1)}Z`
      return { layers: [body(d)], outline: d }
    },
  },
  polyShape('star', 'Star', 'Fancy', [0.3, 0.38, 0.3, 0.3], (b) => starPoints(b, 5, 0.46)),
  polyShape('cross', 'Cross', 'Fancy', [0.34, 0.34, 0.34, 0.34], (b) => {
    const a = 0.34
    const xs = [b.x0, b.x0 + b.w * a, b.x1 - b.w * a, b.x1]
    const ys = [b.y0, b.y0 + b.h * a, b.y1 - b.h * a, b.y1]
    return [[xs[1] as number, ys[0] as number], [xs[2] as number, ys[0] as number], [xs[2] as number, ys[1] as number], [xs[3] as number, ys[1] as number], [xs[3] as number, ys[2] as number], [xs[2] as number, ys[2] as number], [xs[2] as number, ys[3] as number], [xs[1] as number, ys[3] as number], [xs[1] as number, ys[2] as number], [xs[0] as number, ys[2] as number], [xs[0] as number, ys[1] as number], [xs[1] as number, ys[1] as number]]
  }),
  polyShape('clover', 'Clover', 'Fancy', [0.3, 0.3, 0.3, 0.3], (b) => cloverPoints(b)),
]

const BY_ID = new Map<string, ShapeDef>(SHAPE_DEFS.map((d) => [d.id, d]))

/** The definition for a shape (an unknown id falls back to the rounded box, so a bad file can't break drawing). */
export const shapeDef = (id: string): ShapeDef => BY_ID.get(id) ?? (BY_ID.get('rounded') as ShapeDef)
