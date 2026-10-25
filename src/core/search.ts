import { ancestorIds, buildIndex, childrenOf, type TopicMap } from './model/tree'

/** Ids whose text or note contains `query` (case-insensitive), in map order. */
export function searchTopics(topics: TopicMap, query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const idx = buildIndex(topics)
  const out: string[] = []
  const stack = [...childrenOf(idx, null)].reverse()
  while (stack.length) {
    const t = stack.pop()
    if (!t) break
    if (t.text.toLowerCase().includes(q) || t.note.toLowerCase().includes(q)) out.push(t.id)
    const kids = childrenOf(idx, t.id)
    for (let i = kids.length - 1; i >= 0; i--) {
      const k = kids[i]
      if (k) stack.push(k)
    }
  }
  return out
}

/** Every ancestor of the matches: these must be shown expanded. */
export function revealAncestors(topics: TopicMap, matches: string[]): string[] {
  const set = new Set<string>()
  for (const id of matches) ancestorIds(topics, id).forEach((a) => set.add(a))
  return [...set]
}
