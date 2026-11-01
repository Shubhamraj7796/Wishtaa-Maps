// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { addChild, setImage } from '@/core/model/commands'
import { installMemoryLocalStorage } from '../test/memoryStorage'
import * as A from './actions'
import { imageStore } from './images'
import { OUTLINE_MAX_ZOOM, OUTLINE_MIN_ZOOM, OUTLINE_ZOOM_KEY, readOutlineZoom } from './navigation'
import { enterReadMode } from './readmode'
import { COMMANDS } from './registry'
import { closeFile, mapDoc, openFile } from './session'
import { useEditor } from './store'
import { OutlineView } from './ui/OutlineView'
import { ZoomBox } from './ui/ZoomBox'

let t = 1_700_000_000_000
const st = () => useEditor.getState()
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))))
const cmd = (id: string) => COMMANDS.find((c) => c.id === id)!
URL.createObjectURL = vi.fn(() => 'blob:fake') as never
URL.revokeObjectURL = vi.fn()

beforeEach(async () => {
  installMemoryLocalStorage()
  const repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'map', name: 'Zoom', content: buildStarterContent('blank') })
  await openFile(f.id, repo)
  act(() => useEditor.setState({ view: 'outline', outlineZoom: 1 }))
  await settle()
})
afterEach(async () => {
  cleanup()
  await closeFile()
})

describe('zoom in the Outline (the bottom bar, the shortcuts and the percentage box)', () => {
  it('the zoom buttons zoom the outline, not the map, while the outline is showing', () => {
    const map = st().viewport.k
    act(() => A.zoomBy(1.25))
    expect(st().outlineZoom).toBe(1.25)
    act(() => A.zoomBy(0.8))
    expect(st().outlineZoom).toBe(1)
    expect(st().viewport.k).toBe(map) // the map was not touched
  })

  it('on the map they zoom the map, and leave the outline as it was', () => {
    act(() => useEditor.setState({ view: 'map', outlineZoom: 1.5 }))
    const before = st().viewport.k
    act(() => A.zoomBy(1.25))
    expect(st().viewport.k).toBeCloseTo(before * 1.25)
    expect(st().outlineZoom).toBe(1.5)
  })

  it('stays between 50% and 300%', () => {
    for (let i = 0; i < 20; i++) act(() => A.zoomBy(1.25))
    expect(st().outlineZoom).toBe(OUTLINE_MAX_ZOOM)
    for (let i = 0; i < 30; i++) act(() => A.zoomBy(0.8))
    expect(st().outlineZoom).toBe(OUTLINE_MIN_ZOOM)
  })

  it('a typed percentage works, and 100% / Fit put it back', () => {
    act(() => A.setZoomPercent(200))
    expect(st().outlineZoom).toBe(2)
    act(() => A.zoomTo100())
    expect(st().outlineZoom).toBe(1)
    act(() => A.setZoomPercent(150))
    act(() => A.fitToScreen())
    expect(st().outlineZoom).toBe(1)
    act(() => A.setZoomPercent(9999))
    expect(st().outlineZoom).toBe(OUTLINE_MAX_ZOOM)
  })

  it('the keyboard shortcuts (Ctrl+=, Ctrl+-, Alt+Z, Ctrl+0) do the same', () => {
    act(() => cmd('zoomIn').run())
    expect(st().outlineZoom).toBe(1.25)
    act(() => cmd('zoomOut').run())
    act(() => cmd('zoomOut').run())
    expect(st().outlineZoom).toBe(0.8)
    act(() => cmd('zoom100').run())
    expect(st().outlineZoom).toBe(1)
    act(() => cmd('zoomIn').run())
    act(() => cmd('fit').run())
    expect(st().outlineZoom).toBe(1)
  })

  it('the percentage in the footer shows the outline zoom while the outline is showing, and says so', () => {
    act(() => useEditor.setState({ outlineZoom: 1.5 }))
    render(<ZoomBox />)
    const b = screen.getByRole('button', { name: /Outline zoom 150 percent/ })
    expect(b.textContent).toBe('150%')
    act(() => useEditor.setState({ view: 'map' }))
    expect(screen.getByRole('button', { name: /^Zoom \d+ percent/ })).toBeTruthy()
  })

  it('is remembered on this device', () => {
    act(() => A.setZoomPercent(175))
    expect(localStorage.getItem(OUTLINE_ZOOM_KEY)).toBe('1.75')
    expect(readOutlineZoom()).toBe(1.75)
    localStorage.setItem(OUTLINE_ZOOM_KEY, 'nonsense')
    expect(readOutlineZoom()).toBe(1)
    localStorage.setItem(OUTLINE_ZOOM_KEY, '99')
    expect(readOutlineZoom()).toBe(OUTLINE_MAX_ZOOM)
  })

  it('works in Read mode too (it only changes what is shown)', async () => {
    await act(async () => void (await enterReadMode()))
    act(() => cmd('zoomIn').run())
    expect(st().outlineZoom).toBe(1.25)
  })
})

describe('the outline draws bigger', () => {
  async function withPicture() {
    await imageStore.put({ id: 'z1', width: 1280, height: 720, type: 'image/webp', size: 1, blob: new Blob(['x'], { type: 'image/webp' }) })
    const id = addChild(mapDoc, st().rootId, 'Chart')
    setImage(mapDoc, id, { imageId: 'z1', width: 640, height: 360 })
    await settle()
    return id
  }
  const row = (id: string) => document.querySelector(`[data-row="${id}"]`) as HTMLElement
  const pic = (id: string) => document.querySelector(`[data-row="${id}"] [data-outline-picture]`) as HTMLElement

  it('a row, its text and its picture are twice as big at 200%', async () => {
    const id = await withPicture()
    render(<OutlineView />)
    const h1 = parseFloat(row(id).style.height)
    expect(pic(id).style.width).toBe('320px')
    act(() => A.setZoomPercent(200))
    await settle()
    expect(parseFloat(row(id).style.height)).toBeCloseTo(h1 * 2, -1) // (a few pixels either way: the picture is fitted to the room the row has)
    expect((row(id).firstElementChild as HTMLElement).style.transform).toBe('scale(2)')
    expect(parseFloat(pic(id).style.width)).toBeGreaterThan(300) // drawn at 100% and scaled with its row
  })

  it('smaller at 50%, so more rows fit', async () => {
    const id = await withPicture()
    render(<OutlineView />)
    const h1 = parseFloat(row(id).style.height)
    act(() => A.setZoomPercent(50))
    await settle()
    expect(parseFloat(row(id).style.height)).toBeCloseTo(h1 / 2, -1)
  })

  it('zooming keeps the same place on screen (the scroll position grows with the zoom)', async () => {
    for (let i = 0; i < 100; i++) addChild(mapDoc, st().rootId, `T${i}`)
    await settle()
    const view = render(<OutlineView />)
    const scroller = view.container.querySelector('[role="region"]') as HTMLElement
    scroller.scrollTop = 600
    fireEvent.scroll(scroller)
    await settle()
    act(() => A.setZoomPercent(200))
    await settle()
    expect(scroller.scrollTop).toBe(1200)
  })

  it('Ctrl + wheel (and a trackpad pinch) zooms, and does not scroll the page; a plain wheel does not zoom', async () => {
    const view = render(<OutlineView />)
    const scroller = view.container.querySelector('[role="region"]') as HTMLElement
    const zoomIn = new WheelEvent('wheel', { deltaY: -120, ctrlKey: true, cancelable: true, bubbles: true })
    scroller.dispatchEvent(zoomIn)
    expect(zoomIn.defaultPrevented).toBe(true)
    expect(st().outlineZoom).toBeGreaterThan(1)
    const before = st().outlineZoom
    const plain = new WheelEvent('wheel', { deltaY: 120, cancelable: true, bubbles: true })
    scroller.dispatchEvent(plain)
    expect(plain.defaultPrevented).toBe(false)
    expect(st().outlineZoom).toBe(before)
  })

  it('two fingers on a touch screen zoom: spreading them zooms in, pinching zooms out', async () => {
    const view = render(<OutlineView />)
    const scroller = view.container.querySelector('[role="region"]') as HTMLElement
    const touches = (gap: number) => [
      { clientX: 100, clientY: 100, identifier: 1 },
      { clientX: 100 + gap, clientY: 100, identifier: 2 },
    ]
    fireEvent.touchStart(scroller, { touches: touches(100) })
    fireEvent.touchMove(scroller, { touches: touches(200) })
    expect(st().outlineZoom).toBe(2)
    fireEvent.touchMove(scroller, { touches: touches(100) })
    expect(st().outlineZoom).toBe(1)
    fireEvent.touchEnd(scroller, { touches: [] })
    fireEvent.touchMove(scroller, { touches: touches(300) }) // no pinch is running any more
    expect(st().outlineZoom).toBe(1)
  })

  it('a single finger still scrolls (only vertical panning is left to the browser)', () => {
    const view = render(<OutlineView />)
    expect((view.container.querySelector('[role="region"]') as HTMLElement).style.touchAction).toBe('pan-y')
  })
})
