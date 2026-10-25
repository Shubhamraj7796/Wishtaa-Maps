import { newId } from './ids'
import { LOCAL, getRootId, snapshotTopics, type MapDoc } from './doc'
import { makeTopic, type TopicData } from './topic'
import { buildIndex, childrenOf, descendantIds, isAncestorOf, topLevelOnly, type TopicMap } from './tree'

export interface Point {
  x: number
  y: number
}

type BranchData = Pick<TopicData, 'text' | 'collapsed' | 'style' | 'marks' | 'note' | 'tags' | 'task' | 'link'>
export interface Branch {
  data: BranchData
  children: Branch[]
}

const tx = (doc: MapDoc, fn: () => void) => doc.ydoc.transact(fn, LOCAL)

/** Writes `list` as the ordered children of `parentId`, touching only what changed. */
function applyList(doc: MapDoc, parentId: string | null, list: TopicData[]) {
  list.forEach((s, i) => {
    const cur = doc.topics.get(s.id)
    if (!cur || cur.order !== i || cur.parentId !== parentId || s !== cur) {
      doc.topics.set(s.id, { ...s, parentId, order: i })
    }
  })
}

export function addChild(doc: MapDoc, parentId: string, text = 'New topic'): string {
  const id = newId()
  tx(doc, () => {
    const topics = snapshotTopics(doc)
    const kids = childrenOf(buildIndex(topics), parentId)
    doc.topics.set(id, makeTopic({ id, parentId, order: kids.length, text }))
    const p = topics[parentId]
    if (p?.collapsed) doc.topics.set(parentId, { ...p, collapsed: false })
  })
  return id
}

/** Inserts right after `id`. Returns null for the central topic and floating topics. */
export function addSibling(doc: MapDoc, id: string, text = 'New topic'): string | null {
  const topics = snapshotTopics(doc)
  const me = topics[id]
  if (!me || me.parentId === null || !topics[me.parentId]) return null
  const parentId = me.parentId
  const nid = newId()
  tx(doc, () => {
    const sibs = [...childrenOf(buildIndex(topics), parentId)]
    const pos = sibs.findIndex((s) => s.id === id)
    sibs.splice(pos + 1, 0, makeTopic({ id: nid, parentId, order: 0, text }))
    applyList(doc, parentId, sibs)
  })
  return nid
}

export function addFloating(doc: MapDoc, pos: Point, text = 'Floating topic'): string {
  const id = newId()
  tx(doc, () => {
    doc.topics.set(id, makeTopic({ id, parentId: null, order: 0, text, floatingPosition: pos }))
  })
  return id
}

export function setText(doc: MapDoc, id: string, text: string) {
  const t = doc.topics.get(id)
  if (!t || t.text === text) return
  tx(doc, () => doc.topics.set(id, { ...t, text }))
}

export function setCollapsed(doc: MapDoc, ids: string[], collapsed: boolean) {
  tx(doc, () => {
    for (const id of ids) {
      const t = doc.topics.get(id)
      if (t && t.collapsed !== collapsed) doc.topics.set(id, { ...t, collapsed })
    }
  })
}

export function setFloatingPosition(doc: MapDoc, id: string, pos: Point) {
  const t = doc.topics.get(id)
  if (!t || t.parentId !== null || id === getRootId(doc)) return
  tx(doc, () => doc.topics.set(id, { ...t, floatingPosition: pos }))
}

/** Turns an attached branch into a free-floating one. */
export function detachTopic(doc: MapDoc, id: string, pos: Point): boolean {
  const topics = snapshotTopics(doc)
  const t = topics[id]
  if (!t || t.parentId === null || id === getRootId(doc)) return false
  const oldParent = t.parentId
  tx(doc, () => {
    doc.topics.set(id, { ...t, parentId: null, order: 0, floatingPosition: pos })
    applyList(doc, oldParent, childrenOf(buildIndex(topics), oldParent).filter((s) => s.id !== id))
  })
  return true
}

/** Deletes branches (never the central topic). Returns every removed id. */
export function deleteTopics(doc: MapDoc, ids: string[]): string[] {
  const rootId = getRootId(doc)
  const topics = snapshotTopics(doc)
  const idx = buildIndex(topics)
  const targets = topLevelOnly(topics, ids.filter((id) => id !== rootId && topics[id]))
  if (!targets.length) return []
  const removed = new Set<string>()
  for (const id of targets) {
    removed.add(id)
    descendantIds(idx, id).forEach((d) => removed.add(d))
  }
  const parents = new Set(targets.map((id) => topics[id]?.parentId ?? null))
  tx(doc, () => {
    removed.forEach((id) => doc.topics.delete(id))
    for (const p of parents) {
      if (p === null) continue
      applyList(doc, p, childrenOf(idx, p).filter((s) => !removed.has(s.id)))
    }
  })
  return [...removed]
}

/** Re-parents `id`. `index` is the position among the new siblings (default: last). */
export function moveTopic(doc: MapDoc, id: string, newParentId: string, index?: number): boolean {
  const rootId = getRootId(doc)
  const topics = snapshotTopics(doc)
  const t = topics[id]
  const np = topics[newParentId]
  if (!t || !np || id === rootId || newParentId === id) return false
  if (isAncestorOf(topics, id, newParentId)) return false
  const idx = buildIndex(topics)
  const oldParent = t.parentId
  tx(doc, () => {
    const sibs = childrenOf(idx, newParentId).filter((s) => s.id !== id)
    const at = index === undefined ? sibs.length : Math.max(0, Math.min(index, sibs.length))
    sibs.splice(at, 0, { ...t, floatingPosition: null })
    applyList(doc, newParentId, sibs)
    if (oldParent !== null && oldParent !== newParentId) {
      applyList(doc, oldParent, childrenOf(idx, oldParent).filter((s) => s.id !== id))
    }
    if (np.collapsed) doc.topics.set(newParentId, { ...np, collapsed: false })
  })
  return true
}

/** Moves a topic up (-1) or down (+1) among its siblings. */
export function reorder(doc: MapDoc, id: string, delta: -1 | 1): boolean {
  const topics = snapshotTopics(doc)
  const t = topics[id]
  if (!t || t.parentId === null || !topics[t.parentId]) return false
  const parentId = t.parentId
  const sibs = [...childrenOf(buildIndex(topics), parentId)]
  const from = sibs.findIndex((s) => s.id === id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= sibs.length) return false
  const [moved] = sibs.splice(from, 1)
  if (!moved) return false
  sibs.splice(to, 0, moved)
  tx(doc, () => applyList(doc, parentId, sibs))
  return true
}

function toBranch(topics: TopicMap, idx: ReturnType<typeof buildIndex>, id: string): Branch {
  const t = topics[id] as TopicData
  return {
    data: structuredClone({
      text: t.text,
      collapsed: t.collapsed,
      style: t.style,
      marks: t.marks,
      note: t.note,
      tags: t.tags,
      task: t.task,
      link: t.link,
    }),
    children: childrenOf(idx, id).map((c) => toBranch(topics, idx, c.id)),
  }
}

/** Copies branches (nested selections are folded into their ancestor). */
export function serializeBranches(topics: TopicMap, ids: string[]): Branch[] {
  const idx = buildIndex(topics)
  return topLevelOnly(topics, ids)
    .filter((id) => topics[id])
    .map((id) => toBranch(topics, idx, id))
}

function insertBranch(doc: MapDoc, b: Branch, parentId: string | null, order: number, pos: Point | null): string {
  const id = newId()
  doc.topics.set(
    id,
    makeTopic({ id, parentId, order, ...structuredClone(b.data), floatingPosition: parentId === null ? pos : null })
  )
  b.children.forEach((c, i) => insertBranch(doc, c, id, i, null))
  return id
}

/** Pastes branches as children of `parentId` (at `index`, default last). Returns the new top ids. */
export function pasteBranches(doc: MapDoc, branches: Branch[], parentId: string, index?: number): string[] {
  const topics = snapshotTopics(doc)
  const parent = topics[parentId]
  if (!parent || !branches.length) return []
  const ids: string[] = []
  tx(doc, () => {
    const sibs = [...childrenOf(buildIndex(topics), parentId)]
    const at = index === undefined ? sibs.length : Math.max(0, Math.min(index, sibs.length))
    // Insert with placeholder orders, then renumber siblings.
    const created = branches.map((b, i) => insertBranch(doc, b, parentId, at + i, null))
    ids.push(...created)
    const after = childrenOf(buildIndex(snapshotTopics(doc)), parentId)
    const createdSet = new Set(created)
    const rest = after.filter((s) => !createdSet.has(s.id))
    const mine = created.map((cid) => doc.topics.get(cid)).filter((s): s is TopicData => !!s)
    rest.splice(at, 0, ...mine)
    applyList(doc, parentId, rest)
    if (parent.collapsed) doc.topics.set(parentId, { ...parent, collapsed: false })
  })
  return ids
}

/** Duplicates each branch right after itself (floating branches are offset). */
export function duplicate(doc: MapDoc, ids: string[]): string[] {
  const rootId = getRootId(doc)
  const topics = snapshotTopics(doc)
  const idx = buildIndex(topics)
  const out: string[] = []
  tx(doc, () => {
    for (const id of topLevelOnly(topics, ids.filter((x) => x !== rootId))) {
      const t = topics[id]
      if (!t) continue
      const branch = toBranch(topics, idx, id)
      if (t.parentId === null) {
        const pos = t.floatingPosition ?? { x: 0, y: 0 }
        out.push(insertBranch(doc, branch, null, 0, { x: pos.x + 40, y: pos.y + 40 }))
      } else {
        const at = childrenOf(idx, t.parentId).findIndex((s) => s.id === id) + 1
        out.push(...pasteBranches(doc, [branch], t.parentId, at))
      }
    }
  })
  return out
}
