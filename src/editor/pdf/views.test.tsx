// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import type { PdfjsLike } from '@/core/pdf/engine'
import { MemoryPdfStore } from '@/core/pdf/store'
import { makePdf } from '@/core/pdf/testkit'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { closeFile, openFile } from '../session'
import { closedPdfPanel, useEditor } from '../store'
import { closeAllPdfs, setPdfStore, usePdfjs } from './runtime'
import { addPdfFile, setPdfPage, setPdfSize, setViewOf, showSource, splitPdf } from './actions'
import PdfPanel from './PdfPanel'

let t = 1_700_000_000_000
const st = () => useEditor.getState()
let paneWidth = 1000

const pdf = (name: string, pages = 12) => makePdf(Array.from({ length: pages }, (_, i) => ({ lines: [{ text: `${name} page ${i + 1}` }] })))
const file = async (name: string, pages?: number) => new File([(await pdf(name, pages)) as BlobPart], name, { type: 'application/pdf' })

beforeEach(async () => {
  paneWidth = 1000
  await closeAllPdfs()
  installMemoryLocalStorage()
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return paneWidth } })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 700 } })
  usePdfjs(pdfjs as unknown as PdfjsLike)
  setPdfStore(new MemoryPdfStore())
  const repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'map', name: 'Views', content: buildStarterContent('blank') })
  await openFile(f.id, repo)
  act(() => useEditor.setState({ pdfPanel: closedPdfPanel() }))
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await closeFile()
})

const id = () => Object.values(st().pdf.sources)[0]?.id as string
async function open(pages = 12) {
  await act(async () => void (await addPdfFile(await file('Book.pdf', pages))))
  render(<PdfPanel mode="side" />)
  await screen.findByLabelText(/Book\.pdf, \d+ pages/)
}
const scroller = () => document.querySelector('[data-pdf-scroller]') as HTMLElement
const rows = () => [...document.querySelectorAll('[data-row]')].map((r) => (r as HTMLElement).dataset.row)
const slots = (row: string) => [...(document.querySelector(`[data-row="${row}"]`)?.querySelectorAll('[data-slot]') ?? [])].map((s) => Number((s as HTMLElement).dataset.slot))
const view = (name: RegExp | string) => fireEvent.click(screen.getByRole('menuitemradio', { name }))
const check = (name: RegExp | string) => fireEvent.click(screen.getByRole('menuitemcheckbox', { name }))
const openMenu = () => fireEvent.click(screen.getAllByRole('button', { name: 'View options' })[0] as HTMLElement)

describe('View menu: Single-page and Two-page view', () => {
  it('starts as before: one page per row, scrolling, nothing chosen', async () => {
    await open()
    expect(scroller().dataset.layout).toBe('single')
    expect(scroller().dataset.paged).toBe('false')
    expect(rows()[0]).toBe('1')
    expect(rows()[1]).toBe('2')
  })

  it('Two-page view puts pages 1-2, 3-4 side by side, left and right', async () => {
    await open()
    openMenu()
    view(/Two-page view/)
    expect(scroller().dataset.layout).toBe('two')
    expect(rows().slice(0, 2)).toEqual(['1-2', '3-4'])
    expect(slots('1-2')).toEqual([1, 2])
    expect(st().pdfPanel.views[id()]?.two).toBe(true)
  })

  it('Show cover page: 1 alone on the right, then 2-3, 4-5', async () => {
    await open()
    openMenu()
    view(/Two-page view/)
    check(/First page alone/)
    expect(rows().slice(0, 3)).toEqual(['1', '2-3', '4-5'])
    // The cover has an empty half on its left, so it sits on the right.
    const cover = document.querySelector('[data-row="1"]') as HTMLElement
    expect(cover.children).toHaveLength(2)
    expect((cover.children[0] as HTMLElement).hasAttribute('data-slot')).toBe(false)
    expect((cover.children[1] as HTMLElement).dataset.slot).toBe('1')
  })

  it('Right-to-left swaps the sides of a spread (and the cover moves to the left)', async () => {
    await open()
    openMenu()
    view(/Two-page view/)
    check(/Right-to-left/)
    expect(slots('1-2')).toEqual([2, 1])
    check(/First page alone/)
    const cover = document.querySelector('[data-row="1"]') as HTMLElement
    expect((cover.children[0] as HTMLElement).dataset.slot).toBe('1')
  })

  it('both pages of a spread have their text to select', async () => {
    await open()
    openMenu()
    view(/Two-page view/)
    await waitFor(() => expect(document.querySelectorAll('[data-row="1-2"] [data-text-layer]')).toHaveLength(2), { timeout: 3000 })
  })

  it('a pane under 480 px shows one page and says why in the menu; wide enough again, two pages come back', async () => {
    paneWidth = 400
    await open()
    openMenu()
    view(/Two-page view/)
    expect(scroller().dataset.layout).toBe('single')
    expect(st().pdfPanel.views[id()]?.two).toBe(true) // the choice is kept
    expect(screen.getByText(/at least 480 px wide/)).toBeTruthy()
    expect(screen.getByText(/this one is 400 px/)).toBeTruthy()
  })

  it('exactly 480 px is enough', async () => {
    paneWidth = 480
    await open()
    openMenu()
    view(/Two-page view/)
    expect(scroller().dataset.layout).toBe('two')
    expect(document.querySelector('[data-view-note]')).toBeNull()
  })

  it('Single-page view goes back', async () => {
    await open()
    openMenu()
    view(/Two-page view/)
    view(/Single-page view/)
    expect(scroller().dataset.layout).toBe('single')
    expect(rows()[0]).toBe('1')
  })
})

describe('View menu: Enable scrolling off (paged)', () => {
  it('shows one page at a time; the arrows step by page', async () => {
    await open()
    openMenu()
    check(/Enable scrolling/)
    expect(scroller().dataset.paged).toBe('true')
    expect(rows()).toEqual(['1'])
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(rows()).toEqual(['2'])
    expect(st().pdfPanel.page).toBe(2)
  })

  it('with two pages, the buttons say spread and step by two; the page box shows what is showing', async () => {
    await open()
    openMenu()
    view(/Two-page view/)
    check(/Enable scrolling/)
    expect(rows()).toEqual(['1-2'])
    expect(screen.getByText('(showing 1–2)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next spread' }))
    expect(rows()).toEqual(['3-4'])
    fireEvent.click(screen.getByRole('button', { name: 'Previous spread' }))
    expect(rows()).toEqual(['1-2'])
    expect((screen.getByRole('button', { name: 'Previous spread' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('the last spread disables Next (an odd book ends on a lone page)', async () => {
    await open(5)
    openMenu()
    view(/Two-page view/)
    check(/Enable scrolling/)
    fireEvent.click(screen.getByRole('button', { name: 'Next spread' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next spread' }))
    expect(rows()).toEqual(['5'])
    expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('the arrow keys turn the page; right to left reverses them', async () => {
    await open()
    openMenu()
    check(/Enable scrolling/)
    fireEvent.keyDown(scroller(), { key: 'ArrowRight' })
    expect(rows()).toEqual(['2'])
    fireEvent.keyDown(scroller(), { key: 'ArrowLeft' })
    expect(rows()).toEqual(['1'])
    check(/Right-to-left/)
    fireEvent.keyDown(scroller(), { key: 'ArrowLeft' })
    expect(rows()).toEqual(['2'])
  })

  it('a topic\'s "p. N" link opens the spread that has the page', async () => {
    await open()
    openMenu()
    view(/Two-page view/)
    check(/Enable scrolling/)
    act(() => showSource({ sourceId: id(), page: 8 }))
    expect(rows()).toEqual(['7-8'])
    act(() => setPdfPage(5))
    expect(rows()).toEqual(['5-6'])
  })

  it('with the cover, the spread of page 3 is 2-3', async () => {
    await open()
    openMenu()
    view(/Two-page view/)
    check(/First page alone/)
    check(/Enable scrolling/)
    act(() => showSource({ sourceId: id(), page: 3 }))
    expect(rows()).toEqual(['2-3'])
  })

  it('turning scrolling back on keeps the page', async () => {
    await open()
    openMenu()
    check(/Enable scrolling/)
    act(() => setPdfPage(4))
    check(/Enable scrolling/)
    expect(scroller().dataset.paged).toBe('false')
    expect(st().pdfPanel.page).toBe(4)
  })
})

describe('View menu: zoom', () => {
  it('Fit page is no wider than Fit width, and Actual size is 100%', async () => {
    await open()
    const width = () => Number((document.querySelector('[data-page="1"]') as HTMLElement).style.width.replace('px', ''))
    const fitWidth = width()
    openMenu()
    view(/Fit page/)
    expect(width()).toBeLessThan(fitWidth)
    expect(screen.getByRole('button', { name: /Zoom: fit page/ }).textContent).toBe('Fit page')
    view(/Actual size/)
    expect(st().pdfPanel.zoom).toBe(1)
    expect(screen.getByRole('button', { name: /Zoom 100 percent/ })).toBeTruthy()
    view(/Fit width/)
    expect(st().pdfPanel.zoom).toBeNull()
    expect(width()).toBeCloseTo(fitWidth, 0)
  })

  it('Fit width in Two-page view fits the whole spread in the pane', async () => {
    await open()
    openMenu()
    view(/Two-page view/)
    const w = (n: number) => Number((document.querySelector(`[data-page="${n}"]`) as HTMLElement).style.width.replace('px', ''))
    expect(w(1) + w(2) + 4).toBeLessThanOrEqual(1000 - 24 + 1)
    expect(w(1) + w(2) + 4).toBeGreaterThan(1000 - 24 - 5)
  })

  it('a percentage chosen from the menu', async () => {
    await open()
    openMenu()
    fireEvent.click(screen.getByRole('button', { name: '150%' }))
    expect(st().pdfPanel.zoom).toBe(1.5)
  })
})

describe('Two-page view makes room (Part 1)', () => {
  const size = () => st().pdfPanel.size

  it('choosing Two-page view takes the panel to Full, and Single-page view restores the earlier size', async () => {
    await open()
    act(() => setPdfSize('wide'))
    openMenu()
    view(/Two-page view/)
    expect(size()).toBe('full')
    expect(document.querySelector('[data-pdf-size="full"]')).toBeTruthy()
    view(/Single-page view/)
    expect(size()).toBe('wide')
    expect(st().pdfPanel.widenedFrom).toBeNull()
  })

  it('a size set by hand after the widening is never overridden', async () => {
    await open()
    openMenu()
    view(/Two-page view/)
    expect(size()).toBe('full')
    act(() => setPdfSize('normal')) // the person shrinks it
    view(/Single-page view/)
    expect(size()).toBe('normal')
    // and the other way: a size chosen while Two pages is on is kept
    view(/Two-page view/)
    act(() => setPdfSize('wide'))
    view(/Single-page view/)
    expect(size()).toBe('wide')
  })

  it('already Full: nothing to widen and nothing to restore', async () => {
    await open()
    act(() => setPdfSize('full'))
    openMenu()
    view(/Two-page view/)
    view(/Single-page view/)
    expect(size()).toBe('full')
  })

  it('the book button in the toolbar toggles Two pages the same way', async () => {
    await open()
    const toggle = () => screen.getByRole('button', { name: 'Two pages side by side' })
    expect(toggle().getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(toggle())
    expect(scroller().dataset.layout).toBe('two')
    expect(size()).toBe('full')
    expect(toggle().getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(toggle())
    expect(scroller().dataset.layout).toBe('single')
    expect(size()).toBe('normal')
  })

  it('Fit height: the page height fills the pane (a taller scale than Fit page on a wide pane)', async () => {
    await open()
    const width = () => Number((document.querySelector('[data-page="1"]') as HTMLElement).style.width.replace('px', ''))
    openMenu()
    view(/Fit page/)
    const page = width()
    view(/Fit height/)
    expect(st().pdfPanel.views[id()]?.fit).toBe('height')
    expect(screen.getByRole('button', { name: /Zoom: fit height/ }).textContent).toBe('Fit height')
    expect(width()).toBeGreaterThanOrEqual(page)
  })

  it('Presentation mode is shown but disabled until it is built', async () => {
    await open()
    openMenu()
    const item = screen.getByRole('menuitem', { name: /Presentation mode/ }) as HTMLButtonElement
    expect(item.disabled).toBe(true)
  })
})

describe('the last chosen layout is remembered for new PDFs (Part 1)', () => {
  it('a new PDF on a wide screen starts in the layout last chosen; Reset to default layout forgets it', async () => {
    await open()
    openMenu()
    view(/Two-page view/)
    check(/First page alone/)
    expect(localStorage.getItem('wishtaamaps:pdf-default-layout')).toContain('"two":true')
    await act(async () => void (await addPdfFile(await file('Second.pdf'))))
    const second = Object.values(st().pdf.sources).find((s) => s.name === 'Second.pdf') as { id: string }
    expect(st().pdfPanel.views[second.id]).toMatchObject({ two: true, cover: true })
    // Reset: this PDF goes back and nothing is remembered.
    if (!document.querySelector('[data-view-menu]')) openMenu() // the menu may still be open from the choices above
    fireEvent.click(screen.getByRole('menuitem', { name: /Reset to default layout/ }))
    expect(st().pdfPanel.views[second.id]?.two).toBe(false)
    expect(localStorage.getItem('wishtaamaps:pdf-default-layout')).toBeNull()
    await act(async () => void (await addPdfFile(await file('Third.pdf'))))
    const third = Object.values(st().pdf.sources).find((s) => s.name === 'Third.pdf') as { id: string }
    expect(st().pdfPanel.views[third.id]?.two).toBeUndefined()
  })

  it('a narrow screen (a phone) keeps one page for new PDFs', async () => {
    await open()
    openMenu()
    view(/Two-page view/)
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 600 })
    try {
      await act(async () => void (await addPdfFile(await file('Phone.pdf'))))
      const phone = Object.values(st().pdf.sources).find((s) => s.name === 'Phone.pdf') as { id: string }
      expect(st().pdfPanel.views[phone.id]?.two).toBeUndefined()
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    }
  })
})

describe('Document colour (Part 2, B3): display only', () => {
  const pictures = () => [...document.querySelectorAll<HTMLCanvasElement>('[data-page-picture]')]
  const pick = (name: string) => fireEvent.click(document.querySelector(`[data-doc-color-choice="${name}"]`) as HTMLElement)

  it('Light is the default: no filter, white paper', async () => {
    await open()
    expect(pictures().length).toBeGreaterThan(0)
    for (const c of pictures()) expect(c.style.filter).toBe('')
    expect((document.querySelector('[data-page="1"]') as HTMLElement).style.background).toMatch(/255, 255, 255|#fff/)
  })

  it('Dark inverts with a half turn of hue, Grey and Sepia tint, Light clears; saved per PDF', async () => {
    await open()
    openMenu()
    pick('dark')
    for (const c of pictures()) expect(c.style.filter).toBe('invert(1) hue-rotate(180deg)')
    expect(st().pdfPanel.views[id()]?.color).toBe('dark')
    pick('grey')
    for (const c of pictures()) expect(c.style.filter).toBe('grayscale(1)')
    pick('sepia')
    for (const c of pictures()) expect(c.style.filter).toContain('sepia(')
    pick('light')
    for (const c of pictures()) expect(c.style.filter).toBe('')
    expect(screen.getByRole('menuitemradio', { name: /Light/ }).getAttribute('aria-checked')).toBe('true')
  })

  it('the filter is on the page picture ONLY: the page, the text and the markup above it keep their colours', async () => {
    await open()
    openMenu()
    pick('dark')
    const page = document.querySelector('[data-page="1"]') as HTMLElement
    const filtered = [page, ...page.querySelectorAll<HTMLElement>('*')].filter((e) => e.style.filter)
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.tagName).toBe('CANVAS')
    let p: HTMLElement | null = page
    while (p && p !== document.body) {
      expect(p.style.filter).toBe('')
      p = p.parentElement
    }
  })

  it('markup stays readable in Dark: its layers are not inside the filtered element', async () => {
    await open()
    openMenu()
    pick('dark')
    const picture = document.querySelector('[data-page="1"] [data-page-picture]') as HTMLElement
    const layers = document.querySelectorAll('[data-page="1"] [data-capture-layer], [data-page="1"] svg, [data-page="1"] [data-text-layer]')
    for (const l of layers) expect(picture.contains(l)).toBe(false)
  })

  it('the colour is a view setting only: it does not touch the PDF data kept in the map', async () => {
    await open()
    const before = JSON.stringify(st().pdf)
    openMenu()
    pick('dark')
    expect(JSON.stringify(st().pdf)).toBe(before)
  })

  it('the last colour starts new PDFs on a wide screen; Reset to default layout clears it', async () => {
    await open()
    openMenu()
    pick('sepia')
    expect(localStorage.getItem('wishtaamaps:pdf-default-layout')).toContain('"color":"sepia"')
    await act(async () => void (await addPdfFile(await file('Second.pdf'))))
    const second = Object.values(st().pdf.sources).find((s) => s.name === 'Second.pdf') as { id: string }
    expect(st().pdfPanel.views[second.id]?.color).toBe('sepia')
    if (!document.querySelector('[data-view-menu]')) openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /Reset to default layout/ }))
    expect(st().pdfPanel.views[second.id]?.color).toBe('light')
    expect(localStorage.getItem('wishtaamaps:pdf-default-layout')).toBeNull()
  })
})

describe('First page alone and 1-page flipping (Part 2, B1)', () => {
  it('Show cover page is now First page alone, and the saved value is still cover', async () => {
    await open()
    openMenu()
    view(/Two-page view/)
    expect(screen.queryByRole('menuitemcheckbox', { name: /Show cover page/ })).toBeNull()
    check(/First page alone/)
    expect(st().pdfPanel.views[id()]?.cover).toBe(true)
  })

  it('1-page flipping is offered only when two pages are chosen', async () => {
    await open()
    openMenu()
    expect(screen.queryByRole('menuitemcheckbox', { name: /1-page flipping/ })).toBeNull()
    view(/Two-page view/)
    expect(screen.getByRole('menuitemcheckbox', { name: /1-page flipping/ })).toBeTruthy()
    view(/Single-page view/)
    expect(screen.queryByRole('menuitemcheckbox', { name: /1-page flipping/ })).toBeNull()
  })

  it('with scrolling off, a turn moves by one page: 1-2, 2-3, 3-4; the page box follows', async () => {
    await open()
    openMenu()
    view(/Two-page view/)
    check(/Enable scrolling/)
    check(/1-page flipping/)
    expect(rows()).toEqual(['1-2'])
    fireEvent.click(screen.getByRole('button', { name: 'Next spread' }))
    expect(rows()).toEqual(['2-3'])
    fireEvent.click(screen.getByRole('button', { name: 'Next spread' }))
    expect(rows()).toEqual(['3-4'])
    expect(st().pdfPanel.page).toBe(3)
    fireEvent.click(screen.getByRole('button', { name: 'Previous spread' }))
    expect(rows()).toEqual(['2-3'])
    fireEvent.keyDown(scroller(), { key: 'ArrowRight' })
    expect(rows()).toEqual(['3-4'])
  })

  it('with the first page alone: 1, then 2-3, 3-4', async () => {
    await open()
    openMenu()
    view(/Two-page view/)
    check(/First page alone/)
    check(/Enable scrolling/)
    check(/1-page flipping/)
    expect(rows()).toEqual(['1'])
    fireEvent.click(screen.getByRole('button', { name: /^Next (page|spread)$/ }))
    expect(rows()).toEqual(['2-3'])
    fireEvent.click(screen.getByRole('button', { name: /^Next (page|spread)$/ }))
    expect(rows()).toEqual(['3-4'])
  })

  it('does nothing while scrolling is on (the continuous column still has 1-2, 3-4)', async () => {
    await open()
    openMenu()
    view(/Two-page view/)
    check(/1-page flipping/)
    expect(rows().slice(0, 2)).toEqual(['1-2', '3-4'])
  })
})

describe('View menu in a split view', () => {
  it('each pane has its own View button and its own layout', async () => {
    await act(async () => void (await addPdfFile(await file('Book.pdf'))))
    await act(async () => void (await addPdfFile(await file('Other.pdf'))))
    const [a, b] = Object.values(st().pdf.sources).sort((x, y) => x.addedAt - y.addedAt).map((s) => s.id) as [string, string]
    act(() => splitPdf(a, 'left'))
    render(<PdfPanel mode="side" />)
    await waitFor(() => expect(document.querySelectorAll('[data-pdf-scroller]')).toHaveLength(2))
    expect(screen.getAllByRole('button', { name: 'View options' }).length).toBeGreaterThanOrEqual(3) // the header and one in each pane
    act(() => setViewOf(a, { two: true }))
    const layouts = [...document.querySelectorAll<HTMLElement>('[data-pdf-pane]')].map((p) => [p.dataset.pdfPane, (p.querySelector('[data-pdf-scroller]') as HTMLElement).dataset.layout])
    expect(layouts.find(([i]) => i === a)?.[1]).toBe('two')
    expect(layouts.find(([i]) => i === b)?.[1]).toBe('single')
  })
})
