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
import { resetTips, TooltipLayer } from '@/ui/Tooltip'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { closeFile, openFile } from '../session'
import { closedPdfPanel, useEditor } from '../store'
import { closeAllPdfs, setPdfStore, usePdfjs } from './runtime'
import { addPdfFile, setPdfTool } from './actions'
import { CaptureBar } from './CaptureBar'
import PdfPanel from './PdfPanel'
import { beginCapture } from './capture'

/** Icons first (rule 8) on the PDF screen: every control of the View menu, the top bar and the capture bar is an icon with a name. */
let t = 1_700_000_000_000
const st = () => useEditor.getState()
let paneWidth = 1000

beforeEach(async () => {
  paneWidth = 1000
  await closeAllPdfs()
  installMemoryLocalStorage()
  resetTips()
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return paneWidth } })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 700 } })
  usePdfjs(pdfjs as unknown as PdfjsLike)
  setPdfStore(new MemoryPdfStore())
  const repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'map', name: 'Icons', content: buildStarterContent('blank') })
  await openFile(f.id, repo)
  act(() => useEditor.setState({ pdfPanel: closedPdfPanel() }))
})
afterEach(async () => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  resetTips()
  await closeFile()
})

async function open() {
  const bytes = await makePdf(Array.from({ length: 6 }, (_, i) => ({ lines: [{ text: `Icons page ${i + 1}` }] })))
  await act(async () => void (await addPdfFile(new File([bytes as BlobPart], 'Book.pdf', { type: 'application/pdf' }))))
  render(
    <>
      <PdfPanel mode="side" />
      <TooltipLayer />
    </>
  )
  await screen.findByLabelText(/Book\.pdf, \d+ pages/)
}
const openView = () => fireEvent.click(screen.getAllByRole('button', { name: 'View options' })[0] as HTMLElement)
const menu = () => document.querySelector('[data-view-menu]') as HTMLElement
const names = (root: ParentNode) => [...root.querySelectorAll('button, [role="menuitemradio"], [role="menuitemcheckbox"], [role="menuitem"]')].map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim() ?? '')

describe('the View menu is icons only', () => {
  it('has the rows of the plan, each control an icon (or a colour) with a name; only the percentage is text', async () => {
    await open()
    openView()
    for (const row of ['Pages', 'Reading', 'Colour', 'Zoom', 'Fit']) expect(within(menu()).getByRole('group', { name: row })).toBeTruthy()
    const wanted = ['Single-page view', 'Two-page view', 'First page alone', 'Enable scrolling', '1-page flipping', 'Right-to-left reading', 'Light', 'Dark', 'Grey', 'Sepia', 'Zoom out', 'Zoom in', 'Fit width', 'Fit page', 'Fit height', 'Actual size (100%)', 'Presentation mode (coming soon)', 'Reset to default layout']
    const have = names(menu())
    for (const n of wanted) expect(have, n).toContain(n)
    for (const b of menu().querySelectorAll('button')) {
      const label = b.getAttribute('aria-label')
      expect(label, `a control with no name: ${b.outerHTML.slice(0, 80)}`).toBeTruthy()
      // No words on a control: an icon, a colour, or (for the zoom) a percentage.
      const text = b.textContent?.trim() ?? ''
      expect(text === '' || /^\d+%$/.test(text) || text === '–', `${label} shows "${text}"`).toBe(true)
      expect(b.getAttribute('title')).toBeNull()
    }
  })

  it('no ticks and no dots: the chosen option is a highlighted background', async () => {
    await open()
    openView()
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Two-page view' }))
    const chosen = screen.getByRole('menuitemradio', { name: 'Two-page view' })
    expect(chosen.getAttribute('aria-checked')).toBe('true')
    expect(chosen.className).toContain('bg-brand/20')
    expect(screen.getByRole('menuitemradio', { name: 'Single-page view' }).className).not.toContain('bg-brand/20')
    expect(menu().textContent).not.toMatch(/[✓●]/)
    // The same for a switch and for a colour.
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'First page alone' }))
    expect(screen.getByRole('menuitemcheckbox', { name: 'First page alone' }).className).toContain('bg-brand/20')
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Dark' }))
    expect(screen.getByRole('menuitemradio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('menuitemradio', { name: 'Light' }).getAttribute('aria-checked')).toBe('false')
  })

  it('First page alone and 1-page flipping are greyed out, not hidden, until two pages are chosen', async () => {
    await open()
    openView()
    expect((screen.getByRole('menuitemcheckbox', { name: 'First page alone' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('menuitemcheckbox', { name: '1-page flipping' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Two-page view' }))
    expect((screen.getByRole('menuitemcheckbox', { name: 'First page alone' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('fits without scrolling: no scroll container taller than its content is needed, and it is one compact block', async () => {
    await open()
    openView()
    expect(menu().className).toContain('w-[18.5rem]')
    // Six rows and a footer: far fewer controls per row than before (20 text rows).
    expect(menu().querySelectorAll('[role="group"]').length).toBeGreaterThanOrEqual(5)
    expect(menu().querySelectorAll('button').length).toBeLessThanOrEqual(26)
  })

  it('the percentage is the one text: it shows the real zoom (also while Fit is on) and opens the list', async () => {
    await open()
    openView()
    const pct = document.querySelector('[data-zoom-percent]') as HTMLElement
    expect(pct.textContent).toMatch(/^\d+%$/)
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Actual size (100%)' }))
    expect(document.querySelector('[data-zoom-percent]')?.textContent).toBe('100%')
  })
})

describe('the top bar is icons only', () => {
  it('Capture area, Split, Markup, View, Two pages, Focus, More and the size button have no words, only names', async () => {
    await open()
    const bar = document.querySelector('[data-pdf-bar]') as HTMLElement
    for (const n of ['Close the PDF panel', 'Capture area', 'Split', 'Markup', 'View options', 'Two pages side by side', 'Focus mode', 'More PDF options', /Make the PDF bigger/]) {
      const b = within(bar).getByRole('button', { name: n })
      expect(b.textContent, String(n)).toBe('')
      expect(b.querySelector('svg')).toBeTruthy()
      expect(b.getAttribute('title')).toBeNull()
    }
  })

  it('the page arrows are icons too; the page number and the file name stay text', async () => {
    paneWidth = 1000
    await open()
    const bar = document.querySelector('[data-pdf-bar]') as HTMLElement
    expect(within(bar).getByRole('button', { name: 'Next page' }).textContent).toBe('')
    expect(within(bar).getByRole('button', { name: 'Previous page' }).querySelector('svg')).toBeTruthy()
    expect((within(bar).getByLabelText('Page number') as HTMLInputElement).value).toBe('1')
    expect(within(bar).getByRole('button', { name: /Book\.pdf/ }).textContent).toContain('Book.pdf')
  })

  it('a chosen toggle is highlighted: Capture area and Markup', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Markup' }))
    expect(screen.getByRole('button', { name: 'Markup' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Markup' }).className).toContain('bg-brand/20')
    act(() => setPdfTool('capture'))
    expect(screen.getByRole('button', { name: 'Capture area' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('every button of the bar has a name (nothing reads as "button")', async () => {
    await open()
    const bar = document.querySelector('[data-pdf-bar]') as HTMLElement
    for (const b of bar.querySelectorAll('button')) expect((b.getAttribute('aria-label') ?? b.textContent ?? '').trim(), b.outerHTML.slice(0, 90)).not.toBe('')
  })
})

describe('the capture bar and the markup bars', () => {
  it('Add as and Keep capturing are icon toggles with names; the target name stays text', async () => {
    await open()
    act(() => beginCapture())
    render(<CaptureBar />)
    const bars = document.querySelectorAll('[data-capture-bar]')
    const bar = bars[bars.length - 1] as HTMLElement
    for (const n of ['Sub-topic', 'Next sibling', 'New branch']) {
      const b = within(bar).getByRole('radio', { name: n })
      expect(b.textContent).toBe('')
      expect(b.querySelector('svg')).toBeTruthy()
    }
    const keep = within(bar).getByRole('checkbox', { name: 'Keep capturing' })
    expect(keep.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(keep)
    expect(st().pdfPanel.capture.keep).toBe(true)
    expect(within(bar).getByRole('checkbox', { name: 'Keep capturing' }).className).toContain('bg-brand/20')
    expect(within(bar).getByRole('button', { name: 'More capture options' }).textContent).toBe('')
    expect(within(bar).getByText('Into:')).toBeTruthy()
  })

  it('the floating markup tools use the shared tooltip: no native title on any control', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Markup' }))
    const tools = document.querySelector('[data-floating-tools]') as HTMLElement
    expect(tools.querySelectorAll('button').length).toBeGreaterThan(8)
    for (const el of tools.querySelectorAll('[title]')) throw new Error(`a native title is left on ${el.outerHTML.slice(0, 80)}`)
    for (const b of tools.querySelectorAll('button')) expect((b.getAttribute('aria-label') ?? '').length, b.outerHTML.slice(0, 80)).toBeGreaterThan(0)
  })
})
