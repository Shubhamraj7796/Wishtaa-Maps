// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import type { PdfHandle } from '@/core/pdf/engine'
import { widthFactor } from '@/core/pdf/pressure'
import type { MarkupObject, PdfSource } from '@/core/pdf/types'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { forgetStylus, pointerMayDraw, noteStylus } from '../markup/layers'
import { closeFile, openFile } from '../session'
import { useEditor } from '../store'
import { PageLayers } from './layers'
import { forgetPen, getPen, resetPen, setPen } from './penPrefs'

/**
 * The pen with synthetic pointer events: stylus pressure, straight-angle correction (hold still 0.6 s), palm rejection and "stylus only".
 * These test the logic. What only a real tablet and stylus can show (does the pen report pressure, does a palm look like a big touch,
 * how a finger and a pen feel together) is not covered here.
 */
let t = 1_700_000_000_000
const st = () => useEditor.getState()
const source: PdfSource = { id: 's1', name: 'a.pdf', size: 10, hash: 'h', pages: 10, addedAt: 1 }
const box = { w: 600, h: 800, scale: 1, rotation: 0 as const }
const handle = {} as PdfHandle
const markups = () => Object.values(st().pdf.markup) as MarkupObject[]

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
  const f = await repo.create({ type: 'map', name: 'Pen', content: buildStarterContent('blank') })
  await openFile(f.id, repo)
})
afterEach(async () => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  await closeFile()
})

function layer(tool: 'pen' | 'lasso' = 'pen') {
  act(() => useEditor.setState({ pdfPanel: { ...st().pdfPanel, tool } }))
  const r = render(
    <div data-page="1">
      <PageLayers source={source} handle={handle} n={1} box={box} lines={null} />
    </div>
  )
  return { ...r, draw: r.container.querySelector('[data-draw-layer]') as HTMLElement }
}

type Init = { pointerType?: string; pressure?: number; width?: number; height?: number }
const at = (x: number, y: number, init: Init = {}) => ({ clientX: x, clientY: y, pointerId: 1, button: 0, pointerType: 'mouse', pressure: 0.5, ...init })

/** A stroke through pixel points; returns the layer so the test can lift the pen when it likes. */
function stroke(el: HTMLElement, pts: [number, number][], init: Init | ((i: number) => Init) = {}) {
  const get = (i: number) => (typeof init === 'function' ? init(i) : init)
  fireEvent.pointerDown(el, at(pts[0]![0], pts[0]![1], get(0)))
  pts.slice(1).forEach((p, i) => fireEvent.pointerMove(el, at(p[0], p[1], get(i + 1))))
}
const line = (x0: number, y0: number, x1: number, y1: number, n = 12): [number, number][] => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n + Math.sin(i * 3) * 0.8])
const lift = (el: HTMLElement) => fireEvent.pointerUp(el, at(0, 0))

describe('the pen: a stroke', () => {
  it('a mouse stroke makes one pen markup with the chosen width and no pressure', () => {
    const { draw } = layer()
    stroke(draw, [[100, 100], [140, 130], [180, 120], [220, 160], [260, 150]])
    lift(draw)
    expect(markups()).toHaveLength(1)
    const m = markups()[0] as MarkupObject
    expect(m).toMatchObject({ kind: 'pen', width: 0.004 })
    expect(m.points!.length).toBeGreaterThan(3)
    expect(m.pressure).toBeUndefined()
  })

  it('finer thickness: half steps are kept', () => {
    act(() => useEditor.setState({ pdfPanel: { ...st().pdfPanel, styles: { ...st().pdfPanel.styles, pen: { ...st().pdfPanel.styles.pen, size: 0.5 } } } }))
    const { draw } = layer()
    stroke(draw, [[100, 100], [140, 130], [180, 120], [220, 160]])
    lift(draw)
    expect((markups()[0] as MarkupObject).width).toBe(0.0005)
  })
})

describe('stylus pressure', () => {
  const pen = (i: number): Init => ({ pointerType: 'pen', pressure: [0.2, 0.4, 0.8, 1, 0.6, 0.3][i % 6] })
  const pts: [number, number][] = [[100, 100], [140, 130], [180, 120], [220, 160], [260, 150], [300, 170]]

  it('a pen that senses pressure stores one reading per point, rounded to two decimals', () => {
    const { draw } = layer()
    stroke(draw, pts, pen)
    lift(draw)
    const m = markups()[0] as MarkupObject
    expect(m.kind).toBe('pen')
    expect(m.pressure).toHaveLength(m.points!.length)
    expect(m.pressure![0]).toBeCloseTo(0.2)
    expect(m.pressure!.every((p) => p >= 0 && p <= 1 && Math.abs(p * 100 - Math.round(p * 100)) < 1e-9)).toBe(true)
  })

  it('is drawn thicker where it was pressed harder', () => {
    const { draw, container } = layer()
    stroke(draw, pts, pen)
    lift(draw)
    const g = container.querySelector('g[data-pressure]')
    expect(g).toBeTruthy()
    const widths = [...(g as Element).querySelectorAll('line')].map((l) => Number(l.getAttribute('stroke-width')))
    expect(widths).toHaveLength(pts.length - 1)
    expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths) * 1.5)
  })

  it('half pressure gives exactly the width chosen on the bar', () => {
    expect(widthFactor(0.5)).toBeCloseTo(1, 10)
    expect(widthFactor(0)).toBeLessThan(widthFactor(1))
  })

  it('a pen that reports a steady 0.5 (no pressure sensing) stores none', () => {
    const { draw } = layer()
    stroke(draw, pts, { pointerType: 'pen', pressure: 0.5 })
    lift(draw)
    expect((markups()[0] as MarkupObject).pressure).toBeUndefined()
  })

  it('with Pressure turned off, none is stored', () => {
    setPen({ pressure: false })
    const { draw } = layer()
    stroke(draw, pts, pen)
    lift(draw)
    expect((markups()[0] as MarkupObject).pressure).toBeUndefined()
  })

  it('a damaged pressure list is ignored and the stroke still shows as one line', () => {
    const { container } = layer()
    act(() => {
      useEditor.setState({ pdf: { ...st().pdf, markup: { m1: { id: 'm1', sourceId: 's1', page: 1, kind: 'pen', color: '#f00', width: 0.004, points: [[0.1, 0.1], [0.2, 0.2], [0.3, 0.2]], pressure: [0.5], createdAt: 1 } } } })
    })
    expect(container.querySelector('polyline')).toBeTruthy()
    expect(container.querySelector('g[data-pressure]')).toBeNull()
  })
})

describe('palm rejection and "Stylus only"', () => {
  const drawOne = (el: HTMLElement, init: Init) => {
    stroke(el, [[100, 100], [140, 130], [180, 120], [220, 160]], init)
    lift(el)
  }

  it('a finger draws when no pen has been used', () => {
    const { draw } = layer()
    drawOne(draw, { pointerType: 'touch' })
    expect(markups()).toHaveLength(1)
  })

  it('once a pen has been used, a finger (a resting hand) does not draw', () => {
    const { draw } = layer()
    drawOne(draw, { pointerType: 'pen' })
    drawOne(draw, { pointerType: 'touch' })
    expect(markups()).toHaveLength(1)
  })

  it('a very large touch (a palm) does not draw, an ordinary fingertip does', () => {
    const { draw } = layer()
    drawOne(draw, { pointerType: 'touch', width: 70, height: 80 })
    expect(markups()).toHaveLength(0)
    drawOne(draw, { pointerType: 'touch', width: 12, height: 12 })
    expect(markups()).toHaveLength(1)
  })

  it('with palm rejection off, a finger draws even after a pen', () => {
    setPen({ palm: false })
    const { draw } = layer()
    drawOne(draw, { pointerType: 'pen' })
    drawOne(draw, { pointerType: 'touch', width: 70, height: 70 })
    expect(markups()).toHaveLength(2)
  })

  it('Stylus only: a finger never draws, a pen and a mouse do', () => {
    setPen({ stylusOnly: true })
    const { draw } = layer()
    drawOne(draw, { pointerType: 'touch' })
    expect(markups()).toHaveLength(0)
    drawOne(draw, { pointerType: 'mouse' })
    drawOne(draw, { pointerType: 'pen' })
    expect(markups()).toHaveLength(2)
  })

  it('the finger is left to scroll: the layer lets panning through', () => {
    setPen({ stylusOnly: true })
    const { draw } = layer()
    expect(draw.style.touchAction).toBe('pan-x pan-y')
  })

  it('a touch right after the pen is lifted is still a palm (one second)', () => {
    forgetStylus()
    setPen({ palm: true })
    noteStylus()
    const now = Date.now()
    expect(pointerMayDraw({ pointerType: 'touch' }, true, now + 300)).toBe(false)
    expect(pointerMayDraw({ pointerType: 'mouse' }, true, now)).toBe(true)
    expect(pointerMayDraw({ pointerType: 'pen' }, true, now)).toBe(true)
  })

  it('the settings start as planned and can be put back', () => {
    expect(getPen()).toEqual({ pressure: true, snapLines: true, snapShapes: true, palm: true, stylusOnly: false })
    setPen({ stylusOnly: true, palm: false })
    resetPen()
    expect(getPen().stylusOnly).toBe(false)
    expect(getPen().palm).toBe(true)
  })
})

describe('straight-angle correction: hold the pen still', () => {
  const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

  it('a nearly straight stroke held still for 0.6 s becomes a straight line (and the pen can lift)', () => {
    const { draw, container } = layer()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    stroke(draw, line(100, 200, 420, 204))
    wait(650)
    expect(container.querySelector('[data-draft="snap-line"]')).toBeTruthy() // shown as the line it will become
    lift(draw)
    expect(markups()).toHaveLength(1)
    const m = markups()[0] as MarkupObject
    expect(m.kind).toBe('line')
    expect(m.points).toHaveLength(2)
    expect((m.points![0] as [number, number])[1]).toBeCloseTo((m.points![1] as [number, number])[1], 10) // exactly flat
  })

  it('lifted before 0.6 s it stays a pen stroke', () => {
    const { draw } = layer()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    stroke(draw, line(100, 200, 420, 204))
    wait(500)
    lift(draw)
    expect((markups()[0] as MarkupObject).kind).toBe('pen')
  })

  it('a pen that keeps moving never snaps; the wait starts again after each real move', () => {
    const { draw } = layer()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.pointerDown(draw, at(100, 200))
    for (let i = 1; i <= 12; i++) {
      fireEvent.pointerMove(draw, at(100 + i * 25, 200 + (i % 2)))
      wait(400)
    }
    lift(draw)
    expect((markups()[0] as MarkupObject).kind).toBe('pen')
  })

  it('a wobble of a couple of pixels counts as still', () => {
    const { draw } = layer()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    stroke(draw, line(100, 200, 420, 204))
    fireEvent.pointerMove(draw, at(421, 205))
    wait(300)
    fireEvent.pointerMove(draw, at(420, 204))
    wait(350)
    lift(draw)
    expect((markups()[0] as MarkupObject).kind).toBe('line')
  })

  it('a hooked end becomes an arrow', () => {
    const { draw } = layer()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    stroke(draw, [...line(100, 300, 420, 300, 16), [405, 290], [392, 280], [385, 270]])
    wait(650)
    lift(draw)
    expect((markups()[0] as MarkupObject).kind).toBe('arrow')
  })

  it('a nearly closed rectangle becomes a clean rectangle', () => {
    const rect = [...line(100, 100, 400, 100, 8), ...line(400, 100, 400, 300, 8), ...line(400, 300, 100, 300, 8), ...line(100, 300, 104, 108, 4)] as [number, number][]
    const { draw } = layer()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    stroke(draw, rect)
    wait(650)
    lift(draw)
    expect((markups()[0] as MarkupObject).kind).toBe('rect')
    expect((markups()[0] as MarkupObject).rects).toHaveLength(1)
  })

  it('a nearly closed round loop becomes an ellipse', () => {
    const { draw } = layer()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const loop = Array.from({ length: 49 }, (_, i) => [300 + 160 * Math.cos((i / 48) * 2 * Math.PI), 400 + 90 * Math.sin((i / 48) * 2 * Math.PI)] as [number, number])
    stroke(draw, loop)
    wait(650)
    lift(draw)
    expect((markups()[0] as MarkupObject).kind).toBe('ellipse')
  })

  it('after a line snaps, the pen still steers its end', () => {
    const { draw } = layer()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    stroke(draw, line(100, 200, 420, 204))
    wait(650)
    fireEvent.pointerMove(draw, at(480, 330))
    lift(draw)
    const m = markups()[0] as MarkupObject
    expect(m.kind).toBe('line')
    expect((m.points![1] as [number, number])[0] * 600).toBeCloseTo(480, 0)
    expect((m.points![1] as [number, number])[1] * 800).toBeCloseTo(330, 0)
  })

  it('walking away from a snapped shape gives the stroke back as a drawing', () => {
    const { draw } = layer()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const loop = Array.from({ length: 49 }, (_, i) => [300 + 160 * Math.cos((i / 48) * 2 * Math.PI), 400 + 90 * Math.sin((i / 48) * 2 * Math.PI)] as [number, number])
    stroke(draw, loop)
    wait(650)
    fireEvent.pointerMove(draw, at(560, 600))
    lift(draw)
    expect((markups()[0] as MarkupObject).kind).toBe('pen')
  })

  it('each kind of snapping can be switched off on its own', () => {
    setPen({ snapLines: false })
    const { draw } = layer()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    stroke(draw, line(100, 200, 420, 204))
    wait(700)
    lift(draw)
    expect((markups()[0] as MarkupObject).kind).toBe('pen')
  })

  it('a scribble stays a scribble however long the pen rests', () => {
    const { draw } = layer()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    stroke(draw, Array.from({ length: 40 }, (_, i) => [200 + Math.sin(i * 1.3) * 60, 200 + Math.cos(i * 0.9) * 60 + i * 2] as [number, number]))
    wait(900)
    lift(draw)
    expect((markups()[0] as MarkupObject).kind).toBe('pen')
  })

  it('the other drawing tools are not affected (only the pen snaps)', () => {
    act(() => useEditor.setState({ pdfPanel: { ...st().pdfPanel, tool: 'rect' } }))
    const r = render(
      <div data-page="1">
        <PageLayers source={source} handle={handle} n={1} box={box} lines={null} />
      </div>
    )
    const el = r.container.querySelector('[data-draw-layer]') as HTMLElement
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    stroke(el, [[100, 100], [300, 130]])
    wait(900)
    expect(r.container.querySelector('[data-draft^="snap"]')).toBeNull()
    lift(el)
    expect((markups()[0] as MarkupObject).kind).toBe('rect')
  })
})
