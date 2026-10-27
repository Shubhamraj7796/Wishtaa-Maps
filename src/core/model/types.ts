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

export type Shape = 'rounded' | 'rect' | 'pill' | 'ellipse' | 'diamond' | 'underline'
export const SHAPES: Shape[] = ['rounded', 'rect', 'pill', 'ellipse', 'diamond', 'underline']

export type LineStyle = 'solid' | 'dashed' | 'dotted'

/** Per-topic overrides. Anything left undefined follows the theme. */
export interface TopicStyle {
  shape?: Shape
  fill?: string
  border?: string
  borderWidth?: number
  textColor?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  italic?: boolean
  /** Style and thickness of the connector line leading to this topic. */
  lineStyle?: LineStyle
  lineWidth?: number
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
