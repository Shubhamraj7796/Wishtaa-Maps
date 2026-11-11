import type { ItemCount } from '../layout/types'
import { noteCounts, type NoteItem } from './notes'
import type { TopicMap } from './tree'

export const noItems: Record<string, ItemCount> = {}

/** How many notes (the first one counts) and open tasks of their own each topic has: only topics that have at least one are listed. */
export function itemCountsOf(topics: TopicMap, notes: Record<string, NoteItem>): Record<string, ItemCount> {
  const out: Record<string, ItemCount> = {}
  for (const [id, n] of Object.entries(noteCounts(topics, notes))) out[id] = { notes: n, tasks: 0 }
  return out
}

/** True when two counts are the same (the store keeps the old object then, so nothing redraws). */
export function sameCounts(a: Record<string, ItemCount>, b: Record<string, ItemCount>): boolean {
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((k) => b[k] && a[k]?.notes === b[k]?.notes && a[k]?.tasks === b[k]?.tasks)
}
