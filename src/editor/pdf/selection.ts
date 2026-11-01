import { clamp01, rectFromShown, unionRect } from '@/core/pdf/geometry'
import { editKey, NO_EDIT, type PageEdit, type Rect } from '@/core/pdf/types'

/** Some text chosen in a PDF page: what it says, which page, and where on the page (as the page is read). */
export interface PdfSelection {
  sourceId: string
  page: number
  rect: Rect
  /** One rectangle per line of text, for marking it. */
  rects: Rect[]
  text: string
}

/** The pieces a browser reports for a selection (often several per line, some nested) as one rectangle per line. */
export function lines(rects: readonly Rect[]): Rect[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x)
  const out: Rect[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    const overlap = last ? Math.min(last.y + last.h, r.y + r.h) - Math.max(last.y, r.y) : 0
    if (last && overlap > 0.5 * Math.min(last.h, r.h)) {
      const x = Math.min(last.x, r.x)
      const y = Math.min(last.y, r.y)
      out[out.length - 1] = { x, y, w: Math.max(last.x + last.w, r.x + r.w) - x, h: Math.max(last.y + last.h, r.y + r.h) - y }
    } else out.push({ ...r })
  }
  return out
}

const pageOf = (node: Node | null): HTMLElement | null => (node instanceof Element ? node : node?.parentElement ?? null)?.closest<HTMLElement>('[data-page]') ?? null

/**
 * What is selected inside the PDF column, or null. A selection over several pages is taken as its first page's part for the place,
 * with all of the text.
 */
export function readSelection(root: HTMLElement | null, sourceId: string, edits: Record<string, PageEdit>): PdfSelection | null {
  const sel = typeof window === 'undefined' ? null : window.getSelection()
  if (!root || !sel || sel.isCollapsed || !sel.rangeCount) return null
  const range = sel.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) return null
  const text = sel.toString()
  if (!text.trim()) return null
  const el = pageOf(range.startContainer)
  const page = Number(el?.dataset.page)
  if (!el || !page) return null
  const box = el.getBoundingClientRect()
  if (box.width < 1 || box.height < 1) return null
  const rects: Rect[] = []
  for (const r of Array.from(range.getClientRects())) {
    const x0 = clamp01((r.left - box.left) / box.width)
    const y0 = clamp01((r.top - box.top) / box.height)
    const x1 = clamp01((r.right - box.left) / box.width)
    const y1 = clamp01((r.bottom - box.top) / box.height)
    if (x1 - x0 > 0.001 && y1 - y0 > 0.001) rects.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 })
  }
  const shown = unionRect(rects)
  if (!shown) return null
  const turn = (edits[editKey(sourceId, page)] ?? NO_EDIT).rotation
  return { sourceId, page, rect: rectFromShown(shown, turn), rects: lines(rects).map((r) => rectFromShown(r, turn)), text }
}
