// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PdfSource } from '@/core/pdf/types'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { MarkupToolbar } from '../markup/MarkupToolbar'
import { closedPdfPanel, useEditor } from '../store'
import { setPdfTool, setToolStyle } from './actions'
import { FloatingTools } from './FloatingTools'
import { forgetPen, getPen, setPen } from './penPrefs'
import { ALL_TOOLS, DEFAULT_STYLES, loadPrefs, MAX_PRESETS, sanitizePresets, sanitizeStyle, sanitizeTools, sizeRange } from './toolPrefs'

const st = () => useEditor.getState()
const source: PdfSource = { id: 's1', name: 'a.pdf', size: 10, hash: 'h', pages: 10, addedAt: 1 }

beforeEach(() => {
  installMemoryLocalStorage()
  forgetPen()
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 900 } })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 700 } })
  act(() => useEditor.setState({ pdfPanel: closedPdfPanel(), readOnly: false }))
})
afterEach(() => cleanup())

const bar = () => render(<div style={{ position: 'relative' }}><FloatingTools source={source} /></div>)
const shown = () => [...document.querySelectorAll('[data-tool]')].map((b) => b.getAttribute('data-tool'))
const openSettings = () => fireEvent.click(screen.getByRole('button', { name: 'Customise the tools' }))
const settings = () => within(document.querySelector('[data-flyout="settings"]') as HTMLElement)

describe('C1: choosing the tools on the bar', () => {
  it('starts with every tool in the usual order, the lasso after Select', () => {
    bar()
    expect(shown()).toEqual(['select', 'lasso', 'highlight', 'underline', 'strike', 'pen', 'text', 'rect', 'whiteout', 'eraser', 'link'])
  })

  it('the picture toolbar keeps its own tools: no lasso and no Customise button', () => {
    render(<div style={{ position: 'relative' }}><MarkupToolbar tool="select" onTool={() => undefined} styles={st().pdfPanel.styles} onStyle={() => undefined} shape="rect" extras={[]} placeKey="picture" /></div>)
    expect(shown()).not.toContain('lasso')
    expect(screen.queryByRole('button', { name: 'Customise the tools' })).toBeNull()
  })

  it('hides a tool and brings it back (at the end), remembered on this device', () => {
    bar()
    openSettings()
    fireEvent.click(settings().getByRole('checkbox', { name: 'Show Pen' }))
    expect(shown()).not.toContain('pen')
    expect(loadPrefs().tools).not.toContain('pen')
    fireEvent.click(settings().getByRole('checkbox', { name: 'Show Pen' }))
    expect(shown()[shown().length - 1]).toBe('pen')
  })

  it('Select cannot be hidden', () => {
    bar()
    openSettings()
    expect((settings().getByRole('checkbox', { name: 'Show Select' }) as HTMLInputElement).disabled).toBe(true)
    expect(sanitizeTools(['pen', 'text'])).toEqual(['select', 'pen', 'text']) // and a saved list without it gets it back
  })

  it('moves a tool up and down', () => {
    bar()
    openSettings()
    fireEvent.click(settings().getByRole('button', { name: 'Move Pen up' }))
    expect(shown().indexOf('pen')).toBeLessThan(shown().indexOf('strike'))
    expect(loadPrefs().tools.indexOf('pen')).toBe(shown().indexOf('pen'))
    fireEvent.click(settings().getByRole('button', { name: 'Move Pen down' }))
    expect(shown().indexOf('pen')).toBeGreaterThan(shown().indexOf('strike') - 1)
  })

  it('a saved bar comes back after a restart; an odd saved list is cleaned', () => {
    localStorage.setItem('wishtaamaps:pdf-tools', JSON.stringify({ tools: ['text', 'bogus', 'pen', 'pen'] }))
    expect(loadPrefs().tools).toEqual(['select', 'text', 'pen'])
    act(() => useEditor.setState({ pdfPanel: closedPdfPanel() }))
    bar()
    expect(shown()).toEqual(['select', 'text', 'pen'])
  })

  it('Reset to defaults brings every tool back, forgets the presets and puts the pen settings back', () => {
    bar()
    act(() => setToolStyle('pen', { color: '#2563eb', size: 2 }))
    openSettings()
    fireEvent.click(settings().getByRole('checkbox', { name: 'Show Text box' }))
    fireEvent.click(settings().getByRole('checkbox', { name: 'Stylus only' }))
    expect(getPen().stylusOnly).toBe(true)
    fireEvent.click(document.querySelector('[data-reset-tools]') as HTMLElement)
    expect(shown()).toEqual([...ALL_TOOLS].map((t) => (t === 'shapes' ? 'rect' : t)))
    expect(getPen().stylusOnly).toBe(false)
    expect(st().pdfPanel.presets).toEqual({})
  })

  it('has one list of tools and nothing unknown', () => {
    expect(ALL_TOOLS).toHaveLength(11)
    expect(new Set(ALL_TOOLS).size).toBe(ALL_TOOLS.length)
  })
})

describe('C1: the pen settings', () => {
  it('Pressure, Straighten, Snap shapes, Palm rejection and Stylus only are switches kept on this device', () => {
    bar()
    openSettings()
    for (const [label, key] of [['Pressure', 'pressure'], ['Straighten lines when I hold still', 'snapLines'], ['Snap rectangles, circles and ellipses', 'snapShapes'], ['Palm rejection', 'palm'], ['Stylus only', 'stylusOnly']] as const) {
      const box = settings().getByRole('checkbox', { name: label }) as HTMLInputElement
      const was = box.checked
      fireEvent.click(box)
      expect(getPen()[key]).toBe(!was)
    }
    forgetPen()
    expect(getPen().pressure).toBe(false) // read back from the device
  })

  it('start as decided: pressure, snapping and palm rejection on, stylus only off', () => {
    setPen({})
    expect(getPen()).toEqual({ pressure: true, snapLines: true, snapShapes: true, palm: true, stylusOnly: false })
  })
})

describe('C1: finer thickness and presets', () => {
  it('lines go down to a half step: the range and what is kept', () => {
    expect(sizeRange('pen')).toMatchObject({ min: 0.5, max: 12, step: 0.5 })
    expect(sizeRange('underline')).toMatchObject({ min: 0.5, max: 8, step: 0.5 })
    expect(sizeRange('text')).toMatchObject({ min: 8, max: 60, step: 1 })
    expect(sanitizeStyle('pen', { size: 2.3 }).size).toBe(2.5)
    expect(sanitizeStyle('pen', { size: 0.1 }).size).toBe(0.5)
    expect(sanitizeStyle('text', { size: 20.4 }).size).toBe(20)
    expect(DEFAULT_STYLES.pen.size).toBe(4) // what people had before is unchanged
  })

  it('the thickness slider has half steps and a live preview', () => {
    bar()
    act(() => setPdfTool('pen'))
    fireEvent.click(screen.getByRole('button', { name: 'Colour and size: Pen' }))
    const slider = screen.getByRole('slider', { name: 'Thickness' }) as HTMLInputElement
    expect(slider.min).toBe('0.5')
    expect(slider.step).toBe('0.5')
    fireEvent.change(slider, { target: { value: '1.5' } })
    expect(st().pdfPanel.styles.pen.size).toBe(1.5)
    expect(document.querySelector('[data-preview="pen"]')).toBeTruthy()
  })

  it('saves the current colour and thickness as a preset, applies it later, and removes it', () => {
    bar()
    act(() => setPdfTool('pen'))
    fireEvent.click(screen.getByRole('button', { name: 'Colour and size: Pen' }))
    act(() => setToolStyle('pen', { color: '#2563eb', size: 1.5 }))
    fireEvent.click(document.querySelector('[data-save-preset]') as HTMLElement)
    expect(st().pdfPanel.presets.pen).toMatchObject([{ color: '#2563eb', size: 1.5 }])
    expect(loadPrefs().presets.pen).toHaveLength(1)
    act(() => setToolStyle('pen', { color: '#ef4444', size: 8 }))
    fireEvent.click(document.querySelector('[data-preset="0"]') as HTMLElement)
    expect(st().pdfPanel.styles.pen).toMatchObject({ color: '#2563eb', size: 1.5 })
    // The same one again is not added twice.
    fireEvent.click(document.querySelector('[data-save-preset]') as HTMLElement)
    expect(st().pdfPanel.presets.pen).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Remove preset 1' }))
    expect(st().pdfPanel.presets.pen).toBeUndefined()
    expect(loadPrefs().presets.pen).toBeUndefined()
  })

  it('keeps at most five presets (the oldest goes)', () => {
    bar()
    act(() => setPdfTool('pen'))
    fireEvent.click(screen.getByRole('button', { name: 'Colour and size: Pen' }))
    for (let i = 0; i < 7; i++) {
      act(() => setToolStyle('pen', { color: `#10${i}000`, size: 1 + i * 0.5 }))
      fireEvent.click(document.querySelector('[data-save-preset]') as HTMLElement)
    }
    expect(st().pdfPanel.presets.pen).toHaveLength(MAX_PRESETS)
    expect(st().pdfPanel.presets.pen?.[0]?.color).toBe('#102000')
  })

  it('an odd saved preset list is cleaned', () => {
    const clean = sanitizePresets({ pen: [{ color: 'red', size: 3 }, { color: '#00ff00', size: 99 }, null], bogus: [{ color: '#000000' }], text: 'x' })
    expect(Object.keys(clean)).toEqual(['pen'])
    expect(clean.pen).toHaveLength(1)
    expect(clean.pen?.[0]).toMatchObject({ color: '#00ff00', size: 12 })
    expect(sanitizePresets(null)).toEqual({})
  })
})
