import { newId } from '@/core/model/ids'
import { LOCAL } from '@/core/model/doc'
import { unionRect } from '@/core/pdf/geometry'
import { topicTexts } from '@/core/pdf/text'
import { PDF_LIMITS, type MarkupKind, type MarkupObject, type Point, type Rect } from '@/core/pdf/types'
import { mapDoc } from '../mapdoc'
import { showNotice } from '../notice'
import { mayEdit } from '../readmode'
import { useEditor } from '../store'
import { strokeWidth, type ToolStyle } from './toolPrefs'
import { addOutlineTopics, addPdfTopics } from './topics'

const get = useEditor.getState

/** Colours offered for markup (highlighters first). */
export const MARKUP_COLORS = ['#facc15', '#4ade80', '#38bdf8', '#f472b6', '#fb923c', '#ef4444', '#111827'] as const

/** Line widths for the pen and shapes, as a fraction of the page width. */
export const PEN_WIDTH = 0.004

export type NewMarkup = Omit<MarkupObject, 'id' | 'createdAt'>

/** Adds one piece of markup. One undo step. Returns its id, or null when it was not allowed. */
export function addMarkup(m: NewMarkup): string | null {
  if (!mayEdit('Marking up a PDF')) return null
  if (mapDoc.markup.size >= PDF_LIMITS.maxMarkupPerMap) {
    showNotice(`This map has the most markup it can hold (${PDF_LIMITS.maxMarkupPerMap.toLocaleString()}). Delete some to add more.`)
    return null
  }
  const id = newId()
  mapDoc.ydoc.transact(() => mapDoc.markup.set(id, { ...m, id, createdAt: Date.now() }), LOCAL)
  return id
}

/** Adds several pieces in one undo step. */
export function addManyMarkup(list: readonly NewMarkup[]): string[] {
  if (!mayEdit('Marking up a PDF') || !list.length) return []
  const room = PDF_LIMITS.maxMarkupPerMap - mapDoc.markup.size
  if (room < list.length) {
    showNotice(`This map has the most markup it can hold (${PDF_LIMITS.maxMarkupPerMap.toLocaleString()}). Delete some to add more.`)
    return []
  }
  const ids: string[] = []
  mapDoc.ydoc.transact(() => {
    for (const m of list) {
      const id = newId()
      ids.push(id)
      mapDoc.markup.set(id, { ...m, id, createdAt: Date.now() })
    }
  }, LOCAL)
  return ids
}

export function updateMarkup(id: string, change: Partial<Omit<MarkupObject, 'id' | 'sourceId' | 'createdAt'>>) {
  if (!mayEdit('Changing markup')) return
  const cur = mapDoc.markup.get(id)
  if (!cur) return
  mapDoc.ydoc.transact(() => mapDoc.markup.set(id, { ...cur, ...change }), LOCAL)
}

export function deleteMarkup(id: string) {
  if (!mayEdit('Deleting markup')) return
  if (!mapDoc.markup.has(id)) return
  mapDoc.ydoc.transact(() => mapDoc.markup.delete(id), LOCAL)
  if (get().pdfPanel.markId === id) selectMarkup(null)
}

export const selectMarkup = (id: string | null) => useEditor.setState({ pdfPanel: { ...get().pdfPanel, markId: id } })

/** The bounding rectangle of a piece of markup (page fractions as read). */
export function boundsOf(m: MarkupObject): Rect | null {
  if (m.rects?.length) return unionRect(m.rects)
  if (m.points?.length) {
    const xs = m.points.map((p) => p[0])
    const ys = m.points.map((p) => p[1])
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
  }
  return null
}

const inside = (r: Rect, p: Point, slack: number) => p[0] >= r.x - slack && p[0] <= r.x + r.w + slack && p[1] >= r.y - slack && p[1] <= r.y + r.h + slack

/** The topmost markup at a point of a page (the last added wins), for choosing it with a click. */
export function markupAt(list: readonly MarkupObject[], p: Point, slack = 0.006): MarkupObject | null {
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i] as MarkupObject
    const hit = m.rects?.length ? m.rects.some((r) => inside(r, p, slack)) : (() => {
      const b = boundsOf(m)
      return !!b && inside(b, p, Math.max(slack, (m.width ?? 0) * 2))
    })()
    if (hit) return m
  }
  return null
}

/** Markup of one page, oldest first. */
export function markupOfPage(all: Record<string, MarkupObject>, sourceId: string, page: number): MarkupObject[] {
  const out: MarkupObject[] = []
  for (const m of Object.values(all)) if (m.sourceId === sourceId && m.page === page) out.push(m)
  return out.sort((a, b) => a.createdAt - b.createdAt)
}

/** Markup of a PDF by page number, each list oldest first. */
export function markupByPage(all: Record<string, MarkupObject>, sourceId: string): Map<number, MarkupObject[]> {
  const out = new Map<number, MarkupObject[]>()
  for (const m of Object.values(all)) {
    if (m.sourceId !== sourceId) continue
    const list = out.get(m.page) ?? []
    list.push(m)
    out.set(m.page, list)
  }
  for (const list of out.values()) list.sort((a, b) => a.createdAt - b.createdAt)
  return out
}

/** Marks the words of a text selection: one rectangle per line, with the words kept (for "make a topic from this"). */
export function markText(kind: Extract<MarkupKind, 'highlight' | 'underline' | 'strike'>, sel: { sourceId: string; page: number; rects: Rect[]; text: string }, style: string | ToolStyle): string | null {
  if (!sel.rects.length) return null
  const s = typeof style === 'string' ? { color: style, size: 0, opacity: 0 } : style
  const extra = kind === 'highlight' ? (s.opacity ? { opacity: s.opacity } : {}) : s.size ? { width: strokeWidth(s.size) } : {}
  return addMarkup({ sourceId: sel.sourceId, page: sel.page, kind, color: s.color, rects: sel.rects, text: topicTexts(sel.text)[0] ?? '', ...extra })
}

/** The words under a piece of markup, or what was typed into it. */
export const wordsOf = (m: MarkupObject) => (m.text ?? '').trim()

/** Makes a topic from a highlight (its words, linked to the page and place) and remembers it on the highlight. One undo step. */
export function topicFromMarkup(id: string): string | null {
  const m = mapDoc.markup.get(id)
  const rect = m && boundsOf(m)
  if (!m || !rect || !wordsOf(m)) {
    showNotice('Only a highlight with words can become a topic.')
    return null
  }
  let made: string | null = null
  mapDoc.ydoc.transact(() => {
    const [topic] = addPdfTopics({ sourceId: m.sourceId, page: m.page, rect, rects: m.rects ?? [rect], text: m.text ?? '' }, 'sub')
    if (topic) {
      made = topic
      mapDoc.markup.set(id, { ...m, topicId: topic })
    }
  }, LOCAL)
  return made
}

/**
 * Sends every highlight of a PDF to the outline in one go: a topic per page ("Page 3"), with a topic for each highlight under it, all
 * linked to their place. Highlights already made into topics are left out. One undo step.
 */
export function sendHighlightsToOutline(sourceId: string): number {
  const byPage = markupByPage(get().pdf.markup, sourceId)
  const items: { title: string; level: number; page: number; rect: Rect | null; markId: string | null }[] = []
  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    const hl = (byPage.get(page) ?? []).filter((m) => m.kind === 'highlight' && wordsOf(m) && !m.topicId)
    if (!hl.length) continue
    items.push({ title: `Page ${page}`, level: 1, page, rect: null, markId: null })
    for (const m of hl) items.push({ title: wordsOf(m), level: 2, page, rect: boundsOf(m), markId: m.id })
  }
  if (!items.length) {
    showNotice('There are no new highlights to send. (Highlights already made into topics are skipped.)')
    return 0
  }
  const count = items.filter((i) => i.markId).length
  mapDoc.ydoc.transact(() => {
    addOutlineTopics(
      sourceId,
      items,
      undefined,
      (i, topicId) => {
        const mark = items[i]?.markId
        const cur = mark ? mapDoc.markup.get(mark) : undefined
        if (mark && cur) mapDoc.markup.set(mark, { ...cur, topicId })
      },
    )
  }, LOCAL)
  showNotice(`Sent ${count} highlight${count === 1 ? '' : 's'} to the outline.`)
  return count
}

