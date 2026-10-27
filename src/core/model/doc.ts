import * as Y from 'yjs'
import { newId } from './ids'
import { makeTopic, type TopicData } from './topic'
import type { TopicMap } from './tree'
import {
  emptyObjects,
  type Boundary,
  type Callout,
  type MapObjects,
  type Relationship,
  type Summary,
} from './objects'

/** Origin of user edits. Only this origin is undoable. */
export const LOCAL = 'local'
export const MAX_UNDO = 100

export interface MapDoc {
  ydoc: Y.Doc
  topics: Y.Map<TopicData>
  meta: Y.Map<string>
  /** Map-wide settings (layout, theme, ...). Tracked by undo like topics. */
  settings: Y.Map<unknown>
  /** Diagram objects beside the topic tree. */
  relationships: Y.Map<Relationship>
  callouts: Y.Map<Callout>
  boundaries: Y.Map<Boundary>
  summaries: Y.Map<Summary>
  undo: Y.UndoManager
}

export function createMapDoc(): MapDoc {
  const ydoc = new Y.Doc()
  const topics = ydoc.getMap<TopicData>('topics')
  const meta = ydoc.getMap<string>('meta')
  const settings = ydoc.getMap<unknown>('settings')
  const relationships = ydoc.getMap<Relationship>('relationships')
  const callouts = ydoc.getMap<Callout>('callouts')
  const boundaries = ydoc.getMap<Boundary>('boundaries')
  const summaries = ydoc.getMap<Summary>('summaries')
  // captureTimeout 0: every transaction is its own undo step.
  const undo = new Y.UndoManager([topics, settings, relationships, callouts, boundaries, summaries], { trackedOrigins: new Set([LOCAL]), captureTimeout: 0 })
  undo.on('stack-item-added', () => {
    const over = undo.undoStack.length - MAX_UNDO
    if (over > 0) undo.undoStack.splice(0, over)
  })
  return { ydoc, topics, meta, settings, relationships, callouts, boundaries, summaries, undo }
}

export function getRootId(doc: MapDoc): string | null {
  const id = doc.meta.get('rootId')
  return id && doc.topics.has(id) ? id : null
}

/** Creates the central topic if the document has none. Not undoable. */
export function ensureRoot(doc: MapDoc, text = 'Central Topic'): string {
  const existing = getRootId(doc)
  if (existing) return existing
  const id = newId()
  doc.ydoc.transact(() => {
    doc.topics.set(id, makeTopic({ id, parentId: null, order: 0, text }))
    doc.meta.set('rootId', id)
  }, 'init')
  return id
}

export function snapshotTopics(doc: MapDoc): TopicMap {
  const out: TopicMap = {}
  doc.topics.forEach((v, k) => {
    out[k] = v
  })
  return out
}

export function snapshotObjects(doc: MapDoc): MapObjects {
  const out = emptyObjects()
  doc.relationships.forEach((v, k) => (out.relationships[k] = v))
  doc.callouts.forEach((v, k) => (out.callouts[k] = v))
  doc.boundaries.forEach((v, k) => (out.boundaries[k] = v))
  doc.summaries.forEach((v, k) => (out.summaries[k] = v))
  return out
}
