import { noteText } from '../sanitize'
import { notesOf, type NoteItem } from './notes'
import type { TopicMap } from './tree'

/** The notes and tasks of a topic as outline lines: "[Note] Title: text" and "[Task] ..." (see toOutline). */
export function itemLines(topics: TopicMap, notes: Record<string, NoteItem>, topicId: string): string[] {
  const out: string[] = []
  for (const n of notesOf(topics, notes, topicId)) {
    const text = noteText(n.html)
    out.push(`[Note] ${[n.title.trim(), text].filter(Boolean).join(': ') || 'Note'}`)
  }
  return out
}
