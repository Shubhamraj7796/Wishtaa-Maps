// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import type { PdfSource } from '@/core/pdf/types'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { enterReadMode } from '../readmode'
import { closeFile, mapDoc, openFile } from '../session'
import { closedPdfPanel, useEditor } from '../store'
import { setPdfTool, setToolStyle } from './actions'
import { FloatingTools } from './FloatingTools'
import { addMarkup, topicFromMarkup } from './markup'
import PdfPanel from './PdfPanel'
import { loadPrefs } from './toolPrefs'

let t = 1_700_000_000_000
const st = () => useEditor.getState()
const source: PdfSource = { id: 's1', name: 'a.pdf', size: 10, hash: 'h', pages: 10, addedAt: 1 }

/** jsdom has no layout: give the panel, its parent and the floating tools sizes. */
function fakeLayout() {
  const rect = (l: number, tp: number, w: number, h: number) => ({ left: l, top: tp, width: w, height: h, right: l + w, bottom: tp + h, x: l, y: tp, toJSON: () => ({}) }) as DOMRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute('data-floating-tools')) return rect(10, 100, 44, 300)
    if (this.hasAttribute('data-pdf-panel')) return rect(0, 0, this.offsetWidth, 600)
    return rect(0, 0, 1200, 600)
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return parseInt((this as HTMLElement).style.width) || 0 } })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return (this as HTMLElement).hasAttribute('role') && (this as HTMLElement).getAttribute('role') === 'toolbar' ? 300 : parseInt((this as HTMLElement).style.height) || 0 } })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 1200 } })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 600 } })
}

const move = (type: string, x: number, y: number) => act(() => void window.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y })))

beforeEach(async () => {
  installMemoryLocalStorage()
  fakeLayout()
  const repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'map', name: 'Panel', content: buildStarterContent('blank') })
  await openFile(f.id, repo)
  act(() => mapDoc.pdfSources.set('s1', source))
  act(() => useEditor.setState({ pdfPanel: { ...closedPdfPanel(), open: true } }))
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await closeFile()
})

const size = () => document.querySelector('[data-pdf-panel]')?.getAttribute('data-pdf-size')
const expand = () => fireEvent.click(document.querySelector('[data-expand]') as HTMLElement)

describe('expanding the PDF', () => {
  it('cycles Normal, Wide, Full, back to Normal, and Escape restores', () => {
    render(<PdfPanel mode="side" />)
    expect(size()).toBe('normal')
    expand()
    expect(size()).toBe('wide')
    expect((document.querySelector('[data-pdf-panel]') as HTMLElement).style.width).toBe('70%')
    expand()
    expect(size()).toBe('full')
    expect(document.querySelector('[data-pdf-panel]')?.className).toContain('inset-0')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(size()).toBe('normal')
    expand()
    expand()
    expect(size()).toBe('full')
    expand()
    expect(size()).toBe('normal')
  })

  it('the Wide size is remembered for next time, full screen is not', () => {
    const first = render(<PdfPanel mode="side" />)
    expand()
    first.unmount()
    act(() => useEditor.setState({ pdfPanel: { ...closedPdfPanel(), open: true } }))
    render(<PdfPanel mode="side" />)
    expect(size()).toBe('wide')
    expand() // full
    cleanup()
    act(() => useEditor.setState({ pdfPanel: { ...closedPdfPanel(), open: true } }))
    render(<PdfPanel mode="side" />)
    expect(size()).toBe('wide')
  })

  it('opens full screen on a portrait touch screen', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: /pointer: coarse|hover: none/.test(q), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }))
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true })
    Object.defineProperty(window, 'innerWidth', { value: 700, configurable: true })
    render(<PdfPanel mode="sheet" />)
    expect(size()).toBe('full')
    vi.unstubAllGlobals()
  })

  it('collapses to a small tab and comes back, with the PDF still open', () => {
    render(<PdfPanel mode="side" />)
    fireEvent.click(screen.getByRole('button', { name: /Hide the PDF panel/ }))
    expect(size()).toBe('collapsed')
    expect(st().pdfPanel.open).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Show the PDF panel' }))
    expect(size()).toBe('normal')
  })

  it('keeps page and zoom when the size changes', () => {
    act(() => useEditor.setState({ pdfPanel: { ...st().pdfPanel, page: 7, zoom: 1.5 } }))
    render(<PdfPanel mode="side" />)
    expand()
    expand()
    expect(st().pdfPanel).toMatchObject({ page: 7, zoom: 1.5 })
  })
})

describe('the divider', () => {
  const divider = () => screen.getByRole('separator', { name: /Resize the PDF panel/ })

  it('moves with the arrow keys, is remembered, and goes back to Normal from Wide', () => {
    render(<PdfPanel mode="side" />)
    expect(divider().getAttribute('aria-valuenow')).toBe('460')
    fireEvent.keyDown(divider(), { key: 'ArrowRight' })
    expect(divider().getAttribute('aria-valuenow')).toBe('484')
    fireEvent.keyDown(divider(), { key: 'ArrowLeft', shiftKey: true })
    expect(divider().getAttribute('aria-valuenow')).toBe('388')
    expect(localStorage.getItem('wishtaamaps:pdf-width')).toBe('388')
    fireEvent.keyDown(divider(), { key: 'Home' })
    expect(divider().getAttribute('aria-valuenow')).toBe('280')
    expand() // wide
    fireEvent.keyDown(divider(), { key: 'ArrowRight' })
    expect(size()).toBe('normal')
  })

  it('is dragged with a mouse, a finger or a pen (pointer events), and the width is saved when let go', () => {
    render(<PdfPanel mode="side" />)
    fireEvent.pointerDown(divider(), { clientX: 460, clientY: 100, pointerType: 'touch' })
    move('pointermove', 560, 100)
    expect(divider().getAttribute('aria-valuenow')).toBe('560')
    move('pointerup', 560, 100)
    expect(localStorage.getItem('wishtaamaps:pdf-width')).toBe('560')
    // The limits: never under the minimum, never leaving too little for the map.
    fireEvent.pointerDown(divider(), { clientX: 560, clientY: 100 })
    move('pointermove', 5000, 100)
    move('pointerup', 5000, 100)
    expect(Number(divider().getAttribute('aria-valuenow'))).toBe(1200 - 320)
  })

  it('double-click toggles Normal and Wide', () => {
    render(<PdfPanel mode="side" />)
    fireEvent.doubleClick(divider())
    expect(size()).toBe('wide')
    fireEvent.doubleClick(document.querySelector('[data-pdf-panel]') as HTMLElement) // not on the divider: nothing
    expect(size()).toBe('wide')
  })

  it('the bottom sheet has a divider too, moved with the up and down keys', () => {
    render(<PdfPanel mode="sheet" />)
    const d = screen.getByRole('separator', { name: /up and down/ })
    expect(d.getAttribute('aria-valuenow')).toBe('360')
    fireEvent.keyDown(d, { key: 'ArrowUp' })
    expect(d.getAttribute('aria-valuenow')).toBe('384')
  })
})

describe('the Outline drawer in full screen', () => {
  it('shows the Outline over the PDF, so a topic made from a highlight appears without leaving full screen', () => {
    render(<PdfPanel mode="side" />)
    expand()
    expand()
    expect(size()).toBe('full')
    expect(screen.queryByRole('complementary', { name: 'Outline' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Show the Outline over the PDF/ }))
    const drawer = screen.getByRole('complementary', { name: 'Outline' })
    expect(within(drawer).queryByText('Key finding')).toBeNull()
    let topic: string | null = null
    act(() => {
      const id = addMarkup({ sourceId: 's1', page: 2, kind: 'highlight', color: '#facc15', rects: [{ x: 0.1, y: 0.2, w: 0.4, h: 0.03 }], text: 'Key finding' }) as string
      topic = topicFromMarkup(id)
    })
    expect(topic).toBeTruthy()
    expect((within(drawer).getByDisplayValue('Key finding') as HTMLInputElement).value).toBe('Key finding')
    expect(size()).toBe('full')
    // Escape closes the drawer first, then restores.
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('complementary', { name: 'Outline' })).toBeNull()
    expect(size()).toBe('full')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(size()).toBe('normal')
  })

  it('has no drawer button when not full screen', () => {
    render(<PdfPanel mode="side" />)
    expect(screen.queryByRole('button', { name: /Show the Outline over the PDF/ })).toBeNull()
  })
})

describe('the floating markup tools', () => {
  const renderTools = () => render(<div style={{ position: 'relative' }}><FloatingTools source={source} /></div>)
  const bar = () => document.querySelector('[data-floating-tools]') as HTMLElement

  it('is a vertical toolbar with every tool, and none of the old colour row', () => {
    renderTools()
    const tb = screen.getByRole('toolbar', { name: 'Markup tools' })
    expect(tb.getAttribute('aria-orientation')).toBe('vertical')
    const names = within(tb).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? '')
    for (const want of ['Select text or markup', 'Highlight', 'Underline', 'Strikethrough', 'Pen', 'Text box', 'Shapes (Rectangle)', 'Whiteout', 'Eraser', 'Link', 'Undo', 'Redo', 'Turn page 1 left', 'Turn page 1 right', 'Hide page 1']) {
      expect(names.some((n) => n.startsWith(want)), want).toBe(true)
    }
    expect(screen.queryByRole('radiogroup', { name: 'Markup colour' })).toBeNull()
  })

  it('shows each tool’s own colour on its icon, and chooses a tool with a click or a key hint in its tooltip', () => {
    renderTools()
    const pen = document.querySelector('[data-tool="pen"]') as HTMLElement
    expect(pen.querySelector('span')?.getAttribute('style')).toContain('rgb(239, 68, 68)')
    expect((document.querySelector('[data-tool="highlight"]') as HTMLElement).querySelector('span')?.getAttribute('style')).toContain('rgb(250, 204, 21)')
    expect(pen.title).toBe('Pen (P)')
    fireEvent.click(pen)
    expect(st().pdfPanel.tool).toBe('pen')
    expect(pen.getAttribute('aria-pressed')).toBe('true')
  })

  it('tapping the active tool opens its flyout; colour and thickness change that tool only, and are remembered', () => {
    renderTools()
    const pen = document.querySelector('[data-tool="pen"]') as HTMLElement
    fireEvent.click(pen)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(pen)
    const fly = screen.getByRole('dialog', { name: /Pen: colour and size/ })
    fireEvent.click(within(fly).getByRole('radio', { name: 'Colour #2563eb' }))
    fireEvent.change(within(fly).getByRole('slider', { name: 'Thickness' }), { target: { value: '9' } })
    expect(st().pdfPanel.styles.pen).toMatchObject({ color: '#2563eb', size: 9 })
    expect(st().pdfPanel.styles.highlight).toMatchObject({ color: '#facc15', opacity: 0.4 })
    expect(within(fly).getByRole('img', { name: 'Preview' }).getAttribute('data-preview')).toBe('pen')
    // Kept on this device.
    expect(loadPrefs().styles.pen).toMatchObject({ color: '#2563eb', size: 9 })
    // A custom colour.
    fireEvent.change(within(fly).getByLabelText('Custom colour'), { target: { value: '#123456' } })
    expect(st().pdfPanel.styles.pen.color).toBe('#123456')
    // Tapping the tool again closes it; Escape does too.
    fireEvent.click(pen)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('the highlighter flyout has a strength slider, and no thickness', () => {
    renderTools()
    const hl = document.querySelector('[data-tool="highlight"]') as HTMLElement
    fireEvent.click(hl)
    fireEvent.click(hl)
    const fly = screen.getByRole('dialog', { name: /Highlight: colour and size/ })
    expect(within(fly).queryByRole('slider', { name: 'Thickness' })).toBeNull()
    fireEvent.change(within(fly).getByRole('slider', { name: 'Highlighter strength' }), { target: { value: '65' } })
    expect(st().pdfPanel.styles.highlight.opacity).toBe(0.65)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Shapes is one button showing the last shape used, with the four shapes in its flyout', () => {
    renderTools()
    expect(document.querySelector('[data-tool="rect"]')).not.toBeNull()
    fireEvent.click(document.querySelector('[data-tool="rect"]') as HTMLElement)
    fireEvent.click(document.querySelector('[data-tool="rect"]') as HTMLElement)
    const fly = screen.getByRole('dialog', { name: /Shapes: colour and size/ })
    fireEvent.click(within(fly).getByRole('radio', { name: 'Arrow' }))
    expect(st().pdfPanel).toMatchObject({ tool: 'arrow', shape: 'arrow' })
    expect(document.querySelector('[data-tool="arrow"]')?.getAttribute('aria-label')).toBe('Shapes (Arrow)')
    expect(loadPrefs().shape).toBe('arrow')
    // Choosing another tool and coming back, Shapes still shows the arrow.
    act(() => setPdfTool('pen'))
    expect(document.querySelector('[data-tool="arrow"]')).not.toBeNull()
  })

  it('collapses to one small handle button and opens again; the choice is kept', () => {
    const first = renderTools()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse the markup tools' }))
    expect(bar().getAttribute('data-floating-tools')).toBe('collapsed')
    expect(screen.queryByRole('toolbar')).toBeNull()
    expect(loadPrefs().bar?.collapsed).toBe(true)
    first.unmount()
    renderTools()
    expect(bar().getAttribute('data-floating-tools')).toBe('collapsed')
    fireEvent.click(screen.getByRole('button', { name: 'Show the markup tools' }))
    expect(screen.getByRole('toolbar', { name: 'Markup tools' })).toBeTruthy()
  })

  it('is dragged by its handle and lands on the nearer side edge, and that is remembered', () => {
    renderTools()
    expect(bar().getAttribute('data-floating-tools')).toBe('left')
    const grip = screen.getByRole('button', { name: 'Move the markup tools' })
    fireEvent.pointerDown(grip, { clientX: 20, clientY: 110 })
    move('pointermove', 600, 160)
    move('pointerup', 700, 160)
    expect(bar().getAttribute('data-floating-tools')).toBe('right')
    expect(loadPrefs().bar?.side).toBe('right')
    expect(st().pdfPanel.toolSide).toBe('right')
    // And back to the left.
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move the markup tools' }), { clientX: 700, clientY: 110 })
    move('pointermove', 100, 200)
    move('pointerup', 80, 200)
    expect(bar().getAttribute('data-floating-tools')).toBe('left')
  })

  it('can fade when not in use', () => {
    vi.useFakeTimers()
    renderTools()
    fireEvent.click(screen.getByRole('button', { name: 'Fade the tools when not in use' }))
    expect(bar().className).toContain('opacity-100')
    act(() => void vi.advanceTimersByTime(3000))
    expect(bar().className).toContain('opacity-30')
    fireEvent.pointerEnter(bar())
    expect(bar().className).toContain('opacity-100')
    vi.useRealTimers()
  })

  it('has no tools in Read mode', async () => {
    renderTools()
    expect(screen.getByRole('toolbar')).toBeTruthy()
    await act(async () => void (await enterReadMode()))
    expect(screen.queryByRole('toolbar')).toBeNull()
    expect(document.querySelector('[data-floating-tools]')).toBeNull()
  })

  it('a style change reaches the next markup made with that tool', () => {
    act(() => setToolStyle('highlight', { color: '#f472b6', opacity: 0.7 }))
    expect(st().pdfPanel.styles.highlight).toMatchObject({ color: '#f472b6', opacity: 0.7 })
    expect(st().pdfPanel.styles.pen.color).toBe('#ef4444')
  })
})
