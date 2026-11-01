// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { PDF_LIMITS, type MarkupObject, type PdfSource } from '@/core/pdf/types'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { enterReadMode } from '../readmode'
import { closeFile, mapDoc, openFile } from '../session'
import { useEditor } from '../store'
import { PageLayers, parseLink } from './layers'
import { addManyMarkup, addMarkup, boundsOf, deleteMarkup, markText, markupAt, sendHighlightsToOutline, topicFromMarkup, updateMarkup } from './markup'
import { MarkupTab } from './tools'

let t = 1_700_000_000_000
const st = () => useEditor.getState()
const undoSteps = () => mapDoc.undo.undoStack.length
const R = { x: 0.1, y: 0.2, w: 0.4, h: 0.03 }
const source: PdfSource = { id: 's1', name: 'a.pdf', size: 10, hash: 'h', pages: 10, addedAt: 1 }
const hl = (text: string, page = 1, y = 0.2) => ({ sourceId: 's1', page, kind: 'highlight' as const, color: '#facc15', rects: [{ ...R, y }], text })

beforeEach(async () => {
  installMemoryLocalStorage()
  const repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'map', name: 'Pdf', content: buildStarterContent('blank') })
  await openFile(f.id, repo)
  mapDoc.pdfSources.set('s1', source)
  mapDoc.undo.clear()
})
afterEach(async () => {
  cleanup()
  await closeFile()
})

describe('markup in the map', () => {
  it('each action is one undo step, in the same history as the map, and shows up in the store', () => {
    const before = undoSteps()
    const id = addMarkup(hl('Some words')) as string
    expect(st().pdf.markup[id]?.text).toBe('Some words')
    expect(undoSteps()).toBe(before + 1)
    updateMarkup(id, { color: '#ef4444', note: 'check this' })
    expect(st().pdf.markup[id]).toMatchObject({ color: '#ef4444', note: 'check this' })
    expect(undoSteps()).toBe(before + 2)
    deleteMarkup(id)
    expect(st().pdf.markup[id]).toBeUndefined()
    mapDoc.undo.undo()
    expect(st().pdf.markup[id]?.color).toBe('#ef4444')
    mapDoc.undo.undo()
    mapDoc.undo.undo()
    expect(st().pdf.markup[id]).toBeUndefined()
    mapDoc.undo.redo()
    expect(st().pdf.markup[id]).toBeDefined()
  })

  it('adding many at once is one undo step; the limit is kept', () => {
    const before = undoSteps()
    const ids = addManyMarkup(Array.from({ length: 50 }, (_, i) => hl(`w${i}`, 1 + (i % 5), 0.1 + (i % 7) * 0.05)))
    expect(ids).toHaveLength(50)
    expect(undoSteps()).toBe(before + 1)
    expect(addManyMarkup(Array.from({ length: PDF_LIMITS.maxMarkupPerMap }, () => hl('x')))).toEqual([])
    expect(mapDoc.markup.size).toBe(50)
  })

  it('markText keeps one rectangle per line and cleans the words', () => {
    const id = markText('highlight', { sourceId: 's1', page: 2, rects: [R, { ...R, y: 0.25 }], text: 'Absorp-\ntion of drug' }, '#4ade80') as string
    expect(st().pdf.markup[id]).toMatchObject({ kind: 'highlight', page: 2, text: 'Absorption of drug' })
    expect(st().pdf.markup[id]?.rects).toHaveLength(2)
  })

  it('markupAt finds the topmost markup under a point, bounds cover points and rects', () => {
    const a = addMarkup(hl('first')) as string
    const b = addMarkup({ sourceId: 's1', page: 1, kind: 'rect', color: '#000', rects: [{ x: 0.05, y: 0.15, w: 0.6, h: 0.2 }], width: 0.004 }) as string
    const list = Object.values(st().pdf.markup).sort((x, y) => x.createdAt - y.createdAt || (x.id === a ? -1 : 1))
    expect(markupAt(list, [0.2, 0.21])?.id).toBeDefined()
    expect(markupAt(list, [0.9, 0.9])).toBeNull()
    expect(b).toBeTruthy()
    const pen: MarkupObject = { id: 'p', sourceId: 's1', page: 1, kind: 'pen', color: '#000', points: [[0.1, 0.1], [0.3, 0.4]], createdAt: 1 }
    expect(boundsOf(pen)).toEqual({ x: 0.1, y: 0.1, w: expect.closeTo(0.2), h: expect.closeTo(0.3) })
  })
})

describe('topics from highlights', () => {
  it('a highlight becomes a linked topic, once, in one undo step', () => {
    const id = addMarkup(hl('Key finding', 4)) as string
    const before = undoSteps()
    const topic = topicFromMarkup(id) as string
    expect(st().topics[topic]).toMatchObject({ text: 'Key finding' })
    expect(st().topics[topic]?.source?.page).toBe(4)
    expect(st().pdf.markup[id]?.topicId).toBe(topic)
    expect(undoSteps()).toBe(before + 1)
  })

  it('"send all highlights to outline" groups by page, skips ones already made into topics, one undo step', () => {
    addMarkup(hl('Alpha', 3))
    addMarkup(hl('Beta', 3, 0.3))
    addMarkup(hl('Gamma', 1))
    const done = addMarkup(hl('Delta', 2)) as string
    topicFromMarkup(done)
    addMarkup({ sourceId: 's1', page: 2, kind: 'pen', color: '#000', points: [[0, 0], [1, 1]] })
    const before = undoSteps()
    const topicsBefore = Object.keys(st().topics).length
    expect(sendHighlightsToOutline('s1')).toBe(3)
    expect(undoSteps()).toBe(before + 1)
    const texts = Object.values(st().topics).map((x) => x.text)
    expect(texts).toEqual(expect.arrayContaining(['Page 1', 'Page 3', 'Alpha', 'Beta', 'Gamma']))
    expect(texts).not.toContain('Page 2') // its only highlight was already a topic
    expect(Object.keys(st().topics).length).toBe(topicsBefore + 2 + 3)
    const page3 = Object.values(st().topics).find((x) => x.text === 'Page 3')
    const kids = Object.values(st().topics).filter((x) => x.parentId === page3?.id).map((x) => x.text)
    expect(kids.sort()).toEqual(['Alpha', 'Beta'])
    expect(Object.values(st().pdf.markup).filter((m) => m.kind === 'highlight' && !m.topicId)).toHaveLength(0)
    expect(sendHighlightsToOutline('s1')).toBe(0) // nothing new
  })
})

describe('link targets', () => {
  it('accepts a page of the PDF or a web address, refuses the rest', () => {
    expect(parseLink('3', 10)).toEqual({ page: 3 })
    expect(parseLink('11', 10)).toBeNull()
    expect(parseLink('0', 10)).toBeNull()
    expect(parseLink('example.com/a', 10)).toEqual({ url: 'https://example.com/a' })
    expect(parseLink('https://example.com', 10)).toEqual({ url: 'https://example.com/' })
    expect(parseLink('javascript:alert(1)', 10)).toBeNull()
    expect(parseLink('data:text/html,hi', 10)).toBeNull()
    expect(parseLink('   ', 10)).toBeNull()
  })
})

describe('on the page', () => {
  const box = { w: 600, h: 800, scale: 1, rotation: 0 as const }
  const handle = {} as never

  it('draws every kind of markup of the page in the page’s own coordinates, and only that page', () => {
    addMarkup(hl('Marked'))
    addMarkup({ sourceId: 's1', page: 1, kind: 'pen', color: '#000', points: [[0.1, 0.1], [0.2, 0.2], [0.3, 0.1]], width: 0.004 })
    addMarkup({ sourceId: 's1', page: 1, kind: 'arrow', color: '#000', points: [[0.1, 0.5], [0.4, 0.6]], width: 0.004 })
    addMarkup({ sourceId: 's1', page: 1, kind: 'text', color: '#111', rects: [R], text: 'Hello', fontSize: 0.02 })
    addMarkup({ sourceId: 's1', page: 1, kind: 'whiteout', color: '#fff', rects: [R] })
    addMarkup(hl('Elsewhere', 2))
    const { container } = render(<PageLayers source={source} handle={handle} n={1} box={box} lines={null} />)
    expect(container.querySelectorAll('rect[data-markup]').length).toBe(2) // highlight + whiteout
    expect(container.querySelector('polyline')).toBeTruthy()
    expect(container.querySelector('polygon')).toBeTruthy()
    expect(container.textContent).toContain('Hello')
    expect(container.textContent).not.toContain('Elsewhere')
    const hlRect = container.querySelector('rect[data-markup]') as SVGRectElement
    expect(Number(hlRect.getAttribute('x'))).toBeCloseTo(0.1 * 600)
    expect(Number(hlRect.getAttribute('width'))).toBeCloseTo(0.4 * 600)
  })

  it('has no drawing layer in Read mode, but still shows the markup', async () => {
    addMarkup(hl('Marked'))
    act(() => useEditor.setState({ pdfPanel: { ...st().pdfPanel, tool: 'pen' } }))
    const { container, rerender } = render(<PageLayers source={source} handle={handle} n={1} box={box} lines={null} />)
    expect(container.querySelector('[data-draw-layer]')).toBeTruthy()
    await act(async () => void (await enterReadMode()))
    rerender(<PageLayers source={source} handle={handle} n={1} box={box} lines={null} />)
    expect(container.querySelector('[data-draw-layer]')).toBeNull()
    expect(container.querySelector('rect[data-markup]')).toBeTruthy()
  })

  it('lists markup by page in the Markup tab, with no tools in Read mode', async () => {
    addMarkup(hl('Alpha', 3))
    addMarkup(hl('Gamma', 1))
    const { container } = render(<MarkupTab source={source} handle={handle} />)
    const headings = [...container.querySelectorAll('h3')].map((h) => h.textContent)
    expect(headings).toEqual(['Page 1', 'Page 3'])
    expect(container.textContent).toContain('Send all highlights to outline (2)')
    await act(async () => void (await enterReadMode()))
    expect(container.textContent).not.toContain('Send all highlights')
    expect(container.querySelector('[aria-label="Delete"]')).toBeNull()
    expect(container.textContent).toContain('Alpha')
  })
})

describe('Read mode', () => {
  it('blocks every change to markup', async () => {
    const id = addMarkup(hl('Keep')) as string
    await act(async () => void (await enterReadMode()))
    expect(addMarkup(hl('New'))).toBeNull()
    updateMarkup(id, { color: '#000' })
    deleteMarkup(id)
    expect(st().pdf.markup[id]).toMatchObject({ color: '#facc15' })
    expect(Object.keys(st().pdf.markup)).toHaveLength(1)
  })
})
