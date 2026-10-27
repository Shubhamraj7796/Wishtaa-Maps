import type { LineStyle } from './types'

/** Diagram objects that live beside the topic tree. */

export type ArrowEnds = 'end' | 'start' | 'both' | 'none'

/** A line between any two topics, with a label. `bend` curves it (pixels, can be negative). */
export interface Relationship {
  id: string
  from: string
  to: string
  label: string
  color?: string
  width?: number
  lineStyle?: LineStyle
  arrows: ArrowEnds
  bend: number
}

/** A note bubble attached to a topic, offset from it by (dx, dy). */
export interface Callout {
  id: string
  topicId: string
  text: string
  dx: number
  dy: number
}

export type BoundaryShape = 'rounded' | 'rect' | 'ellipse'

/** A shape drawn around a group of topics. */
export interface Boundary {
  id: string
  topicIds: string[]
  shape: BoundaryShape
  color?: string
  lineStyle: LineStyle
  label: string
}

/** A bracket summarising sibling topics, with its own summary text. */
export interface Summary {
  id: string
  parentId: string
  topicIds: string[]
  text: string
}

export type ObjectKind = 'relationship' | 'callout' | 'boundary' | 'summary'

export interface ObjectRef {
  kind: ObjectKind
  id: string
}

export interface MapObjects {
  relationships: Record<string, Relationship>
  callouts: Record<string, Callout>
  boundaries: Record<string, Boundary>
  summaries: Record<string, Summary>
}

/** Which collection of MapObjects holds each kind of object. */
export const OBJECT_COLLECTION: Record<ObjectKind, keyof MapObjects> = {
  relationship: 'relationships',
  callout: 'callouts',
  boundary: 'boundaries',
  summary: 'summaries',
}

export const emptyObjects = (): MapObjects => ({ relationships: {}, callouts: {}, boundaries: {}, summaries: {} })
