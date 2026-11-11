import type { ItemCount } from '../layout/types'
import { noteCounts, type NoteItem } from './notes'
import { taskCounts, type TaskItem } from './tasks'
import type { TopicMap } from './tree'

export const noItems: Record<string, ItemCount> = {}

/** How many notes (the first one counts) and open tasks of their own each topic has: only topics that have at least one are listed. */
export function itemCountsOf(topics: TopicMap, notes: Record<string, NoteItem>, tasks: Record<string, TaskItem> = {}): Record<string, ItemCount> {
  const out: Record<string, ItemCount> = {}
  for (const [id, n] of Object.entries(noteCounts(topics, notes))) out[id] = { notes: n, tasks: 0 }
  for (const [id, n] of Object.entries(taskCounts(topics, tasks))) out[id] = { notes: out[id]?.notes ?? 0, tasks: n }
  return out
}

/** True when two counts are the same (the store keeps the old object then, so nothing redraws). */
export function sameCounts(a: Record<string, ItemCount>, b: Record<string, ItemCount>): boolean {
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((k) => b[k] && a[k]?.notes === b[k]?.notes && a[k]?.tasks === b[k]?.tasks)
}
