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
import { addPdfFile, collapsePdf, setPdfSize } from './actions'
import PdfPanel from './PdfPanel'

/** Collapse PDF on screen: the icon in the bar, the edge tab, the badge, the floating button, focus, names and tooltips. */
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
  const f = await repo.create({ type: 'map', name: 'Collapse', content: buildStarterContent('blank') })
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

const file = async (name: string) => new File([(await makePdf(Array.from({ length: 8 }, (_, i) => ({ lines: [{ text: `${name} page ${i + 1}` }] })))) as BlobPart], name, { type: 'application/pdf' })
async function open(mode: 'side' | 'sheet' = 'side', names = ['Audit.pdf']) {
  for (const n of names) await act(async () => void (await addPdfFile(await file(n))))
  const r = render(
    <>
      <PdfPanel mode={mode} />
      <TooltipLayer />
    </>
  )
  await screen.findByLabelText(new RegExp(`${names[names.length - 1]!.replace('.', '\\.')}, \\d+ pages`))
  return r
}
const bar = () => document.querySelector('[data-pdf-bar]') as HTMLElement

describe('the Collapse PDF icon in the top bar', () => {
  it('is the first button: an icon with the name and the shortcut, no words', async () => {
    await open()
    const first = bar().querySelector('button') as HTMLElement
    expect(first.getAttribute('aria-label')).toBe('Collapse PDF')
    expect(first.hasAttribute('data-collapse-pdf')).toBe(true)
    expect(first.textContent).toBe('')
    expect(first.querySelector('svg')).toBeTruthy()
    expect(first.getAttribute('title')).toBeNull()
  })

  it('is also on a narrow (slim) panel, where other buttons have gone into "..."', async () => {
    paneWidth = 400
    await open()
    expect(within(bar()).getByRole('button', { name: 'Collapse PDF' })).toBeTruthy()
  })

  it('collapses the panel: the strip appears and the panel itself is gone', async () => {
    await open()
    fireEvent.click(within(bar()).getByRole('button', { name: 'Collapse PDF' }))
    expect(st().pdfPanel.collapsed).toBe(true)
    expect(bar()).toBeNull()
    expect(document.querySelector('[data-pdf-size="collapsed"]')).toBeTruthy()
  })

  it('the "..." menu keeps a second way to collapse', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'More PDF options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Collapse PDF/ }))
    expect(st().pdfPanel.collapsed).toBe(true)
  })

  it('the two-pages book button steps aside below 520 px (it stays in the View menu) and is there from 520 px', async () => {
    paneWidth = 500
    const r = await open()
    expect(screen.queryByRole('button', { name: 'Two pages side by side' })).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'View options' })[0] as HTMLElement)
    expect(screen.getByRole('menuitemradio', { name: 'Two-page view' })).toBeTruthy()
    r.unmount()
    cleanup()
    paneWidth = 520
    await open()
    expect(screen.getByRole('button', { name: 'Two pages side by side' })).toBeTruthy()
  })
})

describe('the collapsed edge tab (computer)', () => {
  it('is a slim 36 px tab on the PDF side with the icon, the file name downwards and a chevron', async () => {
    await open()
    act(() => void collapsePdf())
    const tab = document.querySelector('[data-pdf-size="collapsed"]') as HTMLElement
    expect(tab.className).toContain('w-9')
    const button = within(tab).getByRole('button', { name: /^Open PDF: Audit\.pdf/ })
    expect(button.querySelector('svg')).toBeTruthy()
    expect(button.textContent).toContain('Audit.pdf')
    expect(button.querySelector('span')?.className).toContain('[writing-mode:vertical-rl]')
    expect(button.getAttribute('title')).toBeNull()
  })

  it('has no badge with one PDF', async () => {
    await open('side', ['Audit.pdf'])
    act(() => void collapsePdf())
    expect(document.querySelector('[data-tab-badge]')).toBeNull()
    expect(screen.getByRole('button', { name: /^Open PDF: Audit\.pdf$/ })).toBeTruthy()
  })

  it('shows a badge with the number of open PDF tabs when there are two or more', async () => {
    await open('side', ['One.pdf', 'Two.pdf'])
    expect(st().pdfPanel.tabs).toHaveLength(2)
    act(() => void collapsePdf())
    expect(document.querySelector('[data-tab-badge]')?.textContent).toBe('2')
    expect(screen.getByRole('button', { name: /^Open PDF: Two\.pdf \(2 PDFs open\)/ })).toBeTruthy()
  })

  it('a click opens it, with the same state and the focus on the collapse button', async () => {
    await open()
    act(() => useEditor.setState({ pdfPanel: { ...st().pdfPanel, size: 'wide' } }))
    const before = JSON.stringify({ ...st().pdfPanel, collapsed: false })
    act(() => void collapsePdf())
    fireEvent.click(screen.getByRole('button', { name: /^Open PDF/ }))
    expect(JSON.stringify(st().pdfPanel)).toBe(before)
    expect(document.activeElement?.getAttribute('data-collapse-pdf')).toBe('')
  })

  it('collapsing from the bar moves the focus to the tab, so the keyboard is not lost', async () => {
    await open()
    fireEvent.click(within(bar()).getByRole('button', { name: 'Collapse PDF' }))
    expect(document.activeElement?.hasAttribute('data-collapsed-tab')).toBe(true)
  })

  it('the tooltip says "Open PDF" on hover', async () => {
    await open()
    act(() => void collapsePdf())
    const button = screen.getByRole('button', { name: /^Open PDF/ })
    fireEvent.pointerEnter(button, { pointerType: 'mouse', pointerId: 1 })
    await act(async () => void (await new Promise((r) => setTimeout(r, 650))))
    expect(document.querySelector('[data-tooltip]')?.textContent).toBe('Open PDF')
  })

  it('Full screen: collapse and open return to Full; the app header comes back while it is collapsed', async () => {
    await open()
    setPdfSize('full')
    act(() => void collapsePdf())
    expect(document.querySelector('[data-pdf-size="collapsed"]')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Open PDF/ }))
    expect(st().pdfPanel.size).toBe('full')
    expect(document.querySelector('[data-pdf-size="full"]')).toBeTruthy()
  })
})

describe('the floating button (touch, phone, narrow window)', () => {
  it('is a round 48 px button (never under 44) with the PDF icon, and the badge when two PDFs are open', async () => {
    await open('sheet', ['One.pdf', 'Two.pdf'])
    act(() => void collapsePdf())
    const aside = document.querySelector('[data-pdf-size="collapsed"]') as HTMLElement
    expect(aside.className).toContain('absolute')
    const b = within(aside).getByRole('button', { name: /^Open PDF/ })
    expect(b.className).toContain('h-12 w-12')
    expect(b.className).toContain('rounded-full')
    expect(aside.querySelector('[data-tab-badge]')?.textContent).toBe('2')
    expect(aside.querySelector('[class*="w-9"]')).toBeNull() // no thin strip
  })

  it('a tap opens the PDF again', async () => {
    await open('sheet')
    act(() => void collapsePdf())
    fireEvent.click(screen.getByRole('button', { name: /^Open PDF/ }))
    expect(st().pdfPanel.collapsed).toBe(false)
  })

  it('the bar of a bottom sheet has the collapse icon pointing down', async () => {
    await open('sheet')
    expect(within(bar()).getByRole('button', { name: 'Collapse PDF' })).toBeTruthy()
  })
})
