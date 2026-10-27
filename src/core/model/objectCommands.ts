import * as Y from 'yjs'
import { LOCAL, snapshotTopics, type MapDoc } from './doc'
import { newId } from './ids'
import type { Boundary, BoundaryShape, Callout, ObjectKind, Relationship, Summary } from './objects'
import { buildIndex, childrenOf, topLevelOnly } from './tree'

const tx = (doc: MapDoc, fn: () => void) => doc.ydoc.transact(fn, LOCAL)

function mapFor(doc: MapDoc, kind: ObjectKind): Y.Map<unknown> {
  switch (kind) {
    case 'relationship':
      return doc.relationships as Y.Map<unknown>
    case 'callout':
      return doc.callouts as Y.Map<unknown>
    case 'boundary':
      return doc.boundaries as Y.Map<unknown>
    default:
      return doc.summaries as Y.Map<unknown>
  }
}

/** Connects two topics. Returns the new id, or the existing line's id if the pair is already connected. */
export function addRelationship(doc: MapDoc, from: string, to: string): string | null {
  if (from === to || !doc.topics.has(from) || !doc.topics.has(to)) return null
  for (const r of doc.relationships.values()) if (r.from === from && r.to === to) return r.id
  const id = newId()
  const rel: Relationship = { id, from, to, label: '', arrows: 'end', bend: 70 }
  tx(doc, () => doc.relationships.set(id, rel))
  return id
}

export function addCallout(doc: MapDoc, topicId: string, text = ''): string | null {
  if (!doc.topics.has(topicId)) return null
  const id = newId()
  let existing = 0
  for (const c of doc.callouts.values()) if (c.topicId === topicId) existing++
  const callout: Callout = { id, topicId, text, dx: 36, dy: -72 - existing * 56 }
  tx(doc, () => doc.callouts.set(id, callout))
  return id
}

/** A boundary around the given topics (and their branches). Nested selections are folded together. */
export function addBoundary(doc: MapDoc, topicIds: string[], shape: BoundaryShape = 'rounded'): string | null {
  const topics = snapshotTopics(doc)
  const ids = topLevelOnly(topics, topicIds.filter((id) => topics[id]))
  if (!ids.length) return null
  const id = newId()
  const boundary: Boundary = { id, topicIds: ids, shape, lineStyle: 'dashed', label: '' }
  tx(doc, () => doc.boundaries.set(id, boundary))
  return id
}

/**
 * A summary bracket over sibling topics. Needs topics that share a parent; it spans from the first to the last
 * of them in sibling order. Returns null for the central topic, floating topics or topics with different parents.
 */
export function addSummary(doc: MapDoc, topicIds: string[], text = ''): string | null {
  const topics = snapshotTopics(doc)
  const picked = topicIds.map((id) => topics[id]).filter((t): t is NonNullable<typeof t> => !!t)
  const parentId = picked[0]?.parentId
  if (!picked.length || !parentId || picked.some((t) => t.parentId !== parentId)) return null
  const sibs = childrenOf(buildIndex(topics), parentId)
  const idxs = picked.map((t) => sibs.findIndex((s) => s.id === t.id)).filter((i) => i >= 0)
  const range = sibs.slice(Math.min(...idxs), Math.max(...idxs) + 1).map((s) => s.id)
  const id = newId()
  const summary: Summary = { id, parentId, topicIds: range, text }
  tx(doc, () => doc.summaries.set(id, summary))
  return id
}

export function updateObject(doc: MapDoc, kind: ObjectKind, id: string, patch: Record<string, unknown>) {
  const map = mapFor(doc, kind)
  const cur = map.get(id) as object | undefined
  if (!cur) return
  tx(doc, () => map.set(id, { ...cur, ...patch }))
}

export function deleteObject(doc: MapDoc, kind: ObjectKind, id: string) {
  const map = mapFor(doc, kind)
  if (!map.has(id)) return
  tx(doc, () => map.delete(id))
}

/** Removes or trims diagram objects that refer to topics that no longer exist. Call inside a transaction. */
export function pruneObjects(doc: MapDoc, removed: ReadonlySet<string>) {
  for (const [id, r] of [...doc.relationships.entries()]) {
    if (removed.has(r.from) || removed.has(r.to)) doc.relationships.delete(id)
  }
  for (const [id, c] of [...doc.callouts.entries()]) {
    if (removed.has(c.topicId)) doc.callouts.delete(id)
  }
  for (const [id, b] of [...doc.boundaries.entries()]) {
    const kept = b.topicIds.filter((t) => !removed.has(t))
    if (!kept.length) doc.boundaries.delete(id)
    else if (kept.length !== b.topicIds.length) doc.boundaries.set(id, { ...b, topicIds: kept })
  }
  for (const [id, s] of [...doc.summaries.entries()]) {
    const kept = s.topicIds.filter((t) => !removed.has(t))
    if (removed.has(s.parentId) || !kept.length) doc.summaries.delete(id)
    else if (kept.length !== s.topicIds.length) doc.summaries.set(id, { ...s, topicIds: kept })
  }
}
