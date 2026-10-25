import type { TopicData } from './topic'

export type TopicMap = Record<string, TopicData>
export type ChildIndex = Map<string | null, TopicData[]>

/**
 * Children grouped by parent, sorted by `order`. Topics whose parent no longer
 * exists (e.g. after a concurrent delete) are treated as floating roots.
 */
export function buildIndex(topics: TopicMap): ChildIndex {
  const idx: ChildIndex = new Map()
  for (const t of Object.values(topics)) {
    const parent = t.parentId !== null && topics[t.parentId] ? t.parentId : null
    const list = idx.get(parent)
    if (list) list.push(t)
    else idx.set(parent, [t])
  }
  for (const list of idx.values()) list.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1))
  return idx
}

export function childrenOf(idx: ChildIndex, id: string | null): TopicData[] {
  return idx.get(id) ?? []
}

/** All descendants (not including `id`), depth-first, iterative. */
export function descendantIds(idx: ChildIndex, id: string): string[] {
  const out: string[] = []
  const stack = [...childrenOf(idx, id)].reverse()
  while (stack.length) {
    const t = stack.pop()
    if (!t) break
    out.push(t.id)
    const kids = childrenOf(idx, t.id)
    for (let i = kids.length - 1; i >= 0; i--) {
      const k = kids[i]
      if (k) stack.push(k)
    }
  }
  return out
}

export function ancestorIds(topics: TopicMap, id: string): string[] {
  const out: string[] = []
  let cur = topics[id]?.parentId ?? null
  let guard = 0
  while (cur && topics[cur] && guard++ < 100000) {
    out.push(cur)
    cur = topics[cur]?.parentId ?? null
  }
  return out
}

export function isAncestorOf(topics: TopicMap, ancestorId: string, id: string): boolean {
  return ancestorIds(topics, id).includes(ancestorId)
}

/** Drop ids that have an ancestor in the same set (so a branch is not handled twice). */
export function topLevelOnly(topics: TopicMap, ids: string[]): string[] {
  const set = new Set(ids)
  return ids.filter((id) => !ancestorIds(topics, id).some((a) => set.has(a)))
}
