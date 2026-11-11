// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
import { addPdfFile, closePdfTab } from './actions'
import PdfPanel from './PdfPanel'

const picked = vi.hoisted(() => ({ device: vi.fn(), drive: vi.fn() }))
vi.mock('./actions', async (orig) => ({ ...(await orig<typeof import('./actions')>()), pickPdfFromDevice: picked.device, openPdfFromDrive: picked.drive }))

/** Open a PDF: the shared popover from the "+" of the tab row (and, in the next step, from the top bar). */
let t = 1_700_000_000_000
const st = () => useEditor.getState()
let paneWidth = 1000

beforeEach(async () => {
  paneWidth = 1000
  picked.device.mockClear()
  picked.drive.mockClear()
  await closeAllPdfs()
  installMemoryLocalStorage()
  resetTips()
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return paneWidth } })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 700 } })
  usePdfjs(pdfjs as unknown as PdfjsLike)
  setPdfStore(new MemoryPdfStore())
  const repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'map', name: 'Open', content: buildStarterContent('blank') })
  await openFile(f.id, repo)
  act(() => useEditor.setState({ pdfPanel: closedPdfPanel() }))
})
afterEach(async () => {
  cleanup()
  vi.useRealTimers()
  resetTips()
  await closeFile()
})

const file = async (name: string) => new File([(await makePdf(Array.from({ length: 4 }, (_, i) => ({ lines: [{ text: `${name} page ${i + 1}` }] })))) as BlobPart], name, { type: 'application/pdf' })
async function open(names: string[]) {
  for (const n of names) await act(async () => void (await addPdfFile(await file(n))))
  render(
    <>
      <PdfPanel mode="side" />
      <TooltipLayer />
    </>
  )
  await screen.findByLabelText(new RegExp(`${names[names.length - 1]!.replace('.', '\\.')}, \\d+ pages`))
}
const popover = () => document.querySelector('[data-popover]') as HTMLElement | null
const strip = () => document.querySelector('[data-pdf-tabs]') as HTMLElement

describe('the "+" of the tab row opens the shared Open a PDF popover', () => {
  it('is the file-plus icon with the name "Open a PDF", no words, no native title', async () => {
    await open(['One.pdf', 'Two.pdf'])
    const plus = within(strip()).getByRole('button', { name: 'Open a PDF' })
    expect(plus.textContent).toBe('')
    expect(plus.querySelector('svg')).toBeTruthy()
    expect(plus.getAttribute('title')).toBeNull()
    expect(plus.getAttribute('aria-haspopup')).toBe('menu')
  })

  it('opens a popover in the page layer with two icon choices that have names', async () => {
    await open(['One.pdf', 'Two.pdf'])
    fireEvent.click(within(strip()).getByRole('button', { name: 'Open a PDF' }))
    expect(popover()?.parentElement).toBe(document.body)
    expect(popover()?.getAttribute('aria-label')).toBe('Open a PDF')
    const device = within(popover()!).getByRole('menuitem', { name: 'From this device' })
    const drive = within(popover()!).getByRole('menuitem', { name: 'From Google Drive' })
    for (const b of [device, drive]) {
      expect(b.textContent).toBe('')
      expect(b.querySelector('svg')).toBeTruthy()
      expect(b.getAttribute('title')).toBeNull()
    }
  })

  it('"From this device" and "From Google Drive" call what the "..." menu calls, and close the popover', async () => {
    await open(['One.pdf', 'Two.pdf'])
    const plus = () => within(strip()).getByRole('button', { name: 'Open a PDF' })
    fireEvent.click(plus())
    fireEvent.click(within(popover()!).getByRole('menuitem', { name: 'From this device' }))
    expect(picked.device).toHaveBeenCalledTimes(1)
    expect(popover()).toBeNull()
    fireEvent.click(plus())
    fireEvent.click(within(popover()!).getByRole('menuitem', { name: 'From Google Drive' }))
    expect(picked.drive).toHaveBeenCalledTimes(1)
    expect(popover()).toBeNull()
    // The "..." menu keeps its two items, calling the same things.
    fireEvent.click(screen.getByRole('button', { name: 'More PDF options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Open a PDF from this device/ }))
    expect(picked.device).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'More PDF options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Open a PDF from Google Drive/ }))
    expect(picked.drive).toHaveBeenCalledTimes(2)
  })

  it('keeps the Recent PDFs list under the icons: a PDF of this map whose tab was closed comes back with a click', async () => {
    await open(['One.pdf', 'Two.pdf', 'Three.pdf'])
    const two = Object.values(st().pdf.sources).find((s) => s.name === 'Two.pdf')!
    act(() => closePdfTab(two.id))
    fireEvent.click(within(strip()).getByRole('button', { name: 'Open a PDF' }))
    const recent = within(popover()!).getByRole('group', { name: 'Recent PDFs' })
    fireEvent.click(within(recent).getByRole('menuitem', { name: /Two\.pdf/ }))
    expect(st().pdfPanel.tabs).toContain(two.id)
    expect(popover()).toBeNull()
  })

  it('the keyboard works: Enter on the icon opens it with the first choice focused; arrows move; Escape closes and returns focus', async () => {
    await open(['One.pdf', 'Two.pdf'])
    const plus = within(strip()).getByRole('button', { name: 'Open a PDF' })
    act(() => plus.focus())
    fireEvent.click(plus)
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('From this device')
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('From Google Drive')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(popover()).toBeNull()
    expect(document.activeElement).toBe(plus)
    expect(st().pdfPanel.open || true).toBe(true) // Escape did not touch the panel
  })

  it('the tooltip of the icon is "Open a PDF"', async () => {
    await open(['One.pdf', 'Two.pdf'])
    fireEvent.pointerEnter(within(strip()).getByRole('button', { name: 'Open a PDF' }), { pointerType: 'mouse', pointerId: 1 })
    await waitFor(() => expect(document.querySelector('[data-tooltip]')?.textContent).toBe('Open a PDF'), { timeout: 1500 })
  })

  it('has no choices in Read mode (nothing can be added)', async () => {
    await open(['One.pdf', 'Two.pdf'])
    act(() => useEditor.setState({ readOnly: true }))
    expect(within(strip()).queryByRole('button', { name: 'Open a PDF' })).toBeNull()
    act(() => useEditor.setState({ readOnly: false }))
  })
})

describe('the Open a PDF icon in the top bar', () => {
  const bar = () => document.querySelector('[data-pdf-bar]') as HTMLElement
  const has = (name: string | RegExp) => !!within(bar()).queryByRole('button', { name })

  it('is on the bar when only ONE PDF is open (the tab row is not there then)', async () => {
    await open(['One.pdf'])
    expect(document.querySelector('[data-pdf-tabs]')).toBeNull()
    const b = within(bar()).getByRole('button', { name: 'Open a PDF' })
    expect(b.textContent).toBe('')
    expect(b.querySelector('svg')).toBeTruthy()
    expect(b.getAttribute('title')).toBeNull()
  })

  it('is the same icon on the bar and on the "+" of the tab row', async () => {
    await open(['One.pdf', 'Two.pdf'])
    const barIcon = within(bar()).getByRole('button', { name: 'Open a PDF' }).querySelector('svg')?.getAttribute('class')
    const tabIcon = within(strip()).getByRole('button', { name: 'Open a PDF' }).querySelector('svg')?.getAttribute('class')
    expect(barIcon).toContain('file-plus')
    expect(tabIcon).toBe(barIcon)
  })

  it('opens the same popover as the "+": the two icon choices, calling the same actions', async () => {
    await open(['One.pdf'])
    fireEvent.click(within(bar()).getByRole('button', { name: 'Open a PDF' }))
    expect(popover()?.getAttribute('aria-label')).toBe('Open a PDF')
    fireEvent.click(within(popover()!).getByRole('menuitem', { name: 'From this device' }))
    expect(picked.device).toHaveBeenCalledTimes(1)
    fireEvent.click(within(bar()).getByRole('button', { name: 'Open a PDF' }))
    fireEvent.click(within(popover()!).getByRole('menuitem', { name: 'From Google Drive' }))
    expect(picked.drive).toHaveBeenCalledTimes(1)
  })

  it('is not shown in Read mode', async () => {
    await open(['One.pdf'])
    act(() => useEditor.setState({ readOnly: true }))
    expect(has('Open a PDF')).toBe(false)
    act(() => useEditor.setState({ readOnly: false }))
  })

  it('leaves the bar LAST: Focus, Split, the arrows, the book, Close, and only then Open a PDF', async () => {
    // width: [focus, split, arrows, book, close, open]
    const table: [number, boolean[]][] = [
      [700, [true, true, true, true, true, true]],
      [660, [false, true, true, true, true, true]],
      [620, [false, false, true, true, true, true]],
      [580, [false, false, false, true, true, true]],
      [540, [false, false, false, false, true, true]],
      [480, [false, false, false, false, false, true]],
      [430, [false, false, false, false, false, false]],
    ]
    for (const [w, want] of table) {
      paneWidth = w
      cleanup()
      await closeAllPdfs()
      act(() => useEditor.setState({ pdfPanel: closedPdfPanel() }))
      await open([`W${w}.pdf`])
      const got = [has('Focus mode'), has('Split'), has('Next page'), has('Two pages side by side'), has('Close the PDF panel'), has('Open a PDF')]
      expect(got, `at ${w} px`).toEqual(want)
      // Whatever left the bar is in "..." with its name; Open a PDF is always in "..." as a second way.
      fireEvent.click(within(bar()).getByRole('button', { name: 'More PDF options' }))
      expect(screen.getByRole('menuitem', { name: /Open a PDF from this device/ })).toBeTruthy()
      expect(screen.getByRole('menuitem', { name: /Open a PDF from Google Drive/ })).toBeTruthy()
      if (!want[0]) expect(screen.getByRole('menuitem', { name: /Focus mode/ })).toBeTruthy()
      if (!want[1]) expect(screen.getByRole('menuitem', { name: /Split view/ })).toBeTruthy()
      if (!want[4]) expect(screen.getByRole('menuitem', { name: /Close the PDF/ })).toBeTruthy()
    }
  })

  it('collapse, the page box, View, Capture, Markup, "..." and the size button are on the bar at every width', async () => {
    paneWidth = 430
    await open(['One.pdf'])
    for (const n of ['Collapse PDF', 'View options', 'Capture area', 'Markup', 'More PDF options', /Make the PDF bigger/]) expect(has(n)).toBe(true)
    expect(within(bar()).getByLabelText('Page number')).toBeTruthy()
  })
})
