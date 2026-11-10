import { describe, expect, it } from 'vitest'
import { buildRows, fitScale, nearestRow, rowIndexOf, rowShape, slotsOf, SPREAD_GAP, TWO_MIN_PANE, twoAllowed, twoNote } from './spreads'
import { loadWorkspace, saveWorkspace, setView, type Workspace } from './workspace'

const pages = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

describe('Two-page view: which pages sit together', () => {
  it('Single page: one page per row', () => {
    expect(buildRows(pages(4), false, false)).toEqual([[1], [2], [3], [4]])
    expect(buildRows(pages(4), false, true)).toEqual([[1], [2], [3], [4]]) // a cover means nothing in Single-page view
  })

  it('cover off: 1-2, 3-4, ... and a lone last page', () => {
    expect(buildRows(pages(5), true, false)).toEqual([[1, 2], [3, 4], [5]])
    expect(buildRows(pages(4), true, false)).toEqual([[1, 2], [3, 4]])
  })

  it('cover on: page 1 alone, then 2-3, 4-5, ...', () => {
    expect(buildRows(pages(6), true, true)).toEqual([[1], [2, 3], [4, 5], [6]])
    expect(buildRows(pages(5), true, true)).toEqual([[1], [2, 3], [4, 5]])
    expect(buildRows(pages(1), true, true)).toEqual([[1]])
    expect(buildRows([], true, true)).toEqual([])
  })

  it('hidden pages are left out by the caller, and the pairs close up around them', () => {
    expect(buildRows([1, 2, 4, 5], true, false)).toEqual([[1, 2], [4, 5]])
  })
})

describe('1-page flipping: every page starts a spread', () => {
  it('without a cover: 1-2, 2-3, 3-4 ...', () => {
    expect(buildRows(pages(4), true, false, true)).toEqual([[1, 2], [2, 3], [3, 4]])
    expect(buildRows(pages(1), true, false, true)).toEqual([[1]])
    expect(buildRows(pages(2), true, false, true)).toEqual([[1, 2]])
  })

  it('with the first page alone: 1, 2-3, 3-4 ...', () => {
    expect(buildRows(pages(5), true, true, true)).toEqual([[1], [2, 3], [3, 4], [4, 5]])
    expect(buildRows(pages(2), true, true, true)).toEqual([[1], [2]])
    expect(buildRows(pages(1), true, true, true)).toEqual([[1]])
  })

  it('does nothing in Single-page view', () => {
    expect(buildRows(pages(3), false, false, true)).toEqual([[1], [2], [3]])
  })

  it('the spread that starts with a page is the one shown for it', () => {
    const rows = buildRows(pages(5), true, false, true)
    expect(rowIndexOf(rows, 3)).toBe(2) // 3-4, not 2-3
    expect(nearestRow(rows, 3)).toBe(2)
    expect(rowIndexOf(rows, 5)).toBe(3) // the last spread, which only has it second
    // Without flipping nothing changes: page 2 is in 1-2, page 3 starts 3-4.
    const plain = buildRows(pages(5), true, false)
    expect(rowIndexOf(plain, 2)).toBe(0)
    expect(rowIndexOf(plain, 3)).toBe(1)
  })
})

describe('Two-page view: left and right', () => {
  it('a pair: first page on the left; right to left swaps them', () => {
    expect(slotsOf([3, 4], 1, true, false, false)).toEqual([3, 4])
    expect(slotsOf([3, 4], 1, true, false, true)).toEqual([4, 3])
  })

  it('the cover is alone on the right (on the left when reading right to left)', () => {
    expect(slotsOf([1], 0, true, true, false)).toEqual([null, 1])
    expect(slotsOf([1], 0, true, true, true)).toEqual([1, null])
  })

  it('the last page of an odd book is alone on the first side', () => {
    expect(slotsOf([5], 2, true, false, false)).toEqual([5, null])
    expect(slotsOf([5], 2, true, false, true)).toEqual([null, 5])
  })

  it('Single-page view: just the page', () => {
    expect(slotsOf([7], 6, false, true, true)).toEqual([7])
  })

  it('finds the row of a page, and the nearest row when the page is hidden', () => {
    const rows = buildRows([1, 2, 4, 5], true, false) // 3 is hidden
    expect(rowIndexOf(rows, 4)).toBe(1)
    expect(rowIndexOf(rows, 3)).toBe(-1)
    expect(nearestRow(rows, 3)).toBe(0)
    expect(nearestRow(rows, 99)).toBe(1)
    expect(nearestRow([], 3)).toBe(0)
  })
})

describe('Two-page view: pages of different sizes', () => {
  it('scales both pages to the taller one, so the heights match', () => {
    const s = rowShape([{ w: 595, h: 842 }, { w: 842, h: 595 }]) // portrait and landscape A4
    expect(s.h).toBe(842)
    expect(s.factors[0]).toBe(1)
    expect(s.factors[1]).toBeCloseTo(842 / 595)
    expect(s.widths[1]).toBeCloseTo(842 * (842 / 595))
    expect(s.w).toBeCloseTo((s.widths[0] as number) + (s.widths[1] as number))
  })

  it('an empty half is as wide as the page beside it (a lone cover keeps its place)', () => {
    const s = rowShape([null, { w: 595, h: 842 }])
    expect(s.widths).toEqual([595, 595])
    expect(s.w).toBe(1190)
  })

  it('Fit width fits both pages of a spread; Fit page also fits the height', () => {
    const s = rowShape([{ w: 600, h: 800 }, { w: 600, h: 800 }])
    const byWidth = fitScale(s, 'width', 1000, 600, 12, 14)
    expect(byWidth).toBeCloseTo((1000 - 24 - SPREAD_GAP) / 1200)
    const byPage = fitScale(s, 'page', 1000, 600, 12, 14)
    expect(byPage).toBeCloseTo((600 - 28) / 800)
    expect(byPage).toBeLessThan(byWidth)
    // A tall pane: the width is what limits it.
    expect(fitScale(s, 'page', 1000, 5000, 12, 14)).toBeCloseTo(byWidth)
  })

  it('Fit height fills the pane height whatever the width', () => {
    const s = rowShape([{ w: 600, h: 800 }, { w: 600, h: 800 }])
    expect(fitScale(s, 'height', 1000, 600, 12, 14)).toBeCloseTo((600 - 28) / 800)
    expect(fitScale(s, 'height', 300, 600, 12, 14)).toBeCloseTo((600 - 28) / 800) // may be wider than the pane: it scrolls sideways
  })

  it('a single page fits as it always did: the pane minus the gutters', () => {
    const s = rowShape([{ w: 600, h: 800 }])
    expect(fitScale(s, 'width', 800, 600, 12, 14)).toBeCloseTo((800 - 24) / 600)
  })
})

describe('Two-page view: how narrow a pane can be', () => {
  it('honours a chosen Two pages down to 480 px', () => {
    expect(TWO_MIN_PANE).toBe(480)
    expect(twoAllowed(480)).toBe(true)
    expect(twoAllowed(479)).toBe(false)
    expect(twoNote(true, 700)).toBeNull()
    expect(twoNote(false, 300)).toBeNull() // not chosen: nothing to explain
  })

  it('below 480 px it says why one page is shown', () => {
    const note = twoNote(true, 412)
    expect(note).toContain('480')
    expect(note).toContain('412')
  })
})

describe('the layout is remembered per PDF and per device', () => {
  const base: Workspace = { sourceId: 'a', other: null, activeSide: 'left', tabs: ['a', 'b'], views: {}, ratio: 0.5, sync: false, page: 1, zoom: null }
  const store = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
  }

  it('saves and brings back each PDF\'s own choices', () => {
    let w = setView(base, 'a', { two: true, cover: true, paged: true, rtl: true, fit: 'page' })
    w = setView(w, 'b', { two: true })
    const s = store()
    saveWorkspace('f1', w, s)
    const back = loadWorkspace('f1', new Set(['a', 'b']), s)
    expect(back?.views?.a).toMatchObject({ two: true, cover: true, paged: true, rtl: true, fit: 'page' })
    expect(back?.views?.b).toMatchObject({ two: true })
    expect(back?.views?.b?.cover).toBeUndefined()
  })

  it('a save from before this feature loads as one page, scrolling, fit width', () => {
    const s = store()
    s.setItem('wishtaamaps:pdf-workspace:f1', JSON.stringify({ v: 1, tabs: ['a'], active: 'a', other: null, side: 'left', ratio: 0.5, sync: false, views: { a: { page: 4, zoom: 1.5 } } }))
    const back = loadWorkspace('f1', new Set(['a']), s)
    expect(back?.views?.a).toEqual({ page: 4, zoom: 1.5 })
  })

  it('saves the document colour and 1-page flipping per PDF, and a save from before loads unchanged', () => {
    let w = setView(base, 'a', { color: 'sepia', flip1: true, two: true })
    w = setView(w, 'b', { color: 'light' })
    const s = store()
    saveWorkspace('f1', w, s)
    const back = loadWorkspace('f1', new Set(['a', 'b']), s)
    expect(back?.views?.a).toMatchObject({ color: 'sepia', flip1: true, two: true })
    expect(back?.views?.b?.color).toBeUndefined() // Light is what no choice means
    s.setItem('wishtaamaps:pdf-workspace:f2', JSON.stringify({ v: 1, tabs: ['a'], active: 'a', other: null, side: 'left', ratio: 0.5, sync: false, views: { a: { page: 2, zoom: null, color: 'purple', flip1: 3 } } }))
    expect(loadWorkspace('f2', new Set(['a']), s)?.views?.a).toEqual({ page: 2, zoom: null })
  })

  it('ignores values that are not what they should be', () => {
    const s = store()
    s.setItem('wishtaamaps:pdf-workspace:f1', JSON.stringify({ v: 1, tabs: ['a'], active: 'a', other: null, side: 'left', ratio: 0.5, sync: false, views: { a: { page: 1, zoom: null, two: 'yes', cover: 1, paged: null, fit: 'huge' } } }))
    expect(loadWorkspace('f1', new Set(['a']), s)?.views?.a).toEqual({ page: 1, zoom: null })
  })
})
