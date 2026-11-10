import { describe, expect, it } from 'vitest'
import * as W from './workspace'

const empty = (): W.Workspace => ({ sourceId: null, other: null, activeSide: 'left', tabs: [], views: {}, ratio: 0.5, sync: false, page: 1, zoom: null })
const open = (...ids: string[]) => ids.reduce((w, id) => W.activate(w, id), empty())

describe('tabs keep each PDF\'s own page and zoom', () => {
  it('opening a PDF adds a tab and shows it; switching keeps every PDF where it was left', () => {
    let w = open('a', 'b', 'c')
    expect(w.tabs).toEqual(['a', 'b', 'c'])
    expect(w.sourceId).toBe('c')
    w = W.setView(w, 'c', { page: 40, zoom: 1.5 })
    w = W.activate(w, 'a')
    w = W.setView(w, 'a', { page: 3, zoom: null })
    expect([w.page, w.zoom]).toEqual([3, null])
    w = W.activate(w, 'c')
    expect([w.page, w.zoom]).toEqual([40, 1.5])
    w = W.activate(w, 'b')
    expect([w.page, w.zoom]).toEqual([1, null]) // never opened beyond page 1
    expect(w.views.a).toMatchObject({ page: 3 })
  })

  it('closing a tab leaves the others as they were and moves to a neighbour', () => {
    let w = open('a', 'b', 'c')
    w = W.setView(W.activate(w, 'b'), 'b', { page: 9 })
    w = W.closeTab(w, 'b')
    expect(w.tabs).toEqual(['a', 'c'])
    expect(w.sourceId).toBe('c')
    w = W.closeTab(W.closeTab(w, 'c'), 'a')
    expect(w.sourceId).toBeNull()
    expect(w.tabs).toEqual([])
  })

  it('reorders tabs', () => {
    let w = open('a', 'b', 'c')
    w = W.reorder(w, 'c', 0)
    expect(w.tabs).toEqual(['c', 'a', 'b'])
    w = W.reorder(w, 'c', 2)
    expect(w.tabs).toEqual(['a', 'b', 'c'])
  })
})

describe('split view', () => {
  it('a tab dropped on a half opens there, the PDF that was showing takes the other half, and the dropped one is active', () => {
    let w = open('a', 'b')
    w = W.splitWith(w, 'a', 'left')
    expect([w.sourceId, w.other, w.activeSide]).toEqual(['a', 'b', 'left'])
    w = W.splitWith(open('a', 'b'), 'a', 'right')
    expect([w.sourceId, w.other, w.activeSide]).toEqual(['a', 'b', 'right'])
  })

  it('each pane keeps its own page and zoom, and clicking the other pane makes it active without moving either', () => {
    let w = W.splitWith(open('a', 'b'), 'a', 'left') // a on the left (active), b on the right
    w = W.setView(w, 'a', { page: 5, zoom: 2 })
    w = W.setView(w, 'b', { page: 12, zoom: null })
    expect([w.page, w.zoom]).toEqual([5, 2]) // the active pane's
    w = W.activate(w, 'b')
    expect([w.sourceId, w.other, w.activeSide]).toEqual(['b', 'a', 'right']) // positions did not change
    expect([w.page, w.zoom]).toEqual([12, null])
    expect(w.views.a).toMatchObject({ page: 5, zoom: 2 })
  })

  it('a split needs two different PDFs', () => {
    const w = W.splitWith(open('a'), 'a', 'right')
    expect(w.other).toBeNull()
  })

  it('a third PDF dropped on a half replaces that pane\'s PDF only', () => {
    let w = W.splitWith(open('a', 'b', 'c'), 'b', 'left') // b | c? (c was active so it stays)
    expect([w.sourceId, w.other]).toEqual(['b', 'c'])
    w = W.splitWith(w, 'a', 'right') // a on the right, the active b stays on the left
    expect([w.sourceId, w.other, w.activeSide]).toEqual(['a', 'b', 'right'])
    expect(w.tabs).toEqual(['a', 'b', 'c'])
  })

  it('merging keeps one PDF and the other keeps its view in its tab', () => {
    let w = W.splitWith(open('a', 'b'), 'a', 'left')
    w = W.setView(w, 'b', { page: 7 })
    w = W.unsplit(w, 'b')
    expect([w.sourceId, w.other]).toEqual(['b', null])
    expect(w.page).toBe(7)
    expect(w.tabs).toEqual(['a', 'b'])
  })

  it('closing one pane\'s tab leaves the other alone', () => {
    let w = W.splitWith(open('a', 'b'), 'a', 'left')
    w = W.closeTab(w, 'a')
    expect([w.sourceId, w.other]).toEqual(['b', null])
    w = W.splitWith(open('a', 'b'), 'a', 'left')
    w = W.closeTab(w, 'b')
    expect([w.sourceId, w.other]).toEqual(['a', null])
  })
})

describe('remembered per map and per device', () => {
  const memory = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
  }

  it('saves tabs, order, split, and where each PDF was left, and restores them', () => {
    const store = memory()
    let w = W.splitWith(open('a', 'b', 'c'), 'b', 'right')
    w = W.setView(W.setView(w, 'b', { page: 8, zoom: 1.25, anchor: { n: 8, frac: 0.4 } }), 'c', { page: 2 })
    w = { ...w, ratio: 0.6, sync: true }
    W.saveWorkspace('map-1', w, store)
    const back = W.loadWorkspace('map-1', new Set(['a', 'b', 'c']), store)
    expect(back).toMatchObject({ tabs: ['a', 'b', 'c'], sourceId: 'b', other: 'c', activeSide: 'right', ratio: 0.6, sync: true })
    expect(back?.views?.b).toEqual({ page: 8, zoom: 1.25, anchor: { n: 8, frac: 0.4 } })
    expect(back?.page).toBe(8)
    expect(W.loadWorkspace('map-2', new Set(['a']), store)).toBeNull() // another map has its own
  })

  it('forgets PDFs the map no longer has, and survives damaged data', () => {
    const store = memory()
    W.saveWorkspace('m', W.splitWith(open('a', 'b'), 'a', 'left'), store)
    const back = W.loadWorkspace('m', new Set(['a']), store)
    expect(back).toMatchObject({ tabs: ['a'], sourceId: 'a', other: null })
    store.setItem('wishtaamaps:pdf-workspace:bad', '{not json')
    expect(W.loadWorkspace('bad', new Set(['a']), store)).toBeNull()
    store.setItem('wishtaamaps:pdf-workspace:odd', JSON.stringify({ v: 1, tabs: ['a', 5], active: 'a', views: { a: { page: -4, zoom: 99 } }, ratio: 7 }))
    const odd = W.loadWorkspace('odd', new Set(['a']), store)
    expect(odd?.views?.a).toEqual({ page: 1, zoom: 4 })
    expect(odd?.ratio).toBe(0.8)
  })
})
