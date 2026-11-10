import type { Rect } from './types'

/** A piece of text from a PDF page, in the page's own units (points), top left origin, as the page is read. */
export interface Run {
  str: string
  x: number
  y: number
  w: number
  /** Height of the text (its font size). */
  h: number
}

export interface Line {
  text: string
  /** The line's box, in the same units as the runs. */
  x: number
  y: number
  w: number
  h: number
}

/** Groups pieces of text that sit on the same baseline into lines, top to bottom, left to right. */
export function groupLines(runs: readonly Run[]): Line[] {
  const items = runs.filter((r) => r.str.trim() !== '' || r.w > 0).sort((a, b) => a.y - b.y || a.x - b.x)
  const rows: Run[][] = []
  for (const r of items) {
    const row = rows.find((row) => {
      const ref = row[0] as Run
      return Math.abs(ref.y - r.y) < Math.max(ref.h, r.h) * 0.5
    })
    if (row) row.push(r)
    else rows.push([r])
  }
  rows.sort((a, b) => (a[0] as Run).y - (b[0] as Run).y)
  const out: Line[] = []
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x)
    let text = ''
    let prevEnd = -Infinity
    for (const r of row) {
      const gap = r.x - prevEnd
      if (text && gap > r.h * 0.18 && !text.endsWith(' ') && !r.str.startsWith(' ')) text += ' '
      text += r.str
      prevEnd = r.x + r.w
    }
    text = text.replace(/\s+/g, ' ').trim()
    if (!text) continue
    const x0 = Math.min(...row.map((r) => r.x))
    const y0 = Math.min(...row.map((r) => r.y))
    const x1 = Math.max(...row.map((r) => r.x + r.w))
    out.push({ text, x: x0, y: y0, w: x1 - x0, h: Math.max(...row.map((r) => r.h)) })
  }
  return out
}

/** Joins a word split across two lines by a hyphen ("inter-" and "national" make "international"), and drops soft hyphens. */
export function joinHyphenation(text: string): string {
  return text.replace(/­/g, '').replace(/(\p{L})-[ \t]*\r?\n[ \t]*(\p{Ll})/gu, '$1$2')
}

export interface CleanOptions {
  /** One topic per line instead of one topic for the whole selection. */
  perLine?: boolean
}

/** What to make topics from, for some selected text: one text, or one per line; hyphenation joined, spaces and line breaks tidied. */
export function topicTexts(selected: string, opts: CleanOptions = {}): string[] {
  const text = joinHyphenation(selected.replace(/\r\n?/g, '\n'))
  if (opts.perLine) return text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const one = text.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim()
  return one ? [one] : []
}

export interface Heading {
  title: string
  /** 1 is the biggest. */
  level: number
  page: number
  rect: Rect | null
}

export interface PageLines {
  page: number
  /** The page's width and height in the same units as the lines. */
  w: number
  h: number
  lines: Line[]
}

/**
 * Guesses the headings of a document from the size of its text: the commonest size is the body text; lines clearly bigger are
 * headings, and the bigger the higher the level. This is only a SUGGESTION shown for editing, never applied by itself.
 */
export function detectHeadings(pages: readonly PageLines[], opts: { max?: number; levels?: number } = {}): Heading[] {
  const max = opts.max ?? 500
  const levels = opts.levels ?? 4
  const weight = new Map<number, number>()
  for (const p of pages) for (const l of p.lines) weight.set(Math.round(l.h * 2) / 2, (weight.get(Math.round(l.h * 2) / 2) ?? 0) + l.text.length)
  if (!weight.size) return []
  const body = [...weight].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
  if (!body) return []
  const big = (h: number) => h >= body * 1.15
  const sizes = [...new Set(pages.flatMap((p) => p.lines.filter((l) => big(l.h)).map((l) => Math.round(l.h * 2) / 2)))].sort((a, b) => b - a)
  const levelOf = (h: number) => Math.min(levels, sizes.indexOf(Math.round(h * 2) / 2) + 1)
  const out: Heading[] = []
  for (const p of pages) {
    let prev: { h: number; heading: Heading; bottom: number } | null = null
    for (const l of p.lines) {
      const plain = /^[\d\s.,:;()\-–—/\\|]+$/.test(l.text) // a page number or a lone figure
      if (!big(l.h) || plain || l.text.length > 140 || l.text.length < 2) {
        prev = null
        continue
      }
      const rect: Rect = { x: l.x / p.w, y: l.y / p.h, w: l.w / p.w, h: l.h / p.h }
      // A title that wraps onto a second line of the same size is one heading.
      if (prev && Math.abs(prev.h - l.h) < 0.5 && l.y - prev.bottom < l.h * 0.8) {
        prev.heading.title = `${prev.heading.title} ${l.text}`.slice(0, 200)
        prev.heading.rect = prev.heading.rect ? { x: Math.min(prev.heading.rect.x, rect.x), y: prev.heading.rect.y, w: Math.max(prev.heading.rect.w, rect.w), h: rect.y + rect.h - prev.heading.rect.y } : rect
        prev.bottom = l.y + l.h
        continue
      }
      const heading: Heading = { title: l.text, level: levelOf(l.h), page: p.page, rect }
      out.push(heading)
      prev = { h: l.h, heading, bottom: l.y + l.h }
      if (out.length >= max) return out
    }
  }
  return out
}

export interface BookmarkNode {
  title: string
  /** 1-based page, or null when the bookmark does not point at a page. */
  page: number | null
  children: BookmarkNode[]
}

export interface FlatBookmark {
  title: string
  level: number
  page: number | null
}

/** A bookmark tree as a flat list in reading order, with its depth. Empty titles are skipped; the size and depth are limited. */
export function flattenBookmarks(tree: readonly BookmarkNode[], opts: { maxLevel?: number; max?: number } = {}): FlatBookmark[] {
  const maxLevel = opts.maxLevel ?? 6
  const max = opts.max ?? 2000
  const out: FlatBookmark[] = []
  const walk = (nodes: readonly BookmarkNode[], level: number) => {
    for (const n of nodes) {
      if (out.length >= max) return
      const title = n.title.replace(/\s+/g, ' ').trim()
      if (title) out.push({ title: title.slice(0, 200), level: Math.min(level, maxLevel), page: n.page })
      if (level < maxLevel) walk(n.children, level + 1)
    }
  }
  walk(tree, 1)
  return out
}

/**
 * The text that lies inside a rectangle of a page (fractions of the page as it is read): every line whose middle is inside the
 * rectangle and at least half of whose width is, joined, with hyphenated line breaks mended. Empty when there is none (a scan).
 */
export function textInRect(page: PageLines, rect: { x: number; y: number; w: number; h: number }, max = 200): string {
  if (!page.w || !page.h) return ''
  const hit = page.lines.filter((l) => {
    const midY = (l.y + l.h / 2) / page.h
    if (midY < rect.y || midY > rect.y + rect.h) return false
    const left = Math.max(l.x / page.w, rect.x)
    const right = Math.min((l.x + l.w) / page.w, rect.x + rect.w)
    return l.w > 0 && (right - left) * page.w >= l.w * 0.5
  })
  if (!hit.length) return ''
  const joined = topicTexts(hit.map((l) => l.text).join('\n'))[0] ?? ''
  return joined.length > max ? `${joined.slice(0, max - 1).trimEnd()}…` : joined
}
