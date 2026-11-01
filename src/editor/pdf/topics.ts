import { addChild, addSibling, setSource } from '@/core/model/commands'
import { LOCAL } from '@/core/model/doc'
import { topicTexts } from '@/core/pdf/text'
import type { Rect } from '@/core/pdf/types'
import { mapDoc } from '../mapdoc'
import { showNotice } from '../notice'
import { mayEdit } from '../readmode'
import { selectOnly } from '../actions'
import { useEditor } from '../store'
import type { PdfSelection } from './selection'

export type TopicPlace = 'topic' | 'sub'

/**
 * Makes topics from text taken out of a PDF. "topic" puts them beside the selected topic, "sub" under it; with nothing selected they go
 * under the central topic. Each remembers its page and place in the PDF. All of it is one undo step.
 */
export function addPdfTopics(sel: PdfSelection, place: TopicPlace, opts: { perLine?: boolean; anchor?: string } = {}): string[] {
  if (!mayEdit('Adding a topic')) return []
  const texts = topicTexts(sel.text, { perLine: opts.perLine })
  if (!texts.length) {
    showNotice('There is no text in that selection.')
    return []
  }
  const s = useEditor.getState()
  const current = opts.anchor ?? s.selected[s.selected.length - 1]
  const anchor = current && s.topics[current] ? current : s.rootId
  const ids: string[] = []
  const beside = place === 'topic' && anchor !== s.rootId
  mapDoc.ydoc.transact(() => {
    let last = anchor
    for (const t of texts) {
      const id = (beside ? addSibling(mapDoc, last, t) : null) ?? addChild(mapDoc, anchor, t)
      setSource(mapDoc, id, { sourceId: sel.sourceId, page: sel.page, rect: sel.rect })
      ids.push(id)
      last = id
    }
  }, LOCAL)
  if (ids[0]) selectOnly(ids[ids.length - 1] as string)
  return ids
}

export interface OutlineItem {
  title: string
  /** 1 is a main topic. */
  level: number
  page: number | null
  rect?: Rect | null
}

/**
 * Makes a tree of topics from a list of titles with levels (a PDF's bookmarks, or headings the person checked). They go under the
 * selected topic, or the central topic. A level that jumps deeper than the one before is placed one level deeper. One undo step.
 */
export function addOutlineTopics(sourceId: string, items: readonly OutlineItem[], anchor?: string, onMade?: (index: number, topicId: string) => void): number {
  if (!mayEdit('Adding topics')) return 0
  const kept = items.map((it, index) => ({ it, index })).filter((x) => x.it.title.trim())
  if (!kept.length) return 0
  const s = useEditor.getState()
  const current = anchor ?? s.selected[s.selected.length - 1]
  const base = current && s.topics[current] ? current : s.rootId
  let first: string | null = null
  mapDoc.ydoc.transact(() => {
    const chain: string[] = [base] // chain[level - 1] is the parent for a topic at `level`
    for (const { it, index } of kept) {
      const level = Math.max(1, Math.min(it.level, chain.length))
      const id = addChild(mapDoc, chain[level - 1] as string, it.title.trim())
      if (it.page) setSource(mapDoc, id, { sourceId, page: it.page, ...(it.rect ? { rect: it.rect } : {}) })
      chain.length = level
      chain.push(id)
      onMade?.(index, id)
      first ??= id
    }
  }, LOCAL)
  if (first) selectOnly(first)
  return kept.length
}
