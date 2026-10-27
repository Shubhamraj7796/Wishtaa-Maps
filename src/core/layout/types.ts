import type { Shape } from '../model/types'
import type { TopicData } from '../model/topic'

/** Which side of a box a connector attaches to ('c' = centre). */
export type Side = 'l' | 'r' | 't' | 'b' | 'c'
export type ConnectorKind = 'curve' | 'elbow' | 'straight'
export type ConnectorChoice = 'auto' | ConnectorKind

export interface LaidOut {
  id: string
  x: number
  y: number
  w: number
  h: number
  /** Direction this topic sits in relative to the central topic. */
  side: 'root' | 'left' | 'right' | 'up' | 'down'
  depth: number
  /** Index of the top-level branch (colour), -1 for the central topic. */
  branch: number
  /** Side of the box where its children hang (used for the hidden-count badge). */
  flow: Side
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface SceneEdge {
  from: string
  to: string
  fromSide: Side
  toSide: Side
  /** Horizontal offset of the start point from the box's left edge (outline-style stacks). */
  fromDx?: number
  /** Measure `fromDx` from the right edge instead (set when a layout is mirrored). */
  dxFromRight?: boolean
  kind: ConnectorKind
}

/** Extra shapes drawn behind the topics (spines, ribs, sector wedges, braces). */
export type Decor =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; branch: number; width?: number }
  | { kind: 'wedge'; cx: number; cy: number; r0: number; r1: number; a0: number; a1: number; branch: number }
  | { kind: 'brace'; x0: number; x1: number; y0: number; y1: number; ym: number; ys: number[]; dir: 'r' | 'l'; branch: number }

export interface Scene {
  rootId: string
  boxes: Map<string, LaidOut>
  /** Depth-first order of visible topics. */
  order: string[]
  edges: SceneEdge[]
  /** Number of hidden descendants for topics whose children are not shown. */
  hidden: Map<string, number>
  decor: Decor[]
  /** Branch numbers (1, 1.1, ...) when numbering is on; empty otherwise. */
  numbers: Map<string, string>
  /** Shape the layout prefers when neither the topic nor the theme chooses (e.g. bubbles). */
  layoutShape: Shape | null
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
  /** Layout id from the catalog, e.g. "mindmap:both". */
  layout?: string
  connector?: ConnectorChoice
  /** Spacing multiplier (0.6 compact … 1.8 relaxed). */
  spacing?: number
  /** Let topics overlap instead of pushing them apart. */
  overlap?: boolean
  /** Give siblings the same width. */
  alignSiblings?: boolean
  /** Apply manual branch offsets. */
  freePositioning?: boolean
  /** Number branches 1, 1.1, 1.1.1 ... and make room for the numbers. */
  numbering?: boolean
  /** Shape a topic will be drawn with (affects its size). */
  shapeOf?: (t: TopicData, depth: number) => Shape
}
