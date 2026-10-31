// Core domain types. Mirrors supabase/migrations/0001_schema.sql and docs/data-model.md.

export type Uuid = string

export type CollaboratorRole = 'owner' | 'editor' | 'commenter' | 'viewer'

export interface MapMeta {
  id: Uuid
  ownerId: Uuid
  title: string
  theme: string
  layout: string
  createdAt: string
  updatedAt: string
  isPublic: boolean
  shareToken: string
}

/** Every shape a topic can have. Each is drawn as SVG by `core/shapes` (outline, text-safe area and connection points). */
export type Shape =
  | 'rounded' | 'rect' | 'pill' | 'softSquare' | 'snippedBox' | 'dashedBox' | 'dottedBox'
  | 'ellipse' | 'circle' | 'ring' | 'doubleCircle'
  | 'underline' | 'doubleUnderline' | 'textOnly'
  | 'diamond' | 'parallelogram' | 'hexagon' | 'octagon' | 'tag' | 'gem' | 'shield'
  | 'cloud' | 'burst' | 'starburst' | 'spikes' | 'callout' | 'heart' | 'star' | 'cross' | 'clover'
export const SHAPES: Shape[] = [
  'rounded', 'rect', 'pill', 'softSquare', 'snippedBox', 'dashedBox', 'dottedBox',
  'ellipse', 'circle', 'ring', 'doubleCircle',
  'underline', 'doubleUnderline', 'textOnly',
  'diamond', 'parallelogram', 'hexagon', 'octagon', 'tag', 'gem', 'shield',
  'cloud', 'burst', 'starburst', 'spikes', 'callout', 'heart', 'star', 'cross', 'clover',
]

/** Corner style for box-like shapes. */
export type Corner = 'square' | 'rounded' | 'pill'
export type FillKind = 'solid' | 'none' | 'gradient' | 'pattern'
export type FillPattern = 'dots' | 'stripes' | 'grid' | 'cross'
export const FILL_PATTERNS: FillPattern[] = ['dots', 'stripes', 'grid', 'cross']

export type LineStyle = 'solid' | 'dashed' | 'dotted'

/** How a branch bends. `auto` follows the layout; `none` draws no branch. */
export type BranchCurve = 'auto' | 'curve' | 'straight' | 'elbow' | 'roundedElbow' | 'none'

/** Per-topic overrides. Anything left undefined follows the theme. */
export type TextAlign = 'left' | 'center' | 'right'

export interface TopicStyle {
  shape?: Shape
  /** Box-like shapes only: square, rounded or pill corners. Unset = the shape's own. */
  corner?: Corner
  /** Filling: solid colour, none, a two-colour gradient or a pattern. Unset = what the theme gives. */
  fillKind?: FillKind
  fill?: string
  /** Second colour: the end of a gradient, or the ink of a pattern. */
  fill2?: string
  pattern?: FillPattern
  /** A soft shadow under the topic. */
  shadow?: boolean
  /** Custom width in px (the text wraps). Unset = the topic sizes itself to its content. */
  width?: number
  /** Dash style of the border. */
  borderDash?: LineStyle
  /** `double` draws a second border line inside the first (any shape with an outline). */
  borderLine?: 'single' | 'double'
  /** Double circle: ring thickness and gap (px), ring colour, and inner circle colour. Default: all the topic's fill colour. */
  ringWidth?: number
  ringGap?: number
  ringColor?: string
  innerFill?: string
  border?: string
  borderWidth?: number
  textColor?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  italic?: boolean
  underline?: boolean
  strike?: boolean
  /** Colour behind the text (a highlighter pen). */
  highlight?: string
  align?: TextAlign
  /** How see-through the filling is, 0 (invisible) to 1 (solid). Unset = solid. */
  fillOpacity?: number
  /** Colour of the connector line leading to this topic (otherwise the branch colour of the theme). */
  lineColor?: string
  /** Branch leading to this topic: thick at the parent end, thinner toward the topic. Unset = follow the map and theme. */
  taper?: boolean
  /** How the branch leading to this topic bends. Unset = follow the theme. */
  branchCurve?: BranchCurve
  /** Style and thickness of the connector line leading to this topic. */
  lineStyle?: LineStyle
  lineWidth?: number
  /** How see-through the branch is, 0 to 1. Unset = solid. */
  lineOpacity?: number
  /** An arrow head where the branch meets this topic. */
  lineArrow?: boolean
}

export interface Task {
  done: boolean
  dueDate?: string
  startDate?: string
  assignee?: string
  priority?: number
}

export interface Topic {
  id: Uuid
  mapId: Uuid
  parentId: Uuid | null
  order: number
  text: string
  collapsed: boolean
  style: TopicStyle
  marks: string[]
  note: string
  tags: string[]
  task: Task | null
  link: string | null
  floatingPosition: { x: number; y: number } | null
}
