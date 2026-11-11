import { newId } from './ids'
import { LOCAL, type MapDoc } from './doc'
import { noteText } from '../sanitize'
import type { TopicMap } from './tree'

/** A note beyond a topic's first one. The first note is still `topic.note` (see `notesOf`), so older maps and imports keep working. */
export interface NoteItem {
  id: string
  topicId: string
  title: string
  /** Cleaned HTML (see sanitizeNote). */
  html: string
  createdAt: number
  updatedAt: number
  order: number
}

/** One note as the list shows it: the topic's first note (`legacy`, id `topic:<topicId>`) or one of the others. */
export interface NoteEntry {
  id: string
  topicId: string
  title: string
  html: string
  legacy: boolean
  createdAt: number | null
  updatedAt: number | null
}

export const MAX_NOTE_TITLE = 80
export const legacyNoteId = (topicId: string) => `topic:${topicId}`
export const isLegacyNoteId = (id: string) => id.startsWith('topic:')
export const topicOfLegacy = (id: string) => id.slice('topic:'.length)

const tx = (doc: MapDoc, fn: () => void) => doc.ydoc.transact(fn, LOCAL)
const cleanTitle = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE_TITLE)

/** What the note list shows for a title: the title, or the start of the text, or "Note". */
export function noteLabel(e: Pick<NoteEntry, 'title' | 'html'>): string {
  if (e.title.trim()) return e.title.trim()
  const text = noteText(e.html)
  return text ? text.slice(0, 40) : 'Note'
}

/** The notes of a topic in the order they are shown: the first note (when it has text), then the others by `order`. */
export function notesOf(topics: TopicMap, notes: Record<string, NoteItem>, topicId: string): NoteEntry[] {
  const out: NoteEntry[] = []
  const legacy = topics[topicId]?.note ?? ''
  if (noteText(legacy)) out.push({ id: legacyNoteId(topicId), topicId, title: '', html: legacy, legacy: true, createdAt: null, updatedAt: null })
  const own = Object.values(notes)
    .filter((n) => n.topicId === topicId)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  for (const n of own) out.push({ id: n.id, topicId, title: n.title, html: n.html, legacy: false, createdAt: n.createdAt, updatedAt: n.updatedAt })
  return out
}

/** How many notes each topic has (only topics with at least one). */
export function noteCounts(topics: TopicMap, notes: Record<string, NoteItem>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of Object.values(topics)) if (noteText(t.note)) out[t.id] = 1
  for (const n of Object.values(notes)) if (topics[n.topicId]) out[n.topicId] = (out[n.topicId] ?? 0) + 1
  return out
}

/** Adds an empty note at the end of a topic's notes and returns its id. One undo step. */
export function addNote(doc: MapDoc, topicId: string, init: Partial<Pick<NoteItem, 'title' | 'html'>> = {}, now = Date.now()): string | null {
  if (!doc.topics.has(topicId)) return null
  let order = 0
  doc.notes.forEach((n) => {
    if (n.topicId === topicId) order = Math.max(order, n.order + 1)
  })
  const id = newId()
  const item: NoteItem = { id, topicId, title: cleanTitle(init.title ?? ''), html: init.html ?? '', createdAt: now, updatedAt: now, order }
  tx(doc, () => doc.notes.set(id, item))
  return id
}

/** Changes a note's title and/or text (only what changed is written, and the edited time moves only then). `html` must be sanitised. */
export function patchNote(doc: MapDoc, id: string, patch: { title?: string; html?: string }, now = Date.now()) {
  const n = doc.notes.get(id)
  if (!n) return
  const next: NoteItem = { ...n }
  if (patch.title !== undefined) next.title = cleanTitle(patch.title)
  if (patch.html !== undefined) next.html = patch.html
  if (next.title === n.title && next.html === n.html) return
  next.updatedAt = now
  tx(doc, () => doc.notes.set(id, next))
}

/** Removes a note. The topic's first note is emptied instead (it lives in the topic). One undo step. */
export function deleteNote(doc: MapDoc, id: string) {
  if (isLegacyNoteId(id)) {
    const t = doc.topics.get(topicOfLegacy(id))
    if (t && t.note) tx(doc, () => doc.topics.set(t.id, { ...t, note: '' }))
    return
  }
  if (doc.notes.has(id)) tx(doc, () => doc.notes.delete(id))
}

/** The notes of a topic, as text lines for search and export: title, then the plain text. */
export function noteTexts(topics: TopicMap, notes: Record<string, NoteItem>, topicId: string): string[] {
  return notesOf(topics, notes, topicId).map((e) => [e.title.trim(), noteText(e.html)].filter(Boolean).join(': '))
}

/** One note by its id (the first note of a topic is found even while it is empty, so a popup does not vanish while it is being cleared). */
export function noteEntry(topics: TopicMap, notes: Record<string, NoteItem>, id: string): NoteEntry | null {
  if (isLegacyNoteId(id)) {
    const topicId = topicOfLegacy(id)
    const t = topics[topicId]
    return t ? { id, topicId, title: '', html: t.note ?? '', legacy: true, createdAt: null, updatedAt: null } : null
  }
  const n = notes[id]
  return n ? { id, topicId: n.topicId, title: n.title, html: n.html, legacy: false, createdAt: n.createdAt, updatedAt: n.updatedAt } : null
}
