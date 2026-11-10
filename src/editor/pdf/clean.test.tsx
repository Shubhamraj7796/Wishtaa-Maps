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
import { addPdfFile, setPdfTool } from './actions'
import PdfPanel from './PdfPanel'
import { DEFAULT_UI, hintSeen, loadPdfUi, markHintSeen, savePdfUi } from './uiPrefs'

let t = 1_700_000_000_000
const st = () => useEditor.getState()
let paneWidth = 1000

const file = async (name: string, pages = 12, text = true) =>
  new File([(await makePdf(Array.from({ length: pages }, (_, i) => ({ lines: text ? [{ text: `${name} page ${i + 1}` }] : [] })))) as BlobPart], name, { type: 'application/pdf' })

beforeEach(async () => {
  paneWidth = 1000
  await closeAllPdfs()
  installMemoryLocalStorage()
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return paneWidth } })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 700 } })
  usePdfjs(pdfjs as unknown as PdfjsLike)
  setPdfStore(new MemoryPdfStore())
  const repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'map', name: 'Clean', content: buildStarterContent('blank') })
  await openFile(f.id, repo)
  act(() => useEditor.setState({ pdfPanel: closedPdfPanel() }))
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await closeFile()
})

async function open(opts: { name?: string; pages?: number; text?: boolean } = {}) {
  const name = opts.name ?? 'Book.pdf'
  await act(async () => void (await addPdfFile(await file(name, opts.pages, opts.text))))
  render(<PdfPanel mode="side" />)
  await screen.findByLabelText(new RegExp(`${name.replace('.', '\\.')}, \\d+ pages`))
}
const more = () => fireEvent.click(screen.getByRole('button', { name: 'More PDF options' }))
const bar = () => document.querySelector('[data-pdf-bar]')

describe('Group A: one thin top bar', () => {
  it('has one bar with the name, page, View, Capture, Markup and "..."; no Pages/Markup tab row', async () => {
    await open()
    expect(bar()).toBeTruthy()
    for (const name of ['Close the PDF panel', 'Page number', 'View options', 'Capture area', 'Markup', 'More PDF options']) expect(screen.getAllByLabelText(name).length).toBeGreaterThan(0)
    expect(screen.queryByRole('tab', { name: 'Pages' })).toBeNull()
    expect(screen.queryByRole('tablist', { name: 'PDF panel' })).toBeNull()
  })

  it('a single PDF has no tab strip; two PDFs do (on a wide panel)', async () => {
    await open()
    expect(document.querySelector('[data-pdf-tabs]')).toBeNull()
    await act(async () => void (await addPdfFile(await file('Second.pdf'))))
    expect(document.querySelector('[data-pdf-tabs]')).toBeTruthy()
  })

  it('on a narrow panel the strip gives way to the name drop-down, which lists every PDF', async () => {
    paneWidth = 460
    await open()
    await act(async () => void (await addPdfFile(await file('Second.pdf'))))
    expect(document.querySelector('[data-pdf-tabs]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Second\.pdf/ }))
    expect(screen.getByRole('menuitem', { name: /^Book\.pdf/ })).toBeTruthy()
  })

  it('the Split and Focus buttons move into the "..." menu on a narrow panel; nothing is lost', async () => {
    paneWidth = 460
    await open()
    expect(screen.queryByRole('button', { name: 'Focus mode' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Split$/ })).toBeNull()
    more()
    expect(screen.getByRole('menuitem', { name: /Focus mode/ })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /Split view/ })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /Open a PDF from this device/ })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /Markup list/ })).toBeTruthy()
    expect(screen.getByRole('menuitemcheckbox', { name: /Page thumbnails/ })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /Hide the PDF panel/ })).toBeTruthy()
  })

  it('zoom is in the View menu now', async () => {
    await open()
    expect(screen.queryByRole('button', { name: 'Zoom in' })).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'View options' })[0] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(st().pdfPanel.zoom).toBe(1.25)
  })
})

describe('Group A: floating markup bar', () => {
  it('is hidden until the Markup button is pressed, and hides again', async () => {
    await open()
    expect(document.querySelector('[data-floating-tools]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Markup' }))
    expect(document.querySelector('[data-floating-tools]')).toBeTruthy()
    act(() => setPdfTool('pen'))
    fireEvent.click(screen.getByRole('button', { name: 'Markup' }))
    expect(document.querySelector('[data-floating-tools]')).toBeNull()
    expect(st().pdfPanel.tool).toBe('select') // a drawing tool is put down with the bar
  })

  it('choosing a drawing tool (its key) opens the bar', async () => {
    await open()
    act(() => setPdfTool('highlight'))
    expect(st().pdfPanel.markupBar).toBe(true)
    expect(document.querySelector('[data-floating-tools]')).toBeTruthy()
  })

  it('folds to its small button after a few idle seconds, and the setting can turn that off', async () => {
    await open()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Markup' }))
      expect(document.querySelector('[data-floating-tools]')?.getAttribute('data-floating-tools')).not.toBe('collapsed')
      act(() => void vi.advanceTimersByTime(4200))
      expect(document.querySelector('[data-floating-tools]')?.getAttribute('data-floating-tools')).toBe('collapsed')
      fireEvent.click(screen.getByRole('button', { name: 'Show the markup tools' }))
      expect(document.querySelector('[data-floating-tools]')?.getAttribute('data-floating-tools')).not.toBe('collapsed')
    } finally {
      vi.useRealTimers()
    }
  })

  it('Pen bar folds away when idle can be switched off in the menu', async () => {
    await open()
    more()
    const item = screen.getByRole('menuitemcheckbox', { name: /Pen bar folds away/ })
    expect(item.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(item)
    expect(loadPdfUi().autoCollapse).toBe(false)
  })
})

describe('Group A: Focus mode, the markup drawer, hints, chip and thumbnails', () => {
  it('Focus mode hides the bar; the handle (or Escape) brings it back', async () => {
    await open()
    more()
    fireEvent.click(screen.getByRole('menuitem', { name: /Focus mode/ }))
    expect(bar()).toBeNull()
    expect(document.querySelector('[data-focus-handle]')).toBeTruthy()
    expect(document.querySelector('[data-pdf-scroller]')).toBeTruthy() // the page is still there
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(bar()).toBeTruthy()
    // and the handle works too
    act(() => useEditor.setState({ pdfPanel: { ...st().pdfPanel, focusMode: true } }))
    fireEvent.click(screen.getByRole('button', { name: 'Show the controls' }))
    expect(bar()).toBeTruthy()
  })

  it('the Markup list is a drawer over the pages: the pages stay, Escape and the close button end it', async () => {
    await open()
    more()
    fireEvent.click(screen.getByRole('menuitem', { name: /Markup list/ }))
    expect(document.querySelector('[data-markup-drawer]')).toBeTruthy()
    expect(document.querySelector('[data-pdf-scroller]')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.querySelector('[data-markup-drawer]')).toBeNull()
    act(() => useEditor.setState({ pdfPanel: { ...st().pdfPanel, tab: 'markup' } }))
    fireEvent.click(screen.getByRole('button', { name: 'Close the markup list' }))
    expect(st().pdfPanel.tab).toBe('pages')
  })

  it('shows a small page chip', async () => {
    await open()
    expect(document.querySelector('[data-page-chip]')?.textContent).toBe('Page 1 of 12')
  })

  it('a PDF with no text gets a small hint once; dismissing it keeps it away', async () => {
    await open({ name: 'Scan.pdf', pages: 3, text: false })
    await waitFor(() => expect(document.querySelector('[data-scan-hint]')).toBeTruthy())
    expect(document.querySelector('[data-scan-hint]')?.textContent).toContain('looks scanned or handwritten')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss this hint' }))
    expect(document.querySelector('[data-scan-hint]')).toBeNull()
    const hash = Object.values(st().pdf.sources)[0]?.hash as string
    expect(hintSeen(hash)).toBe(true)
    cleanup()
    render(<PdfPanel mode="side" />)
    await screen.findByLabelText(/Scan\.pdf, 3 pages/)
    await new Promise((r) => setTimeout(r, 150))
    expect(document.querySelector('[data-scan-hint]')).toBeNull()
  })

  it('the thumbnail strip is off by default, can be switched on, goes to a page, and is remembered', async () => {
    await open()
    expect(document.querySelector('[data-thumbs]')).toBeNull()
    more()
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Page thumbnails/ }))
    expect(document.querySelector('[data-thumbs]')).toBeTruthy()
    expect(document.querySelectorAll('[data-thumb]')).toHaveLength(12)
    fireEvent.click(screen.getByRole('button', { name: 'Go to page 5' }))
    expect(st().pdfPanel.page).toBe(5)
    expect(loadPdfUi().thumbs).toBe(true)
    // A new panel on this device starts with it on.
    expect(closedPdfPanel().thumbs).toBe(true)
  })
})

describe('Group A: saved choices', () => {
  it('are small, safe to read back, and default as planned', () => {
    expect(DEFAULT_UI).toEqual({ thumbs: false, autoCollapse: true })
    savePdfUi({ thumbs: true, autoCollapse: false })
    expect(loadPdfUi()).toEqual({ thumbs: true, autoCollapse: false })
    localStorage.setItem('wishtaamaps:pdf-ui', 'not json')
    expect(loadPdfUi()).toEqual(DEFAULT_UI)
    markHintSeen('abc')
    expect(hintSeen('abc')).toBe(true)
    expect(hintSeen('other')).toBe(false)
  })
})
