// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import type { PdfjsLike } from '@/core/pdf/engine'
import { MemoryPdfStore } from '@/core/pdf/store'
import { makePdf } from '@/core/pdf/testkit'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { closeFile, openFile } from '../session'
import { closedPdfPanel, useEditor } from '../store'
import { accessPdf, BACKGROUND_DOCUMENTS, closeAllPdfs, openDocumentCount, setPdfStore, trimOpenPdfs, usePdfjs } from './runtime'
import { addPdfFile, closePdfPanel, focusPdfPane, openPdfTab, reportView, setPdfPage, setPdfSync, setPdfZoom, showSource, splitPdf, togglePdfPanel, unsplitPdf } from './actions'
import PdfPanel from './PdfPanel'

let t = 1_700_000_000_000
const st = () => useEditor.getState()
const panel = () => st().pdfPanel
const names = ['Audit.pdf', 'Tax.pdf', 'Law.pdf', 'Costing.pdf', 'FR.pdf']

/** A PDF whose first line says which one it is (so each has its own hash). */
const pdf = (name: string, pages = 12) => makePdf(Array.from({ length: pages }, (_, i) => ({ lines: [{ text: `${name} page ${i + 1}` }] })))
const file = async (name: string, pages?: number) => new File([(await pdf(name, pages)) as BlobPart], name, { type: 'application/pdf' })

function fakeLayout() {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 1000 } })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 700 } })
}

beforeEach(async () => {
  await closeAllPdfs() // documents opened by an earlier test
  installMemoryLocalStorage()
  fakeLayout()
  usePdfjs(pdfjs as unknown as PdfjsLike)
  setPdfStore(new MemoryPdfStore())
  const repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'map', name: 'Tabs', content: buildStarterContent('blank') })
  await openFile(f.id, repo)
  act(() => useEditor.setState({ pdfPanel: closedPdfPanel() }))
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await closeFile()
})

const ids = () => Object.values(st().pdf.sources).sort((a, b) => a.addedAt - b.addedAt).map((s) => s.id)
async function addAll(n = 3) {
  for (const name of names.slice(0, n)) await act(async () => void (await addPdfFile(await file(name))))
}

describe('several PDFs in tabs', () => {
  it('every PDF added becomes a tab, in order, and the last one shows', async () => {
    await addAll(3)
    expect(panel().tabs).toEqual(ids())
    expect(panel().sourceId).toBe(ids()[2])
    render(<PdfPanel mode="side" />)
    const strip = screen.getByRole('tablist', { name: 'Open PDFs' })
    expect(within(strip).getAllByRole('tab').map((x) => x.textContent?.trim())).toEqual(['Audit.pdf', 'Tax.pdf', 'Law.pdf'])
    expect(within(strip).getByRole('tab', { selected: true }).textContent).toContain('Law.pdf')
  })

  it('switching tabs keeps each PDF\'s own page and zoom', async () => {
    await addAll(2)
    const [a, b] = ids() as [string, string]
    act(() => (openPdfTab(a), setPdfPage(7), setPdfZoom(1.5)))
    act(() => (openPdfTab(b), setPdfPage(3), setPdfZoom(null)))
    expect([panel().page, panel().zoom]).toEqual([3, null])
    act(() => openPdfTab(a))
    expect([panel().page, panel().zoom]).toEqual([7, 1.5])
    act(() => openPdfTab(b))
    expect([panel().page, panel().zoom]).toEqual([3, null])
  })

  it('closing a tab keeps the PDF in the map; "Recent PDFs" brings it back', async () => {
    await addAll(2)
    render(<PdfPanel mode="side" />)
    const strip = screen.getByRole('tablist', { name: 'Open PDFs' })
    fireEvent.click(within(strip).getByRole('button', { name: 'Close Tax.pdf' }))
    expect(panel().tabs).toHaveLength(1)
    expect(Object.keys(st().pdf.sources)).toHaveLength(2) // still in the map
    // With one tab left the strip is gone; the PDF's name drop-down lists every PDF of the map.
    expect(screen.queryByRole('tablist', { name: 'Open PDFs' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Audit\.pdf/ }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /^Tax\.pdf/ }))
    expect(panel().tabs).toHaveLength(2)
  })

  it('tabs can be dragged to a new place', async () => {
    await addAll(3)
    render(<PdfPanel mode="side" />)
    const tab = (n: string) => document.querySelector(`[data-pdf-tab="${ids()[names.indexOf(n)]}"]`) as HTMLElement
    const data = new Map<string, string>()
    const dataTransfer = { setData: (k: string, v: string) => void data.set(k, v), getData: (k: string) => data.get(k) ?? '', types: ['application/x-wishtaa-pdf-tab'], effectAllowed: '' }
    fireEvent.dragStart(tab('Law.pdf'), { dataTransfer })
    fireEvent.drop(tab('Audit.pdf'), { dataTransfer })
    expect(panel().tabs.map((id) => st().pdf.sources[id]?.name)).toEqual(['Law.pdf', 'Audit.pdf', 'Tax.pdf'])
  })

  it('open tabs, their order and each PDF\'s place are remembered for this map on this device', async () => {
    await addAll(3)
    const [a, b] = ids() as [string, string, string]
    act(() => (openPdfTab(a), setPdfPage(5)))
    act(() => (openPdfTab(b), setPdfPage(9)))
    act(() => closePdfPanel()) // saves
    // A new opening of the same map (state reset, as the editor does on opening a file).
    act(() => useEditor.setState({ pdfPanel: closedPdfPanel() }))
    act(() => togglePdfPanel())
    expect(panel().tabs).toEqual(ids())
    expect(panel().sourceId).toBe(b)
    expect(panel().views[a]?.page).toBe(5)
    expect(panel().views[b]?.page).toBe(9)
  })
})

describe('split view', () => {
  it('shows two PDFs, each with its own page, and clicking a pane makes it the active one', async () => {
    await addAll(2)
    const [a, b] = ids() as [string, string]
    act(() => splitPdf(a, 'left'))
    act(() => setPdfPage(4))
    act(() => focusPdfPane(b))
    act(() => setPdfPage(11))
    render(<PdfPanel mode="side" />)
    const panes = [...document.querySelectorAll('[data-pdf-pane]')] as HTMLElement[]
    expect(panes.map((p) => p.dataset.pdfPane)).toEqual([a, b]) // left, right
    expect(panes.map((p) => p.dataset.active)).toEqual(['false', 'true'])
    fireEvent.pointerDown(panes[0] as HTMLElement)
    expect(panel().sourceId).toBe(a)
    expect(panel().page).toBe(4)
    expect(panel().views[b]?.page).toBe(11) // the other pane kept its own page
  })

  it('dropping a tab on the left or right half splits; the Split button and merge do the same without dragging', async () => {
    await addAll(3)
    const [a, , c] = ids() as [string, string, string]
    render(<PdfPanel mode="side" />)
    const data = new Map<string, string>([['application/x-wishtaa-pdf-tab', a]])
    const dataTransfer = { getData: (k: string) => data.get(k) ?? '', types: ['application/x-wishtaa-pdf-tab'] }
    act(() => void window.dispatchEvent(Object.assign(new Event('dragenter'), { dataTransfer })))
    fireEvent.drop(document.querySelector('[data-split-drop="left"]') as HTMLElement, { dataTransfer })
    expect([panel().sourceId, panel().other, panel().activeSide]).toEqual([a, c, 'left'])
    fireEvent.click(screen.getByRole('button', { name: /one pdf/i })) // merge
    expect(panel().other).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /split/i }))
    expect(panel().other).not.toBeNull()
  })

  it('stacks the two PDFs on a narrow screen', async () => {
    await addAll(2)
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 400 } })
    act(() => splitPdf(ids()[0] as string, 'left'))
    render(<PdfPanel mode="sheet" />)
    expect(document.querySelector('[data-pdf-panes]')?.className).toContain('flex-col')
    expect(document.querySelector('[role="separator"][aria-orientation="horizontal"][aria-label^="Resize the two"]')).toBeTruthy()
  })

  it('Sync scrolling: moving one pane asks the other to follow; off, it does not', async () => {
    await addAll(2)
    const [a, b] = ids() as [string, string]
    act(() => splitPdf(a, 'left'))
    act(() => reportView(a, { anchor: { n: 3, frac: 0.2 } }))
    expect(panel().views[b]?.syncTo).toBeUndefined()
    act(() => setPdfSync(true))
    act(() => reportView(a, { anchor: { n: 6, frac: 0.5 } }))
    expect(panel().views[b]?.syncTo).toMatchObject({ n: 6, frac: 0.5 })
    act(() => reportView(b, { anchor: { n: 2, frac: 0 } }))
    expect(panel().views[a]?.syncTo).toMatchObject({ n: 2, frac: 0 })
    act(() => unsplitPdf())
    expect(panel().other).toBeNull()
  })

  it('the third column shows the Outline beside two PDFs on a wide area', async () => {
    await addAll(2)
    act(() => splitPdf(ids()[0] as string, 'left'))
    act(() => useEditor.setState({ pdfPanel: { ...panel(), outlineColumn: true, open: true } }))
    render(<PdfPanel mode="side" />)
    act(() => useEditor.setState({ pdfPanel: { ...panel(), size: 'wide' } })) // the panel picks its starting size when it opens
    expect(document.querySelector('[data-outline-column]')).toBeTruthy()
    expect(document.querySelectorAll('[data-pdf-pane]')).toHaveLength(2)
    expect(document.querySelectorAll('[role="separator"][aria-label*="Resize the"]').length).toBeGreaterThanOrEqual(3) // panel edge may be hidden; two PDFs and the Outline
  })
})

describe('a topic\'s "p. N" badge', () => {
  it('opens the right PDF in its tab (reopening a closed one) at that page, and focuses the pane when it is already showing', async () => {
    await addAll(3)
    const [a, b, c] = ids() as [string, string, string]
    act(() => (openPdfTab(c), closePdfPanel()))
    // Close the first PDF's tab, then follow a link to it.
    act(() => useEditor.setState({ pdfPanel: { ...panel(), tabs: [b, c], sourceId: c } }))
    act(() => showSource({ sourceId: a, page: 6 }))
    expect(panel().tabs).toContain(a)
    expect([panel().open, panel().sourceId, panel().page]).toEqual([true, a, 6])
    expect(panel().focus).toMatchObject({ sourceId: a, page: 6 })
    // Split: a link to the PDF in the other pane focuses that pane instead of replacing anything.
    act(() => splitPdf(b, 'left')) // b | a
    act(() => showSource({ sourceId: a, page: 2 }))
    expect([panel().sourceId, panel().other]).toEqual([a, b])
    act(() => showSource({ sourceId: b, page: 9 }))
    expect([panel().sourceId, panel().other, panel().page]).toEqual([b, a, 9])
  })

  it('says "Reopen PDF" when the file is not on this device', async () => {
    await addAll(2)
    setPdfStore(new MemoryPdfStore()) // this device has none of the files now
    act(() => showSource({ sourceId: ids()[0] as string, page: 3 }))
    render(<PdfPanel mode="side" />)
    expect(await screen.findByRole('button', { name: 'Reopen PDF' })).toBeTruthy()
  })
})

describe('memory with many PDFs', () => {
  it('keeps only the PDFs on screen plus a couple of recent ones open, and opens a closed one again when it is shown', async () => {
    await addAll(5)
    const all = Object.values(st().pdf.sources)
    // Open all five (as happens when each tab is shown in turn).
    for (const s of all) expect((await accessPdf(s)).state).toBe('ready')
    expect(openDocumentCount()).toBe(5)
    // Only the last one is showing now.
    const last = all[4] as (typeof all)[number]
    trimOpenPdfs([last.hash])
    expect(openDocumentCount()).toBe(1 + BACKGROUND_DOCUMENTS)
    // Two showing: the budget is the same, shared.
    trimOpenPdfs([last.hash, (all[0] as (typeof all)[number]).hash])
    expect(openDocumentCount()).toBeLessThanOrEqual(2 + BACKGROUND_DOCUMENTS)
    // A tab that was let go opens again from this device's copy.
    expect((await accessPdf(all[1] as (typeof all)[number])).state).toBe('ready')
  })
})
