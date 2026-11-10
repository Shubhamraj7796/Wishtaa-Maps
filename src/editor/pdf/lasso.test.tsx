// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import type { PdfHandle } from '@/core/pdf/engine'
import type { MarkupObject, PdfSource, Point } from '@/core/pdf/types'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { enterReadMode } from '../readmode'
import { forgetStylus } from '../markup/layers'
import { closeFile, mapDoc, openFile } from '../session'
import { useEditor } from '../store'
import { setLasso, setPdfTool } from './actions'
import { clampMove, copyOf, lassoPick, moved, pointInLoop, selectionBounds, withMove } from './lasso'
import { PageLayers } from './layers'
import { addMarkup, deleteManyMarkup } from './markup'
import { forgetPen } from './penPrefs'

let t = 1_700_000_000_000
const st = () => useEditor.getState()
const undoSteps = () => mapDoc.undo.undoStack.length
const source: PdfSource = { id: 's1', name: 'a.pdf', size: 10, hash: 'h', pages: 10, addedAt: 1 }
const box = { w: 600, h: 800, scale: 1, rotation: 0 as const }
const handle = {} as PdfHandle
const one = (id: string) => st().pdf.markup[id] as MarkupObject
const all = () => Object.values(st().pdf.markup) as MarkupObject[]

const mk = (over: Partial<MarkupObject> & { id: string }): MarkupObject => ({ sourceId: 's1', page: 1, kind: 'rect', color: '#ef4444', rects: [{ x: 0.2, y: 0.2, w: 0.2, h: 0.1 }], createdAt: 1, ...over })
const square = (x0: number, y0: number, x1: number, y1: number): Point[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0 + 0.001]]

describe('lasso: the maths', () => {
  it('knows whether a point is inside a loop', () => {
    const loop = square(0.1, 0.1, 0.5, 0.5)
    expect(pointInLoop([0.3, 0.3], loop)).toBe(true)
    expect(pointInLoop([0.6, 0.3], loop)).toBe(false)
    expect(pointInLoop([0.3, 0.05], loop)).toBe(false)
  })

  it('picks the markup whose middle is inside, or most of which is inside; leaves the rest and links', () => {
    const a = mk({ id: 'a', rects: [{ x: 0.2, y: 0.2, w: 0.1, h: 0.1 }] }) // inside
    const b = mk({ id: 'b', rects: [{ x: 0.7, y: 0.7, w: 0.1, h: 0.1 }] }) // outside
    const c = mk({ id: 'c', rects: [{ x: 0.45, y: 0.2, w: 0.2, h: 0.1 }] }) // half in: middle at 0.55 is outside, 25% in
    const d = mk({ id: 'd', kind: 'pen', rects: undefined, points: [[0.15, 0.15], [0.25, 0.3], [0.4, 0.2]] }) // a pen stroke inside
    const link = mk({ id: 'l', kind: 'link', rects: [{ x: 0.2, y: 0.2, w: 0.1, h: 0.1 }] })
    expect(lassoPick([a, b, c, d, link], square(0.1, 0.1, 0.5, 0.5)).sort()).toEqual(['a', 'd'])
  })

  it('a tap or a thin scribble catches nothing', () => {
    const a = mk({ id: 'a' })
    expect(lassoPick([a], [[0.3, 0.3], [0.3, 0.3], [0.3, 0.3], [0.3, 0.3]])).toEqual([])
    expect(lassoPick([a], [[0.1, 0.25], [0.5, 0.25], [0.1, 0.25], [0.5, 0.25]])).toEqual([])
  })

  it('a thin line (a flat stroke) can still be caught', () => {
    const flat = mk({ id: 'f', kind: 'line', rects: undefined, points: [[0.2, 0.3], [0.4, 0.3]] })
    expect(lassoPick([flat], square(0.1, 0.2, 0.5, 0.4))).toEqual(['f'])
  })

  it('the box round the chosen markup, and a move and resize of it', () => {
    const a = mk({ id: 'a', rects: [{ x: 0.1, y: 0.1, w: 0.1, h: 0.1 }] })
    const b = mk({ id: 'b', kind: 'pen', rects: undefined, points: [[0.5, 0.4], [0.6, 0.5]] })
    expect(selectionBounds([a, b], ['a', 'b'])).toEqual({ x: 0.1, y: 0.1, w: 0.5, h: 0.4 })
    expect(selectionBounds([a, b], [])).toBeNull()
    const shifted = moved(a, { dx: 0.1, dy: 0.05, s: 1, ox: 0, oy: 0 }).rects?.[0] as { x: number; y: number; w: number; h: number }
    expect(shifted.x).toBeCloseTo(0.2)
    expect(shifted.y).toBeCloseTo(0.15)
    expect(shifted.w).toBeCloseTo(0.1)
    // Doubling about the top left corner of the box: x and y double their distance from it, widths double.
    const big = moved(a, { dx: 0, dy: 0, s: 2, ox: 0.1, oy: 0.1 }).rects?.[0] as { x: number; y: number; w: number; h: number }
    expect(big.x).toBeCloseTo(0.1)
    expect(big.w).toBeCloseTo(0.2)
    const stroke = moved(b, { dx: 0, dy: 0, s: 0.5, ox: 0.5, oy: 0.4 }).points as Point[]
    expect(stroke[1]).toEqual([0.55, 0.45])
  })

  it('a text box grows its letters with it; the rest of the markup is left as it was', () => {
    const text = mk({ id: 'x', kind: 'text', text: 'Hi', fontSize: 0.02, color: '#111827' })
    expect(moved(text, { dx: 0, dy: 0, s: 2, ox: 0.2, oy: 0.2 }).fontSize).toBeCloseTo(0.04)
    expect(Object.keys(moved(text, { dx: 0.1, dy: 0, s: 1, ox: 0, oy: 0 }))).not.toContain('color')
  })

  it('withMove shows a drag without touching the list it was given', () => {
    const a = mk({ id: 'a' })
    const list = [a, mk({ id: 'b' })]
    const shown = withMove(list, ['a'], { dx: 0.1, dy: 0, s: 1, ox: 0, oy: 0 })
    expect(shown[0]?.rects?.[0]?.x).toBeCloseTo(0.3)
    expect(shown[1]).toBe(list[1])
    expect(a.rects?.[0]?.x).toBe(0.2)
  })

  it('a move stays inside the page', () => {
    const b = { x: 0.7, y: 0.7, w: 0.2, h: 0.2 }
    const m = clampMove(b, { dx: 0.5, dy: 0.5, s: 1, ox: 0, oy: 0 })
    expect(0.7 + m.dx + 0.2).toBeCloseTo(1)
    expect(0.7 + m.dy + 0.2).toBeCloseTo(1)
    const back = clampMove({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, { dx: -0.5, dy: -0.5, s: 1, ox: 0, oy: 0 })
    expect(back.dx).toBeCloseTo(-0.1)
    expect(back.dy).toBeCloseTo(-0.1)
  })

  it('a copy is the same piece a little to one side, without the topic the original made', () => {
    const a = mk({ id: 'a', topicId: 'topic1', note: 'n' })
    const c = copyOf(a, 0.025, 0.02) as Record<string, unknown>
    expect(c).not.toHaveProperty('id')
    expect(c).not.toHaveProperty('createdAt')
    expect(c).not.toHaveProperty('topicId')
    expect(c['note']).toBe('n')
    expect((c['rects'] as { x: number }[])[0]?.x).toBeCloseTo(0.225)
  })
})

describe('lasso: on the page', () => {
  beforeEach(async () => {
    installMemoryLocalStorage()
    forgetPen()
    forgetStylus()
    ;(Element.prototype as unknown as { setPointerCapture: () => void }).setPointerCapture = () => undefined
    const real = Element.prototype.getBoundingClientRect
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return this.hasAttribute('data-page') ? ({ left: 0, top: 0, right: 600, bottom: 800, width: 600, height: 800, x: 0, y: 0, toJSON: () => ({}) } as DOMRect) : real.call(this)
    })
    const repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
    const f = await repo.create({ type: 'map', name: 'Lasso', content: buildStarterContent('blank') })
    await openFile(f.id, repo)
    mapDoc.pdfSources.set('s1', source)
    mapDoc.undo.clear()
  })
  afterEach(async () => {
    cleanup()
    vi.restoreAllMocks()
    await closeFile()
  })

  const base = { sourceId: 's1', page: 1 }
  const add = () => {
    const a = addMarkup({ ...base, kind: 'rect', color: '#ef4444', rects: [{ x: 0.2, y: 0.2, w: 0.2, h: 0.1 }], width: 0.004 }) as string
    const b = addMarkup({ ...base, kind: 'pen', color: '#2563eb', points: [[0.25, 0.35], [0.3, 0.4], [0.38, 0.33]], width: 0.004 }) as string
    const far = addMarkup({ ...base, kind: 'rect', color: '#111827', rects: [{ x: 0.7, y: 0.7, w: 0.1, h: 0.1 }], width: 0.004 }) as string
    mapDoc.undo.clear()
    return { a, b, far }
  }
  const setup = (tool: 'lasso' | 'select' = 'lasso') => {
    act(() => useEditor.setState({ pdfPanel: { ...st().pdfPanel, tool } }))
    return render(
      <div data-page="1">
        <PageLayers source={source} handle={handle} n={1} box={box} lines={null} />
      </div>
    )
  }
  const ev = (x: number, y: number) => ({ clientX: x, clientY: y, pointerId: 1, button: 0, pointerType: 'mouse' })
  /** A loop (in pixels) drawn on the lasso layer. */
  const loop = (r: ReturnType<typeof render>, pts: [number, number][]) => {
    const el = r.container.querySelector('[data-lasso-layer]') as HTMLElement
    fireEvent.pointerDown(el, ev(pts[0]![0], pts[0]![1]))
    for (const p of pts.slice(1)) fireEvent.pointerMove(el, ev(p[0], p[1]))
    fireEvent.pointerUp(el, ev(0, 0))
  }
  const around = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0 + 3]]

  it('a loop picks the markup inside it and shows the chosen box and its bar', () => {
    const { a, b } = add()
    const r = setup()
    loop(r, around(80, 120, 300, 340))
    expect(st().pdfPanel.lasso).toEqual({ sourceId: 's1', page: 1, ids: expect.arrayContaining([a, b]) })
    expect(st().pdfPanel.lasso?.ids).toHaveLength(2)
    expect(r.container.querySelector('[data-lasso-box]')).toBeTruthy()
    expect(r.container.querySelector('[data-lasso-bar]')?.textContent).toContain('2 chosen')
  })

  it('a loop round nothing lets the picture go', () => {
    add()
    const r = setup()
    loop(r, around(80, 120, 300, 340))
    expect(st().pdfPanel.lasso).not.toBeNull()
    loop(r, around(450, 60, 560, 140))
    expect(st().pdfPanel.lasso).toBeNull()
    expect(r.container.querySelector('[data-lasso-box]')).toBeNull()
  })

  it('dragging the box moves everything chosen, as one undo step; the rest stays', () => {
    const { a, b, far } = add()
    const r = setup()
    loop(r, around(80, 120, 300, 340))
    const before = one(a).rects![0]!
    const farBefore = JSON.stringify(one(far))
    const steps = undoSteps()
    const boxEl = r.container.querySelector('[data-lasso-box]') as HTMLElement
    fireEvent.pointerDown(boxEl, ev(200, 200))
    fireEvent.pointerMove(window, ev(260, 230)) // 60 px right, 30 px down
    // While it is being dragged the page shows the result, but the map has not changed yet.
    expect(one(a).rects![0]!.x).toBeCloseTo(before.x, 6)
    fireEvent.pointerUp(window, ev(260, 230))
    expect(one(a).rects![0]!.x).toBeCloseTo(before.x + 60 / 600, 6)
    expect(one(a).rects![0]!.y).toBeCloseTo(before.y + 30 / 800, 6)
    expect((one(b).points![0] as Point)[0]).toBeCloseTo(0.25 + 60 / 600, 6)
    expect(JSON.stringify(one(far))).toBe(farBefore)
    expect(undoSteps()).toBe(steps + 1)
    mapDoc.undo.undo()
    expect(one(a).rects![0]!.x).toBeCloseTo(before.x, 6)
    expect((one(b).points![0] as Point)[0]).toBeCloseTo(0.25, 6)
  })

  it('a corner resizes everything together about the opposite corner, keeping the shape', () => {
    const { a } = add()
    const r = setup()
    loop(r, around(80, 120, 300, 340))
    const bounds = selectionBounds(all().filter((m) => m.id !== 'x'), st().pdfPanel.lasso!.ids)!
    const x1 = (bounds.x + bounds.w) * 600
    const y1 = (bounds.y + bounds.h) * 800
    const x0 = bounds.x * 600
    const y0 = bounds.y * 800
    const handleEl = r.container.querySelector('[data-lasso-handle="se"]') as HTMLElement
    fireEvent.pointerDown(handleEl, ev(x1, y1))
    // Pull the bottom right corner out so the box is twice as far from the top left corner.
    fireEvent.pointerMove(window, ev(x0 + (x1 - x0) * 2, y0 + (y1 - y0) * 2))
    fireEvent.pointerUp(window, ev(0, 0))
    const after = one(a).rects![0]!
    expect(after.w).toBeCloseTo(0.2 * 2, 4)
    expect(after.h).toBeCloseTo(0.1 * 2, 4)
    expect(after.x).toBeCloseTo(bounds.x + (0.2 - bounds.x) * 2, 4) // the top left corner of the box did not move
  })

  it('a move cannot take the markup off the page', () => {
    const { a } = add()
    const r = setup()
    loop(r, around(80, 120, 300, 340))
    const boxEl = r.container.querySelector('[data-lasso-box]') as HTMLElement
    fireEvent.pointerDown(boxEl, ev(200, 200))
    fireEvent.pointerMove(window, ev(-900, -900))
    fireEvent.pointerUp(window, ev(0, 0))
    expect(one(a).rects![0]!.x).toBeGreaterThanOrEqual(0)
    expect(one(a).rects![0]!.y).toBeGreaterThanOrEqual(0)
  })

  it('recolour changes the colour of everything chosen in one step', () => {
    const { a, b, far } = add()
    const r = setup()
    loop(r, around(80, 120, 300, 340))
    const steps = undoSteps()
    fireEvent.click(r.container.querySelector('[data-lasso-colour="#4ade80"]') as HTMLElement)
    expect(one(a).color).toBe('#4ade80')
    expect(one(b).color).toBe('#4ade80')
    expect(one(far).color).toBe('#111827')
    expect(undoSteps()).toBe(steps + 1)
  })

  it('copy adds a copy of each, a little to one side, chooses the copies, and is one undo step', () => {
    const { a, b } = add()
    const r = setup()
    loop(r, around(80, 120, 300, 340))
    const steps = undoSteps()
    fireEvent.click(r.container.querySelector('[data-lasso-copy]') as HTMLElement)
    expect(all()).toHaveLength(5)
    expect(undoSteps()).toBe(steps + 1)
    const chosen = st().pdfPanel.lasso!.ids
    expect(chosen).toHaveLength(2)
    expect(chosen).not.toContain(a)
    expect(chosen).not.toContain(b)
    expect(one(chosen.find((id) => one(id).kind === 'rect') as string).rects![0]!.x).toBeCloseTo(0.2 + 0.025, 6)
    mapDoc.undo.undo()
    expect(all()).toHaveLength(3)
  })

  it('delete removes everything chosen as one undo step, and clears the choice', () => {
    const { a, b, far } = add()
    const r = setup()
    loop(r, around(80, 120, 300, 340))
    const steps = undoSteps()
    fireEvent.click(r.container.querySelector('[data-lasso-delete]') as HTMLElement)
    expect(st().pdf.markup[a]).toBeUndefined()
    expect(st().pdf.markup[b]).toBeUndefined()
    expect(st().pdf.markup[far]).toBeDefined()
    expect(st().pdfPanel.lasso).toBeNull()
    expect(undoSteps()).toBe(steps + 1)
    mapDoc.undo.undo()
    expect(st().pdf.markup[a]).toBeDefined()
    expect(st().pdf.markup[b]).toBeDefined()
  })

  it('Done, and leaving the tool, let the choice go', () => {
    add()
    const r = setup()
    loop(r, around(80, 120, 300, 340))
    fireEvent.click(r.container.querySelector('[aria-label="Done"]') as HTMLElement)
    expect(st().pdfPanel.lasso).toBeNull()
    loop(r, around(80, 120, 300, 340))
    expect(st().pdfPanel.lasso).not.toBeNull()
    act(() => setPdfTool('select'))
    expect(st().pdfPanel.lasso).toBeNull()
  })

  it('other pages and other PDFs are not touched', () => {
    const other = addMarkup({ sourceId: 's1', page: 2, kind: 'rect', color: '#ef4444', rects: [{ x: 0.2, y: 0.2, w: 0.2, h: 0.1 }], width: 0.004 }) as string
    add()
    const r = setup()
    loop(r, around(80, 120, 300, 340))
    expect(st().pdfPanel.lasso?.ids).not.toContain(other)
    deleteManyMarkup(st().pdfPanel.lasso!.ids)
    expect(st().pdf.markup[other]).toBeDefined()
  })

  it('Read mode has no lasso (the tool is not drawn), but the markup still shows', async () => {
    add()
    const r = setup()
    expect(r.container.querySelector('[data-lasso-layer]')).toBeTruthy()
    await act(async () => void (await enterReadMode()))
    r.rerender(
      <div data-page="1">
        <PageLayers source={source} handle={handle} n={1} box={box} lines={null} />
      </div>
    )
    expect(r.container.querySelector('[data-lasso-layer]')).toBeNull()
    expect(r.container.querySelector('[data-lasso-selection]')).toBeNull()
    expect(r.container.querySelector('rect[data-markup]')).toBeTruthy()
  })

  it('does not move the markup in Read mode even if a selection was left', async () => {
    const { a } = add()
    setLasso({ sourceId: 's1', page: 1, ids: [a] })
    await act(async () => void (await enterReadMode()))
    const r = setup()
    expect(r.container.querySelector('[data-lasso-box]')).toBeNull()
  })
})
