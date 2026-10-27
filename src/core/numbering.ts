import { buildIndex, childrenOf, type TopicMap } from './model/tree'

/**
 * Automatic branch numbers for every topic below the central topic: 1, 1.1, 1.1.1 ...
 * Numbers follow sibling order and ignore collapsing, so they never change when a branch is folded.
 */
export function computeNumbers(topics: TopicMap, rootId: string): Map<string, string> {
  const idx = buildIndex(topics)
  const out = new Map<string, string>()
  const walk = (id: string, prefix: string) => {
    childrenOf(idx, id).forEach((kid, i) => {
      const n = prefix ? `${prefix}.${i + 1}` : String(i + 1)
      out.set(kid.id, n)
      walk(kid.id, n)
    })
  }
  if (topics[rootId]) walk(rootId, '')
  return out
}
