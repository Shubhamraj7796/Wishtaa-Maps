import { buildIndex, childrenOf, type ChildIndex, type TopicMap } from '../model/tree'
import type { BranchDir, TopicData, TopicImage } from '../model/topic'
import type { Shape, TopicStyle } from '../model/types'
import { countMarks } from '../marks'
import { clampTopicWidth } from '../theme/resolve'
import { fitBox, innerWidth } from '../shapes'
import { computeNumbers } from '../numbering'
import { noteText } from '../sanitize'
import { layoutDef, type LayoutDef } from './catalog'
import type { ConnectorKind, Decor, LaidOut, Rect, Scene, SceneEdge, SceneOptions, Side } from './types'

export type { ConnectorKind, Decor, LaidOut, Rect, Scene, SceneEdge, SceneOptions, Side }

interface Size {
  w: number
  h: number
}

const H_GAP = 56
const V_GAP = 14
const ROW_GAP = 22
const DOWN_GAP = 40
const INDENT = 28
const STACK_GAP = 10

/** How many lines `text` takes when each line holds about `perLine` characters (words wrap; long words break). */
export function wrapLineCount(text: string, perLine: number): number {
  let lines = 0
  for (const para of text.split('\n')) {
    let used = 0
    let n = 1
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let len = word.length
      while (len > perLine) {
        // A word longer than a line breaks across lines.
        if (used > 0) {
          n++
          used = 0
        }
        n += Math.floor((len - 1) / perLine)
        len = ((len - 1) % perLine) + 1
        used = len
        len = 0
      }
      if (len === 0) continue
      if (used === 0) used = len
      else if (used + 1 + len <= perLine) used += 1 + len
      else {
        n++
        used = len
      }
    }
    lines += n
  }
  return Math.max(1, lines)
}

/** Space a topic's border and padding take around its content. */
const PAD_X = 28
const PAD_Y = 20
const ROW_GAP_IN = 6
const MARK_W = 22
const TABLE_COL_W = 84
const TABLE_ROW_H = 26

function tableDims(table: string[][] | null | undefined): { w: number; h: number } | null {
  if (!table?.length) return null
  const cols = Math.max(1, ...table.map((r) => r.length))
  return { w: cols * TABLE_COL_W + 4, h: table.length * TABLE_ROW_H + 4 }
}

/** Width of the small badge row (tags, task, link, attachments, note) under a topic's text. */
export function metaRowWidth(t: TopicData): number {
  let w = 0
  for (const tag of t.tags ?? []) w += tag.length * 6.2 + 20
  if (t.task) w += t.task.dueDate ? 92 : 30
  if (t.link) w += 26
  if (t.attachments?.length) w += 26
  if (noteText(t.note)) w += 26
  return w
}

/**
 * Size of a topic box. Everything a topic can hold is accounted for: text (with its number prefix and marks), an inline
 * note, a formula, a table, a badge row and a picture in any position. Deterministic: no DOM measuring.
 */
export function measureTopic(t: TopicData, depth: number, shape: Shape = 'rounded', prefix = ''): Size {
  const style = t.style
  const image = t.image
  const big = depth === 0
  const fs = style?.fontSize ?? (big ? 17 : 14)
  const bold = (style?.fontWeight ?? (big ? 600 : 500)) >= 600 ? 1.04 : 1
  const charW = fs * (big ? 0.553 : 0.557) * bold
  const text = prefix + t.text
  const marks = countMarks(t.marks)
  const hasTitle = text.trim().length > 0 || marks > 0
  const pad = big ? 56 : 36
  let textW = Math.min(big ? 340 : 300, Math.max(big ? 120 : 72, Math.ceil(text.length * charW + pad + marks * MARK_W)))
  let textH = Math.max(big ? 52 : 38, Math.round(fs * 2.2 + 7))
  let titleH = 22
  const ring = { ringWidth: style?.ringWidth, ringGap: style?.ringGap }

  // A custom width: the text wraps inside it instead of staying on one line.
  const custom = typeof style?.width === 'number' ? clampTopicWidth(style.width) : null
  if (custom !== null) {
    const wrapW = Math.max(40, innerWidth(shape, custom, ring) - PAD_X)
    const lines = wrapLineCount(text, Math.max(4, Math.floor((wrapW - marks * MARK_W) / charW)))
    const lineH = Math.round(fs * 1.3)
    textW = Math.ceil(wrapW + PAD_X)
    titleH = Math.max(22, lines * lineH)
    textH = Math.max(textH, Math.round(lines * lineH + fs * 0.9 + 7))
  }

  const rows: Size[] = []
  const inline = t.inlineNote?.trim()
  if (inline) rows.push({ w: Math.min(260, inline.length * 6.4 + 24) + PAD_X - 24, h: 16 })
  if (t.latex?.trim()) rows.push({ w: Math.min(340, 40 + t.latex.length * 7) + PAD_X, h: 36 })
  const table = tableDims(t.table)
  if (table) rows.push({ w: table.w + PAD_X, h: table.h })
  const meta = metaRowWidth(t)
  if (meta > 0) rows.push({ w: meta + PAD_X, h: 22 })

  let w: number
  let h: number
  if (!image && rows.length === 0) {
    w = textW
    h = textH
  } else {
    const all: Size[] = hasTitle || !image ? [{ w: textW, h: titleH }, ...rows] : rows
    const contentW = Math.max(...all.map((r) => r.w), 0)
    const stackH = all.reduce((s, r, i) => s + r.h + (i ? ROW_GAP_IN : 0), 0)
    if (!image) {
      w = Math.max(textW, contentW)
      h = Math.max(textH, PAD_Y + stackH)
    } else {
      const pos = image.position ?? 'above'
      const minW = hasTitle || rows.length ? 0 : 72
      if (pos === 'left' || pos === 'right') {
        w = Math.max(minW, PAD_X + image.width + (all.length ? ROW_GAP_IN * 2 + Math.max(contentW - PAD_X, 40) : 0))
        h = PAD_Y + Math.max(image.height, stackH)
      } else if (pos === 'behind') {
        w = Math.max(minW, contentW, image.width + PAD_X)
        h = PAD_Y + Math.max(image.height, stackH)
      } else {
        w = Math.max(minW, contentW, image.width + PAD_X)
        h = PAD_Y + image.height + (all.length ? ROW_GAP_IN + stackH : 0)
      }
    }
  }
  // The box a shape needs to hold this content inside its text-safe area (see core/shapes).
  const fit = fitBox(shape, w, h, ring)
  // A custom width is a minimum: the topic grows past it only when something inside (a picture, a table) can't shrink.
  return custom !== null ? { w: Math.max(custom, fit.w), h: shape === 'circle' || shape === 'ring' || shape === 'doubleCircle' ? Math.max(custom, fit.h) : fit.h } : fit
}

/** Size of a plain text topic (used for summary boxes and similar). */
export function measure(text: string, depth: number, image?: TopicImage | null, style?: TopicStyle, shape: Shape = 'rounded'): Size {
  return measureTopic({ id: '', parentId: null, order: 0, text, collapsed: false, style: style ?? {}, marks: [], note: '', tags: [], task: null, link: null, floatingPosition: null, image }, depth, shape)
}

export function emptyScene(rootId = ''): Scene {
  return {
    rootId,
    boxes: new Map(),
    order: [],
    edges: [],
    hidden: new Map(),
    decor: [],
    numbers: new Map(),
    layoutShape: null,
    bounds: { x: 0, y: 0, w: 0, h: 0 },
    total: 0,
  }
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

// ---------------------------------------------------------------------------------------------
// Shared context
// ---------------------------------------------------------------------------------------------

type Dir = BranchDir | 'both' | 'stackUp'

interface Out {
  boxes: Map<string, LaidOut>
  order: string[]
  edges: SceneEdge[]
  decor: Decor[]
}

class Ctx {
  idx: ChildIndex
  hidden = new Map<string, number>()
  sp: number
  overlap: boolean
  align: boolean
  layoutShape: Shape | null = null
  defaultKind: ConnectorKind = 'curve'
  childDirFor: (depth: number, parent: Dir) => Dir = (_d, p) => p
  numbers: Map<string, string> = new Map()
  private counts = new Map<string, number>()
  private widths = new Map<string, number>()

  constructor(
    public topics: TopicMap,
    public opts: SceneOptions
  ) {
    this.idx = buildIndex(topics)
    this.sp = Math.min(2.5, Math.max(0.4, opts.spacing ?? 1))
    this.overlap = !!opts.overlap
    this.align = !!opts.alignSiblings
    if (opts.numbering) this.numbers = computeNumbers(topics, opts.rootId)
  }

  get gh() {
    return H_GAP * this.sp
  }
  get gv() {
    return (this.overlap ? 2 : V_GAP) * this.sp
  }
  get gRow() {
    return (this.overlap ? 2 : ROW_GAP) * this.sp
  }
  get gDown() {
    return DOWN_GAP * this.sp
  }
  get gStack() {
    return STACK_GAP * this.sp
  }

  count(id: string): number {
    const known = this.counts.get(id)
    if (known !== undefined) return known
    let n = 1
    for (const k of childrenOf(this.idx, id)) n += this.count(k.id)
    this.counts.set(id, n)
    return n
  }

  visibleKids(t: TopicData, depth: number): TopicData[] {
    const all = childrenOf(this.idx, t.id)
    if (!all.length || this.opts.reveal.has(t.id)) return all
    const limited = this.opts.maxDepth !== null && depth >= this.opts.maxDepth
    if (limited || t.collapsed) {
      this.hidden.set(t.id, this.count(t.id) - 1)
      return []
    }
    return all
  }

  shape(t: TopicData, depth: number): Shape {
    return t.style?.shape ?? this.opts.shapeOf?.(t, depth) ?? this.layoutShape ?? 'rounded'
  }

  private measureOne(t: TopicData, depth: number): Size {
    const n = this.numbers.get(t.id)
    return measureTopic(t, depth, this.shape(t, depth), n ? `${n} ` : '')
  }

  size(t: TopicData, depth: number): Size {
    const m = this.measureOne(t, depth)
    const w = this.widths.get(t.id)
    return w && w > m.w ? { w, h: m.h } : m
  }

  /** Makes siblings equally wide when "align with sibling" is on. */
  alignWidths(kids: TopicData[], depth: number) {
    if (!this.align || kids.length < 2) return
    const w = Math.max(...kids.map((k) => this.measureOne(k, depth).w))
    kids.forEach((k) => this.widths.set(k.id, w))
  }

  kind(): ConnectorKind {
    const choice = this.opts.connector ?? 'auto'
    return choice === 'auto' ? this.defaultKind : choice
  }

  childDir(parent: Dir, kid: TopicData, depth: number): Dir {
    const base = this.childDirFor(depth, parent)
    const o = kid.branchDir
    if (!o) return base
    const opposite =
      (base === 'right' && o === 'left') ||
      (base === 'left' && o === 'right') ||
      (base === 'down' && o === 'up') ||
      (base === 'up' && o === 'down')
    return opposite ? base : o
  }
}

// ---------------------------------------------------------------------------------------------
// Block layout: every subtree is a box, so any direction can nest inside any other.
// ---------------------------------------------------------------------------------------------

interface Block {
  t: TopicData
  depth: number
  dir: Dir
  m: Size
  w: number
  h: number
  /** Position of the topic box inside the block. */
  nx: number
  ny: number
  kids: Block[]
  kx: number[]
  ky: number[]
  /** Side of the parent box each kid hangs from. */
  flows: Side[]
  /** Index of the top-level branch this block belongs to (for colours). */
  bi: number
}

const sideOfDir = (d: Dir): LaidOut['side'] =>
  d === 'right' ? 'right' : d === 'left' ? 'left' : d === 'up' || d === 'stackUp' ? 'up' : 'down'

const flowOfDir = (d: Dir): Side =>
  d === 'left' ? 'l' : d === 'down' || d === 'stack' ? 'b' : d === 'up' || d === 'stackUp' ? 't' : 'r'

function build(c: Ctx, t: TopicData, depth: number, dir: Dir, bi = -1): Block {
  const m = c.size(t, depth)
  const kt = c.visibleKids(t, depth)
  c.alignWidths(kt, depth + 1)
  if (!kt.length) {
    return { t, depth, dir, m, w: m.w, h: m.h, nx: 0, ny: 0, kids: [], kx: [], ky: [], flows: [], bi }
  }
  if (dir === 'both') return buildBoth(c, t, depth, m, kt)
  const kids = kt.map((k, i) => build(c, k, depth + 1, c.childDir(dir, k, depth + 1), depth === 0 ? i : bi))
  return arrange(c, t, depth, dir, m, kids, bi)
}

function arrange(c: Ctx, t: TopicData, depth: number, dir: Dir, m: Size, kids: Block[], bi: number): Block {
  const n = kids.length
  const kh = (k: Block) => (c.overlap ? k.m.h : k.h)
  const kw = (k: Block) => (c.overlap ? k.m.w : k.w)
  const b: Block = { t, depth, dir, m, w: 0, h: 0, nx: 0, ny: 0, kids, kx: [], ky: [], flows: [], bi }
  const flow = flowOfDir(dir)

  if (dir === 'right' || dir === 'left') {
    const total = kids.reduce((s, k, i) => s + kh(k) + (i ? c.gv : 0), 0)
    const maxW = Math.max(...kids.map((k) => k.w))
    b.h = Math.max(m.h, total)
    b.w = m.w + c.gh + maxW
    b.ny = (b.h - m.h) / 2
    b.nx = dir === 'right' ? 0 : b.w - m.w
    let y = (b.h - total) / 2
    kids.forEach((k) => {
      b.kx.push(dir === 'right' ? m.w + c.gh : maxW - k.w)
      b.ky.push(y + (kh(k) - k.h) / 2)
      b.flows.push(flow)
      y += kh(k) + c.gv
    })
  } else if (dir === 'down' || dir === 'up') {
    const total = kids.reduce((s, k, i) => s + kw(k) + (i ? c.gRow : 0), 0)
    const maxH = Math.max(...kids.map((k) => k.h))
    b.w = Math.max(m.w, total)
    b.h = m.h + c.gDown + maxH
    b.nx = (b.w - m.w) / 2
    b.ny = dir === 'down' ? 0 : b.h - m.h
    let x = (b.w - total) / 2
    kids.forEach((k) => {
      b.kx.push(x + (kw(k) - k.w) / 2)
      b.ky.push(dir === 'down' ? m.h + c.gDown : maxH - k.h)
      b.flows.push(flow)
      x += kw(k) + c.gRow
    })
  } else {
    // 'stack' / 'stackUp': an indented outline column below (or above) the topic.
    const maxW = Math.max(...kids.map((k) => k.w))
    const total = kids.reduce((s, k, i) => s + k.h + (i ? c.gStack : 0), 0)
    b.w = Math.max(m.w, INDENT + maxW)
    b.h = m.h + c.gStack + total
    b.nx = 0
    b.ny = dir === 'stack' ? 0 : b.h - m.h
    let off = 0
    kids.forEach((k) => {
      b.kx.push(INDENT)
      b.ky.push(dir === 'stack' ? m.h + c.gStack + off : b.h - m.h - c.gStack - off - k.h)
      b.flows.push(flow)
      off += k.h + c.gStack
    })
  }
  void n
  return b
}

/** Central topic with branches on both sides, split so both halves have about the same height. */
function buildBoth(c: Ctx, t: TopicData, depth: number, m: Size, kt: TopicData[]): Block {
  const trial = kt.map((k, i) => build(c, k, depth + 1, c.childDir('right', k, depth + 1), i))
  const totalH = trial.reduce((s, k, i) => s + k.h + (i ? c.gv : 0), 0)
  const right: Block[] = []
  const left: Block[] = []
  const chosen = (k: TopicData) => (k.side === 'left' || k.side === 'right' ? k.side : null)
  if (kt.some((k) => chosen(k))) {
    // Some main topics have a chosen side (for example an imported map): keep them there, and put the others on
    // whichever side is shorter so far.
    let hR = 0
    let hL = 0
    trial.forEach((b, i) => {
      const s = chosen(kt[i] as TopicData)
      if (s === 'right') hR += b.h + c.gv
      else if (s === 'left') hL += b.h + c.gv
    })
    trial.forEach((b, i) => {
      const k = kt[i] as TopicData
      const side = chosen(k) ?? (hR <= hL ? 'right' : 'left')
      if (!chosen(k)) {
        if (side === 'right') hR += b.h + c.gv
        else hL += b.h + c.gv
      }
      if (side === 'right') right.push(b)
      else left.push(build(c, k, depth + 1, c.childDir('left', k, depth + 1), i))
    })
  } else {
    let acc = 0
    trial.forEach((k, i) => {
      if (acc < totalH / 2) right.push(k)
      else left.push(build(c, kt[i] as TopicData, depth + 1, c.childDir('left', kt[i] as TopicData, depth + 1), i))
      acc += k.h + c.gv
    })
  }
  const colH = (col: Block[]) => col.reduce((s, k, i) => s + (c.overlap ? k.m.h : k.h) + (i ? c.gv : 0), 0)
  const colW = (col: Block[]) => (col.length ? Math.max(...col.map((k) => k.w)) : 0)
  const hR = colH(right)
  const hL = colH(left)
  const wR = colW(right)
  const wL = colW(left)
  const b: Block = {
    t,
    depth,
    dir: 'both',
    m,
    w: wL + (left.length ? c.gh : 0) + m.w + (right.length ? c.gh : 0) + wR,
    h: Math.max(m.h, hR, hL),
    nx: 0,
    ny: 0,
    kids: [...right, ...left],
    kx: [],
    ky: [],
    flows: [],
    bi: -1,
  }
  b.nx = wL + (left.length ? c.gh : 0)
  b.ny = (b.h - m.h) / 2
  const stackCol = (col: Block[], total: number, x: (k: Block) => number, flow: Side) => {
    let y = (b.h - total) / 2
    col.forEach((k) => {
      const slot = c.overlap ? k.m.h : k.h
      b.kx.push(x(k))
      b.ky.push(y + (slot - k.h) / 2)
      b.flows.push(flow)
      y += slot + c.gv
    })
  }
  stackCol(right, hR, () => b.nx + m.w + c.gh, 'r')
  stackCol(left, hL, (k) => wL - k.w, 'l')
  return b
}

function emit(c: Ctx, b: Block, ox: number, oy: number, branch: number, out: Out, isRoot = false) {
  out.boxes.set(b.t.id, {
    id: b.t.id,
    x: ox + b.nx,
    y: oy + b.ny,
    w: b.m.w,
    h: b.m.h,
    side: isRoot ? 'root' : sideOfDir(b.dir),
    depth: b.depth,
    branch: isRoot ? -1 : branch,
    flow: b.dir === 'both' ? 'r' : flowOfDir(b.dir),
  })
  out.order.push(b.t.id)
  const stackish = b.dir === 'stack' || b.dir === 'stackUp'
  b.kids.forEach((k, i) => {
    const flow = b.flows[i] ?? 'r'
    const e: SceneEdge = { from: b.t.id, to: k.t.id, fromSide: 'r', toSide: 'l', kind: c.kind() }
    if (flow === 'l') Object.assign(e, { fromSide: 'l', toSide: 'r' })
    else if (flow === 'b' || flow === 't') {
      if (stackish) Object.assign(e, { fromSide: flow, toSide: 'l', fromDx: 14, kind: 'elbow' })
      else Object.assign(e, { fromSide: flow, toSide: flow === 'b' ? 't' : 'b' })
    }
    out.edges.push(e)
    emit(c, k, ox + (b.kx[i] ?? 0), oy + (b.ky[i] ?? 0), isRoot ? k.bi : branch, out)
  })
}

function emitCentered(c: Ctx, b: Block, out: Out) {
  emit(c, b, -(b.nx + b.m.w / 2), -(b.ny + b.m.h / 2), -1, out, true)
}

// ---------------------------------------------------------------------------------------------
// Timeline and fishbone
// ---------------------------------------------------------------------------------------------

function timelineHorizontal(c: Ctx, root: TopicData, out: Out, rib: number) {
  const m = c.size(root, 0)
  const kt = c.visibleKids(root, 0)
  const mains = kt.map((k, i) => build(c, k, 1, i % 2 === 0 ? 'stackUp' : 'stack', i))
  const spineGap = 26 * c.sp
  const step = 48 * c.sp
  const gapM = 28 * c.sp
  out.boxes.set(root.id, {
    id: root.id, x: 0, y: -m.h / 2, w: m.w, h: m.h, side: 'root', depth: 0, branch: -1, flow: 'r',
  })
  out.order.push(root.id)
  const start = m.w + rib + 30 * c.sp
  const end = { up: start, down: start }
  let last = start - step
  let maxX = m.w
  mains.forEach((b, i) => {
    const above = i % 2 === 0
    const x = Math.max(above ? end.up : end.down, last + step)
    emit(c, b, x, above ? -spineGap - b.h : spineGap, i, out)
    last = x
    if (above) end.up = x + b.w + gapM
    else end.down = x + b.w + gapM
    maxX = Math.max(maxX, x + b.w)
    const cx = x + b.nx + b.m.w / 2
    out.decor.push({ kind: 'line', x1: cx, y1: above ? -spineGap : spineGap, x2: cx - rib, y2: 0, branch: i })
  })
  out.decor.push({ kind: 'line', x1: m.w, y1: 0, x2: Math.max(maxX, m.w + 40), y2: 0, branch: -1, width: 4 })
}

function timelineVertical(c: Ctx, root: TopicData, out: Out) {
  const m = c.size(root, 0)
  const kt = c.visibleKids(root, 0)
  const mains = kt.map((k, i) => build(c, k, 1, i % 2 === 0 ? 'right' : 'left', i))
  const spineGap = 30 * c.sp
  const step = 34 * c.sp
  const gapM = 22 * c.sp
  out.boxes.set(root.id, {
    id: root.id, x: -m.w / 2, y: 0, w: m.w, h: m.h, side: 'root', depth: 0, branch: -1, flow: 'b',
  })
  out.order.push(root.id)
  const start = m.h + 30 * c.sp
  const end = { right: start, left: start }
  let last = start - step
  let maxY = m.h
  mains.forEach((b, i) => {
    const rightSide = i % 2 === 0
    const y = Math.max(rightSide ? end.right : end.left, last + step)
    emit(c, b, rightSide ? spineGap : -spineGap - b.w, y, i, out)
    last = y
    if (rightSide) end.right = y + b.h + gapM
    else end.left = y + b.h + gapM
    maxY = Math.max(maxY, y + b.h)
    const cy = y + b.ny + b.m.h / 2
    out.decor.push({ kind: 'line', x1: rightSide ? spineGap : -spineGap, y1: cy, x2: 0, y2: cy, branch: i })
  })
  out.decor.push({ kind: 'line', x1: 0, y1: m.h, x2: 0, y2: Math.max(maxY, m.h + 40), branch: -1, width: 4 })
}

function mirrorX(out: Out) {
  const swap = (s: Side): Side => (s === 'l' ? 'r' : s === 'r' ? 'l' : s)
  out.boxes.forEach((b) => {
    b.x = -(b.x + b.w)
    b.side = b.side === 'left' ? 'right' : b.side === 'right' ? 'left' : b.side
    b.flow = swap(b.flow)
  })
  out.edges.forEach((e) => {
    e.fromSide = swap(e.fromSide)
    e.toSide = swap(e.toSide)
    if (e.fromDx !== undefined) e.dxFromRight = true
  })
  out.decor.forEach((d) => {
    if (d.kind === 'line') {
      d.x1 = -d.x1
      d.x2 = -d.x2
    }
  })
}

// ---------------------------------------------------------------------------------------------
// Tree table
// ---------------------------------------------------------------------------------------------

function treeTable(c: Ctx, root: TopicData, out: Out, byColumns: boolean) {
  const gap = 4 * c.sp
  const levelSize: number[] = []
  const nodes: { t: TopicData; depth: number; r0: number; r1: number; branch: number }[] = []
  let leaf = 0
  const walk = (t: TopicData, depth: number, branch: number) => {
    const m = c.size(t, depth)
    levelSize[depth] = Math.max(levelSize[depth] ?? 0, byColumns ? m.h : m.w)
    const kids = c.visibleKids(t, depth)
    const entry = { t, depth, r0: leaf, r1: leaf, branch }
    nodes.push(entry)
    if (!kids.length) leaf++
    kids.forEach((k, i) => walk(k, depth + 1, depth === 0 ? i : branch))
    entry.r1 = Math.max(leaf, entry.r0 + 1)
  }
  walk(root, 0, -1)

  let unit = 0 // size of one leaf cell along the leaf axis
  nodes.forEach((n) => {
    const m = c.size(n.t, n.depth)
    if (n.r1 - n.r0 === 1) unit = Math.max(unit, byColumns ? m.w : m.h)
  })
  unit = Math.max(unit, byColumns ? 90 : 38)

  const offsets: number[] = []
  levelSize.reduce((acc, s, d) => {
    offsets[d] = acc
    return acc + s + gap
  }, 0)
  nodes.forEach((n) => {
    const span = n.r1 - n.r0
    const along = span * unit + (span - 1) * gap
    const start = n.r0 * (unit + gap)
    const level = levelSize[n.depth] ?? 60
    const off = offsets[n.depth] ?? 0
    out.boxes.set(n.t.id, {
      id: n.t.id,
      x: byColumns ? start : off,
      y: byColumns ? off : start,
      w: byColumns ? along : level,
      h: byColumns ? level : along,
      side: n.depth === 0 ? 'root' : byColumns ? 'down' : 'right',
      depth: n.depth,
      branch: n.branch,
      flow: byColumns ? 'b' : 'r',
    })
    out.order.push(n.t.id)
  })
}

// ---------------------------------------------------------------------------------------------
// Radial layouts: circular, sector, bubble
// ---------------------------------------------------------------------------------------------

function ext(m: Size) {
  return Math.hypot(m.w, m.h) * 0.8 + 10
}

function ringLayout(c: Ctx, root: TopicData, out: Out, sector: boolean) {
  interface N { t: TopicData; depth: number; kids: N[]; slot: number; a0: number; a1: number; branch: number; m: Size }
  const mk = (t: TopicData, depth: number, branch: number): N => {
    const m = c.size(t, depth)
    const kids = c.visibleKids(t, depth).map((k, i) => mk(k, depth + 1, depth === 0 ? i : branch))
    const slot = Math.max(ext(m), kids.reduce((s, k) => s + k.slot, 0))
    return { t, depth, kids, slot, a0: 0, a1: 0, branch, m }
  }
  const top = mk(root, 0, -1)
  const assign = (n: N, a0: number, a1: number) => {
    n.a0 = a0
    n.a1 = a1
    const total = n.kids.reduce((s, k) => s + k.slot, 0)
    let a = a0
    n.kids.forEach((k) => {
      const span = total ? ((a1 - a0) * k.slot) / total : 0
      assign(k, a, a + span)
      a += span
    })
  }
  assign(top, -Math.PI / 2, (3 * Math.PI) / 2)

  const levels: N[][] = []
  const collect = (n: N) => {
    ;(levels[n.depth] ??= []).push(n)
    n.kids.forEach(collect)
  }
  collect(top)
  const radius: number[] = [0]
  for (let d = 1; d < levels.length; d++) {
    const prev = levels[d - 1] ?? []
    const cur = levels[d] ?? []
    const prevExt = Math.max(...prev.map((n) => ext(n.m)))
    const curExt = Math.max(...cur.map((n) => ext(n.m)))
    let r = (radius[d - 1] ?? 0) + (prevExt / 2 + curExt / 2 + 36) * c.sp
    for (const n of cur) r = Math.max(r, ext(n.m) / Math.max(0.05, n.a1 - n.a0))
    radius.push(r)
  }
  const place = (n: N) => {
    const r = radius[n.depth] ?? 0
    const a = (n.a0 + n.a1) / 2
    const cx = n.depth === 0 ? 0 : r * Math.cos(a)
    const cy = n.depth === 0 ? 0 : r * Math.sin(a)
    out.boxes.set(n.t.id, {
      id: n.t.id,
      x: cx - n.m.w / 2,
      y: cy - n.m.h / 2,
      w: n.m.w,
      h: n.m.h,
      side: n.depth === 0 ? 'root' : Math.cos(a) >= 0 ? 'right' : 'left',
      depth: n.depth,
      branch: n.branch,
      flow: Math.cos(a) >= 0 ? 'r' : 'l',
    })
    out.order.push(n.t.id)
    n.kids.forEach((k) => {
      if (!sector) out.edges.push({ from: n.t.id, to: k.t.id, fromSide: 'c', toSide: 'c', kind: 'straight' })
      place(k)
    })
  }
  place(top)
  if (sector) {
    const rMax = (radius[radius.length - 1] ?? 0) + 70
    const r0 = top.m.w / 2 + 20
    top.kids.forEach((k) => {
      out.decor.push({ kind: 'wedge', cx: 0, cy: 0, r0, r1: rMax, a0: k.a0, a1: k.a1, branch: k.branch })
    })
  }
}

function bubbleLayout(c: Ctx, root: TopicData, out: Out) {
  const place = (t: TopicData, depth: number, cx: number, cy: number, theta: number, span: number, branch: number) => {
    const m = c.size(t, depth)
    out.boxes.set(t.id, {
      id: t.id,
      x: cx - m.w / 2,
      y: cy - m.h / 2,
      w: m.w,
      h: m.h,
      side: depth === 0 ? 'root' : Math.cos(theta) >= 0 ? 'right' : 'left',
      depth,
      branch: depth === 0 ? -1 : branch,
      flow: Math.cos(theta) >= 0 ? 'r' : 'l',
    })
    out.order.push(t.id)
    const kids = c.visibleKids(t, depth)
    if (!kids.length) return
    const ms = kids.map((k) => c.size(k, depth + 1))
    const slots = kids.map((k, i) => Math.max(ext(ms[i] as Size), c.count(k.id) > 1 ? ext(ms[i] as Size) * 1.1 : 0))
    const total = slots.reduce((s, v) => s + v, 0)
    const maxExt = Math.max(...ms.map(ext))
    const R = Math.max((ext(m) / 2 + maxExt / 2 + 40) * c.sp, total / span)
    let a = depth === 0 ? -Math.PI / 2 : theta - span / 2
    kids.forEach((k, i) => {
      const share = (span * (slots[i] ?? 0)) / total
      const ka = a + share / 2
      a += share
      const kx = cx + R * Math.cos(ka)
      const ky = cy + R * Math.sin(ka)
      out.edges.push({ from: t.id, to: k.id, fromSide: 'c', toSide: 'c', kind: 'straight' })
      const kidSpan = Math.min(Math.PI * 0.95, Math.max(1.3, c.visibleKids(k, depth + 1).length * 0.55))
      place(k, depth + 1, kx, ky, ka, kidSpan, depth === 0 ? i : branch)
    })
  }
  place(root, 0, 0, 0, 0, Math.PI * 2, -1)
}

/**
 * Pushes overlapping boxes apart (the central topic stays put). Uses a grid so it stays fast for
 * thousands of topics, and a stable order so the result is deterministic.
 */
function relax(out: Out, rootId: string, pad = 10, iterations = 60) {
  const items = out.order.map((id) => out.boxes.get(id)).filter((b): b is LaidOut => !!b)
  const cell = 180
  for (let it = 0; it < iterations; it++) {
    const grid = new Map<string, number[]>()
    items.forEach((b, i) => {
      for (let gx = Math.floor(b.x / cell); gx <= Math.floor((b.x + b.w) / cell); gx++)
        for (let gy = Math.floor(b.y / cell); gy <= Math.floor((b.y + b.h) / cell); gy++) {
          const key = `${gx},${gy}`
          const list = grid.get(key)
          if (list) list.push(i)
          else grid.set(key, [i])
        }
    })
    const done = new Set<number>()
    let moved = false
    grid.forEach((list) => {
      for (let p = 0; p < list.length; p++)
        for (let q = p + 1; q < list.length; q++) {
          const i = list[p] as number
          const j = list[q] as number
          const key = i * items.length + j
          if (done.has(key)) continue
          done.add(key)
          const a = items[i] as LaidOut
          const b = items[j] as LaidOut
          const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + pad
          const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + pad
          if (ox <= 0 || oy <= 0) continue
          moved = true
          const aFixed = a.id === rootId
          const bFixed = b.id === rootId
          const share = aFixed || bFixed ? 1 : 0.5
          if (ox < oy) {
            const dir = a.x + a.w / 2 <= b.x + b.w / 2 ? -1 : 1
            if (!aFixed) a.x += dir * ox * share
            if (!bFixed) b.x -= dir * ox * share
          } else {
            const dir = a.y + a.h / 2 <= b.y + b.h / 2 ? -1 : 1
            if (!aFixed) a.y += dir * oy * share
            if (!bFixed) b.y -= dir * oy * share
          }
        }
    })
    if (!moved) break
  }
}

// ---------------------------------------------------------------------------------------------
// Bracket map: a tree whose branches are grouped by curly braces instead of lines
// ---------------------------------------------------------------------------------------------

function addBraces(out: Out, edgesBefore: number) {
  const groups = new Map<string, SceneEdge[]>()
  out.edges.slice(edgesBefore).forEach((e) => {
    const g = groups.get(e.from)
    if (g) g.push(e)
    else groups.set(e.from, [e])
  })
  groups.forEach((edges, from) => {
    const p = out.boxes.get(from)
    if (!p) return
    const kids = edges.map((e) => out.boxes.get(e.to)).filter((k): k is LaidOut => !!k)
    if (!kids.length) return
    const dir: 'r' | 'l' = (edges[0] as SceneEdge).fromSide === 'l' ? 'l' : 'r'
    const ys = kids.map((k) => k.y + k.h / 2)
    out.decor.push({
      kind: 'brace',
      x0: dir === 'r' ? p.x + p.w : p.x,
      x1: dir === 'r' ? Math.min(...kids.map((k) => k.x)) : Math.max(...kids.map((k) => k.x + k.w)),
      y0: Math.min(...ys),
      y1: Math.max(...ys),
      ym: p.y + p.h / 2,
      dir,
      branch: kids[0]?.branch ?? -1,
      ys,
    })
  })
  out.edges.length = edgesBefore
}

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------

export function buildScene(topics: TopicMap, opts: SceneOptions): Scene {
  const c = new Ctx(topics, opts)
  const rootId = opts.focusId && topics[opts.focusId] ? opts.focusId : opts.rootId
  const root = topics[rootId]
  if (!root) return emptyScene(rootId)
  const def: LayoutDef = layoutDef(opts.layout)
  const out: Out = { boxes: new Map(), order: [], edges: [], decor: [] }
  let floatDir: BranchDir = 'right'

  switch (def.family) {
    case 'mindmap': {
      c.defaultKind = 'curve'
      const dir: Dir = def.variant === 'both' ? 'both' : (def.variant as BranchDir)
      floatDir = dir === 'both' ? 'right' : dir
      emitCentered(c, build(c, root, 0, dir), out)
      break
    }
    case 'tree': {
      c.defaultKind = 'elbow'
      floatDir = def.variant as BranchDir
      emitCentered(c, build(c, root, 0, floatDir), out)
      break
    }
    case 'org': {
      c.defaultKind = 'elbow'
      if (def.variant === 'compact') {
        c.childDirFor = (depth) => (depth >= 1 ? 'stack' : 'down')
        floatDir = 'stack'
        emitCentered(c, build(c, root, 0, 'down'), out)
      } else {
        floatDir = def.variant === 'right' ? 'right' : 'down'
        emitCentered(c, build(c, root, 0, floatDir), out)
      }
      break
    }
    case 'bracket': {
      floatDir = def.variant === 'left' ? 'left' : 'right'
      const before = out.edges.length
      emitCentered(c, build(c, root, 0, floatDir), out)
      addBraces(out, before)
      break
    }
    case 'timeline':
      if (def.variant === 'vertical') timelineVertical(c, root, out)
      else timelineHorizontal(c, root, out, 0)
      break
    case 'fishbone':
      timelineHorizontal(c, root, out, 64 * c.sp)
      if (def.variant === 'right') mirrorX(out)
      break
    case 'table':
      treeTable(c, root, out, def.variant === 'columns')
      break
    case 'circular':
      ringLayout(c, root, out, false)
      break
    case 'sector':
      ringLayout(c, root, out, true)
      break
    case 'bubble':
      c.layoutShape = 'ellipse'
      bubbleLayout(c, root, out)
      if (out.boxes.size <= 2500) relax(out, root.id, 10, out.boxes.size > 600 ? 120 : 400)
      break
  }

  // Free-floating topics (only in the full map view), each laid out as its own tree.
  if (!opts.focusId) {
    let maxY = 0
    out.boxes.forEach((b) => (maxY = Math.max(maxY, b.y + b.h)))
    const floats = (c.idx.get(null) ?? []).filter((t) => t.id !== opts.rootId)
    const mainBranches = c.visibleKids(root, 0).length
    floats.forEach((t, i) => {
      const pos = t.floatingPosition ?? { x: 0, y: maxY + 120 * (i + 1) }
      const b = build(c, t, 0, floatDir, -1)
      emit(c, b, pos.x - (b.nx + b.m.w / 2), pos.y - (b.ny + b.m.h / 2), mainBranches + i, out)
      const box = out.boxes.get(t.id)
      if (box) box.depth = 0
    })
  }

  // Manual branch offsets (branch free positioning).
  if (opts.freePositioning) {
    const shift = new Map<string, { x: number; y: number }>()
    for (const id of out.order) {
      const t = topics[id]
      const parent = t?.parentId ? shift.get(t.parentId) : undefined
      const own = t?.offset
      const s = { x: (parent?.x ?? 0) + (own?.x ?? 0), y: (parent?.y ?? 0) + (own?.y ?? 0) }
      shift.set(id, s)
      const box = out.boxes.get(id)
      if (box && (s.x || s.y)) {
        box.x += s.x
        box.y += s.y
      }
    }
  }

  return {
    rootId,
    boxes: out.boxes,
    order: out.order,
    edges: out.edges,
    hidden: c.hidden,
    decor: out.decor,
    numbers: c.numbers,
    layoutShape: c.layoutShape,
    bounds: boundsOf(out.boxes),
    total: Object.keys(topics).length,
  }
}
