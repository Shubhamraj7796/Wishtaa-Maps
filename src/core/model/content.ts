import { parseMark, toggleMark } from '../marks'
import { stripControl } from '../text'
import { LOCAL, type MapDoc } from './doc'
import type { Attachment, ImagePosition } from './topic'
import type { Task } from './types'

const tx = (doc: MapDoc, fn: () => void) => doc.ydoc.transact(fn, LOCAL)

export const MAX_TAG_LENGTH = 30
export const MAX_TABLE_ROWS = 12
export const MAX_TABLE_COLS = 8
export const MAX_ATTACHMENTS = 10
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_LATEX_LENGTH = 500
export const MAX_INLINE_NOTE = 200

/** Adds a mark to every given topic, or removes it from all of them if they all already have it. One undo step. */
export function toggleMarkOn(doc: MapDoc, ids: string[], mark: string) {
  if (!parseMark(mark)) return
  const topics = ids.map((id) => doc.topics.get(id)).filter((t): t is NonNullable<typeof t> => !!t)
  if (!topics.length) return
  const allHave = topics.every((t) => t.marks.includes(mark))
  tx(doc, () => {
    for (const t of topics) {
      const marks = allHave ? t.marks.filter((m) => m !== mark) : t.marks.includes(mark) ? t.marks : toggleMark(t.marks, mark)
      doc.topics.set(t.id, { ...t, marks })
    }
  })
}

export function clearMarks(doc: MapDoc, ids: string[]) {
  tx(doc, () => {
    for (const id of ids) {
      const t = doc.topics.get(id)
      if (t && t.marks.length) doc.topics.set(id, { ...t, marks: [] })
    }
  })
}

export function cleanTag(raw: string): string {
  return stripControl(raw).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH)
}

export function addTag(doc: MapDoc, ids: string[], raw: string): boolean {
  const tag = cleanTag(raw)
  if (!tag) return false
  tx(doc, () => {
    for (const id of ids) {
      const t = doc.topics.get(id)
      if (t && !t.tags.includes(tag)) doc.topics.set(id, { ...t, tags: [...t.tags, tag] })
    }
  })
  return true
}

export function removeTag(doc: MapDoc, ids: string[], tag: string) {
  tx(doc, () => {
    for (const id of ids) {
      const t = doc.topics.get(id)
      if (t?.tags.includes(tag)) doc.topics.set(id, { ...t, tags: t.tags.filter((x) => x !== tag) })
    }
  })
}

/** Sets a topic's task (null removes it). */
export function setTask(doc: MapDoc, id: string, task: Task | null) {
  const t = doc.topics.get(id)
  if (t) tx(doc, () => doc.topics.set(id, { ...t, task }))
}

export function patchTask(doc: MapDoc, id: string, patch: Partial<Task>) {
  const t = doc.topics.get(id)
  if (!t) return
  const base: Task = t.task ?? { done: false }
  const next: Record<string, unknown> = { ...base, ...patch }
  for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === '') delete next[k]
  setTask(doc, id, next as unknown as Task)
}

export function setLink(doc: MapDoc, id: string, link: string | null) {
  const t = doc.topics.get(id)
  if (t && (t.link ?? null) !== link) tx(doc, () => doc.topics.set(id, { ...t, link }))
}

/** `html` must already be sanitised (see sanitizeNote). */
export function setNote(doc: MapDoc, id: string, html: string) {
  const t = doc.topics.get(id)
  if (t && t.note !== html) tx(doc, () => doc.topics.set(id, { ...t, note: html }))
}

export function setInlineNote(doc: MapDoc, id: string, text: string) {
  const t = doc.topics.get(id)
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_INLINE_NOTE)
  if (t && (t.inlineNote ?? '') !== clean) tx(doc, () => doc.topics.set(id, { ...t, inlineNote: clean }))
}

export function setLatex(doc: MapDoc, id: string, latex: string | null) {
  const t = doc.topics.get(id)
  const clean = latex?.trim().slice(0, MAX_LATEX_LENGTH) || null
  if (t && (t.latex ?? null) !== clean) tx(doc, () => doc.topics.set(id, { ...t, latex: clean }))
}

/** Rows of cell text, clamped to a sensible size. Null or an empty table removes it. */
export function normalizeTable(table: string[][] | null | undefined): string[][] | null {
  if (!table?.length) return null
  const cols = Math.min(MAX_TABLE_COLS, Math.max(1, ...table.map((r) => r.length)))
  return table.slice(0, MAX_TABLE_ROWS).map((r) => Array.from({ length: cols }, (_, i) => (r[i] ?? '').slice(0, 80)))
}

export function setTable(doc: MapDoc, id: string, table: string[][] | null) {
  const t = doc.topics.get(id)
  if (t) tx(doc, () => doc.topics.set(id, { ...t, table: normalizeTable(table) }))
}

export function addAttachment(doc: MapDoc, id: string, file: Attachment): boolean {
  const t = doc.topics.get(id)
  const cur = t?.attachments ?? []
  if (!t || cur.length >= MAX_ATTACHMENTS) return false
  tx(doc, () => doc.topics.set(id, { ...t, attachments: [...cur, file] }))
  return true
}

export function removeAttachment(doc: MapDoc, id: string, attachmentId: string) {
  const t = doc.topics.get(id)
  if (t?.attachments?.some((a) => a.id === attachmentId)) {
    tx(doc, () => doc.topics.set(id, { ...t, attachments: (t.attachments ?? []).filter((a) => a.id !== attachmentId) }))
  }
}

export function setImagePosition(doc: MapDoc, id: string, position: ImagePosition) {
  const t = doc.topics.get(id)
  if (t?.image && (t.image.position ?? 'above') !== position) {
    tx(doc, () => doc.topics.set(id, { ...t, image: { ...t.image!, position } }))
  }
}

/** The text that stands in for the picture for screen readers (empty clears it). One undo step. */
export function setImageAlt(doc: MapDoc, id: string, alt: string) {
  const t = doc.topics.get(id)
  const next = alt.trim().slice(0, 300)
  if (!t?.image || (t.image.alt ?? '') === next) return
  const image = { ...t.image }
  if (next) image.alt = next
  else delete image.alt
  tx(doc, () => doc.topics.set(id, { ...t, image }))
}

/** Gives every picture the same width (heights follow each picture's own shape). One undo step. */
export function setAllImageWidths(doc: MapDoc, width: number, onlyWithin?: ReadonlySet<string>) {
  tx(doc, () => {
    doc.topics.forEach((t, id) => {
      if (!t.image || (onlyWithin && !onlyWithin.has(id))) return
      const ratio = t.image.height / t.image.width
      const w = Math.max(40, Math.min(1200, Math.round(width)))
      doc.topics.set(id, { ...t, image: { ...t.image, width: w, height: Math.max(40, Math.round(w * ratio)) } })
    })
  })
}
