import { buildIndex, childrenOf, type TopicMap } from '../model/tree'
import type { TopicData, TopicImage } from '../model/topic'

/** Branch colours: all reach 4.5:1 contrast against white text. */
export const PALETTE = ['#0f766e', '#1d4ed8', '#b45309', '#be185d', '#6d28d9', '#15803d', '#b91c1c', '#0e7490']

export interface LaidOut {
  id: string
  x: number
  y: number
  w: number
  h: number
  side: 'root' | 'left' | 'right'
  depth: number
  /** Index of the top-level branch (colour), -1 for the central topic. */
  branch: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Scene {
  rootId: string
  boxes: Map<string, LaidOut>
  /** Depth-first order of visible topics. */
  order: string[]
  edges: { from: string; to: string }[]
  /** Number of hidden descendants for topics whose children are not shown. */
  hidden: Map<string, number>
  bounds: Rect
  total: number
}

export interface SceneOptions {
  rootId: string
  /** Show topics down to this depth below the root (null = all). */
  maxDepth: number | null
  focusId: string | null
  /** Topics treated as expanded regardless of collapse/levels (search reveal). */
  reveal: ReadonlySet<string>
}

const H_GAP = 56
const V_GAP = 14
const FLOAT_GAP = 120

/** Extra space around an image inside a topic: border, padding and the text row below it. */
const IMAGE_PAD_X = 28
const IMAGE_PAD_Y = 20
const IMAGE_TEXT_ROW = 28

export function measure(text: string, depth: number, image?: TopicImage | null): { w: number; h: number } {
  const big = depth === 0
  const charW = big ? 9.4 : 7.8
  const pad = big ? 56 : 36
  const textW = Math.min(big ? 340 : 300, Math.max(big ? 120 : 72, Math.ceil(text.length * charW + pad)))
  if (!image) return { w: textW, h: big ? 52 : 38 }
  const hasText = text.trim().length > 0
  return {
    w: Math.max(hasText ? textW : 72, image.width + IMAGE_PAD_X),
    h: image.height + IMAGE_PAD_Y + (hasText ? IMAGE_TEXT_ROW : 0),
  }
}

export function emptyScene(rootId = ''): Scene {
  return {
    rootId,
    boxes: new Map(),
    order: [],
    edges: [],
    hidden: new Map(),
    bounds: { x: 0, y: 0, w: 0, h: 0 },
    total: 0,
  }
}

export function buildScene(topics: TopicMap, opts: SceneOptions): Scene {
  const idx = buildIndex(topics)
  const total = Object.keys(topics).length
  const rootId = opts.focusId && topics[opts.focusId] ? opts.focusId : opts.rootId
  const root = topics[rootId]
  if (!root) return emptyScene(rootId)

  const boxes = new Map<string, LaidOut>()
  const order: string[] = []
  const edges: { from: string; to: string }[] = []
  const hidden = new Map<string, number>()

  const counts = new Map<string, number>()
  const count = (id: string): number => {
    const known = counts.get(id)
    if (known !== undefined) return known
    let n = 1
    for (const k of childrenOf(idx, id)) n += count(k.id)
    counts.set(id, n)
    return n
  }

  const visibleKids = new Map<string, TopicData[]>()
  const sizes = new Map<string, { w: number; h: number }>()
  const heights = new Map<string, number>()

  const heightOf = (t: TopicData, depth: number): number => {
    const m = measure(t.text, depth, t.image)
    sizes.set(t.id, m)
    const all = childrenOf(idx, t.id)
    let kids = all
    if (all.length && !opts.reveal.has(t.id)) {
      const limited = opts.maxDepth !== null && depth >= opts.maxDepth
      if (limited || t.collapsed) {
        kids = []
        hidden.set(t.id, count(t.id) - 1)
      }
    }
    visibleKids.set(t.id, kids)
    let sum = 0
    kids.forEach((k, i) => {
      sum += heightOf(k, depth + 1) + (i ? V_GAP : 0)
    })
    const h = Math.max(m.h, sum)
    heights.set(t.id, h)
    return h
  }

  const place = (t: TopicData, depth: number, x: number, yc: number, side: 'left' | 'right', branch: number) => {
    const m = sizes.get(t.id) ?? { w: 72, h: 38 }
    const bx = side === 'left' ? x - m.w : x
    boxes.set(t.id, { id: t.id, x: bx, y: yc - m.h / 2, w: m.w, h: m.h, side, depth, branch })
    order.push(t.id)
    const kids = visibleKids.get(t.id) ?? []
    if (!kids.length) return
    const total = kids.reduce((s, k, i) => s + (heights.get(k.id) ?? 0) + (i ? V_GAP : 0), 0)
    let y = yc - total / 2
    const childX = side === 'left' ? bx - H_GAP : bx + m.w + H_GAP
    for (const k of kids) {
      const h = heights.get(k.id) ?? 0
      edges.push({ from: t.id, to: k.id })
      place(k, depth + 1, childX, y + h / 2, side, branch)
      y += h + V_GAP
    }
  }

  // Central topic with a balanced split: branches starting before the midpoint go right.
  heightOf(root, 0)
  const rm = sizes.get(root.id) ?? { w: 120, h: 52 }
  boxes.set(root.id, { id: root.id, x: -rm.w / 2, y: -rm.h / 2, w: rm.w, h: rm.h, side: 'root', depth: 0, branch: -1 })
  order.push(root.id)

  const kids = visibleKids.get(root.id) ?? []
  const totalH = kids.reduce((s, k, i) => s + (heights.get(k.id) ?? 0) + (i ? V_GAP : 0), 0)
  const right: number[] = []
  const left: number[] = []
  let acc = 0
  kids.forEach((k, i) => {
    ;(acc < totalH / 2 ? right : left).push(i)
    acc += (heights.get(k.id) ?? 0) + V_GAP
  })
  const placeSide = (indices: number[], side: 'left' | 'right') => {
    const list = indices.map((i) => kids[i]).filter((k): k is TopicData => !!k)
    const sum = list.reduce((s, k, i) => s + (heights.get(k.id) ?? 0) + (i ? V_GAP : 0), 0)
    let y = -sum / 2
    const x = side === 'right' ? rm.w / 2 + H_GAP : -rm.w / 2 - H_GAP
    for (const k of list) {
      const h = heights.get(k.id) ?? 0
      edges.push({ from: root.id, to: k.id })
      place(k, 1, x, y + h / 2, side, kids.indexOf(k))
      y += h + V_GAP
    }
  }
  placeSide(right, 'right')
  placeSide(left, 'left')

  // Free-floating topics (only in the full map view).
  if (!opts.focusId) {
    let maxY = 0
    boxes.forEach((b) => (maxY = Math.max(maxY, b.y + b.h)))
    const floats = (idx.get(null) ?? []).filter((t) => t.id !== opts.rootId)
    floats.forEach((t, i) => {
      const pos = t.floatingPosition ?? { x: 0, y: maxY + FLOAT_GAP * (i + 1) }
      heightOf(t, 0)
      const m = sizes.get(t.id) ?? { w: 120, h: 52 }
      place(t, 0, pos.x - m.w / 2, pos.y, 'right', kids.length + i)
    })
  }

  return { rootId, boxes, order, edges, hidden, bounds: boundsOf(boxes), total }
}

export function boundsOf(boxes: Map<string, LaidOut>): Rect {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  boxes.forEach((b) => {
    x0 = Math.min(x0, b.x)
    y0 = Math.min(y0, b.y)
    x1 = Math.max(x1, b.x + b.w)
    y1 = Math.max(y1, b.y + b.h)
  })
  if (!isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
