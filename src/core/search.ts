import { ancestorIds, buildIndex, childrenOf, type TopicMap } from './model/tree'
import { noteTexts, type NoteItem } from './model/notes'

/** Ids whose text or note (the first one, or any other note of the topic, by title or text) contains `query` (case-insensitive), in map order. */
export function searchTopics(topics: TopicMap, query: string, notes: Record<string, NoteItem> = {}): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const idx = buildIndex(topics)
  const out: string[] = []
  const hasOwn = new Set(Object.values(notes).map((n) => n.topicId))
  const stack = [...childrenOf(idx, null)].reverse()
  while (stack.length) {
    const t = stack.pop()
    if (!t) break
    if (t.text.toLowerCase().includes(q) || t.note.toLowerCase().includes(q) || (hasOwn.has(t.id) && noteTexts(topics, notes, t.id).some((x) => x.toLowerCase().includes(q)))) out.push(t.id)
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
