/**
 * Two-page view: the maths of "pages of one PDF side by side, like an open book". Pure functions (no screen), so they can be tested.
 *
 * A "row" is what the viewer shows in one step: a single page, or a spread of two. Rows are lists of page numbers in reading order; the
 * visual order (left to right) comes from `slotsOf`, which also puts a lone page (the cover, or the last page of an odd book) on the
 * correct side with an empty half beside it.
 */

/** Two pages side by side need a pane at least this wide (the person chose it). Narrower, one page is shown and the menu says why. */
export const TWO_MIN_PANE = 480
/** The space between the two pages of a spread, in CSS pixels. */
export const SPREAD_GAP = 4

export const twoAllowed = (paneWidth: number) => paneWidth >= TWO_MIN_PANE

/** The sentence the View menu shows when Two pages was chosen but the pane is too narrow for it (null when there is nothing to say). */
export function twoNote(chosen: boolean, paneWidth: number): string | null {
  if (!chosen || twoAllowed(paneWidth)) return null
  return `Two pages need a pane at least ${TWO_MIN_PANE} px wide (this one is ${Math.round(paneWidth)} px), so one page is shown. Make the panel wider and the two pages come back.`
}

/** Groups page numbers into rows. With `cover`, the first page is alone and the pairs start at the second. */
export function buildRows(pages: readonly number[], two: boolean, cover: boolean): number[][] {
  if (!two) return pages.map((n) => [n])
  const rows: number[][] = []
  let i = 0
  if (cover && pages.length) {
    rows.push([pages[0] as number])
    i = 1
  }
  for (; i < pages.length; i += 2) rows.push(pages.slice(i, i + 2))
  return rows
}

/** What is in each half of a row, left to right (null = empty). One page per row when two pages are off. */
export function slotsOf(row: readonly number[], index: number, two: boolean, cover: boolean, rtl: boolean): (number | null)[] {
  if (!two) return [row[0] ?? null]
  if (row.length >= 2) return rtl ? [row[1] as number, row[0] as number] : [row[0] as number, row[1] as number]
  // A lone page: the cover sits on the right (on the left when reading right to left); the last page of an odd book on the other side.
  const isCover = cover && index === 0
  const onRight = rtl ? !isCover : isCover
  return onRight ? [null, row[0] ?? null] : [row[0] ?? null, null]
}

/** The row that holds page `n`, or -1 (the page is hidden or does not exist). */
export const rowIndexOf = (rows: readonly (readonly number[])[], n: number) => rows.findIndex((r) => r.includes(n))

/** The row to show for page `n`: the one that holds it, or the last one that starts before it. */
export function nearestRow(rows: readonly (readonly number[])[], n: number): number {
  const exact = rowIndexOf(rows, n)
  if (exact >= 0) return exact
  let best = 0
  rows.forEach((r, i) => {
    if ((r[0] as number) <= n) best = i
  })
  return best
}

export interface PageShape {
  /** The page as it is shown (turned), in points. */
  w: number
  h: number
}

export interface RowShape {
  /** The common height of the row, in points (the tallest page). */
  h: number
  /** For each half, how much its page is scaled so that all heights match (1 = its own size). 1 for an empty half. */
  factors: number[]
  /** Each half's width at the common height, in points (an empty half is as wide as its partner). */
  widths: number[]
  /** The width of the whole row, in points. */
  w: number
}

/** Pages of different sizes are scaled to a common height; an empty half is as wide as the page beside it. */
export function rowShape(shapes: readonly (PageShape | null)[]): RowShape {
  const present = shapes.filter((s): s is PageShape => !!s && s.h > 0)
  const h = present.reduce((m, s) => Math.max(m, s.h), 0) || 1
  const factors = shapes.map((s) => (s && s.h > 0 ? h / s.h : 1))
  const widths = shapes.map((s, i) => (s && s.h > 0 ? s.w * (factors[i] as number) : 0))
  const filled = widths.filter((w) => w > 0)
  const blank = filled.length ? Math.max(...filled) : 0
  const full = widths.map((w) => (w > 0 ? w : blank))
  return { h, factors, widths: full, w: full.reduce((a, b) => a + b, 0) }
}

/**
 * The scale (CSS pixels per point) that fits the first row: its whole width (both pages of a spread), or the whole row in the pane.
 * `gutter` is the space at each side and `above` the space above and below.
 */
export function fitScale(shape: RowShape, kind: 'width' | 'page', paneW: number, paneH: number, gutter: number, above: number): number {
  const gap = shape.widths.length === 2 ? SPREAD_GAP : 0
  const byWidth = Math.max(1, paneW - gutter * 2 - gap) / Math.max(1, shape.w)
  if (kind === 'width') return byWidth
  const byHeight = Math.max(1, paneH - above * 2) / Math.max(1, shape.h)
  return Math.min(byWidth, byHeight)
}
