// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { useSettings } from '@/stores/settings'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { ZoomBox } from '../ui/ZoomBox'
import { closeFile, openFile } from '../session'
import { useEditor } from '../store'
import { Canvas } from './Canvas'

let t = 1_700_000_000_000
const raf: FrameRequestCallback[] = []

beforeEach(async () => {
  installMemoryLocalStorage()
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => raf.push(cb))
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  const repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'kb', name: 'Nav', content: buildStarterContent('kb') })
  await openFile(f.id, repo)
  useSettings.setState({ mouseWheel: 'move', wheelHintSeen: true })
  act(() => useEditor.setState({ viewport: { x: 0, y: 0, k: 1 }, canvasSize: { w: 800, h: 600 } }))
})
afterEach(async () => {
  cleanup()
  raf.length = 0
  vi.unstubAllGlobals()
  await closeFile()
})

const tree = () => screen.getByRole('tree', { name: 'Mind map canvas' })
const frame = () => act(() => void raf.splice(0).forEach((cb) => cb(0)))
const vp = () => useEditor.getState().viewport

function wheel(el: Element, init: WheelEventInit) {
  const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })
  act(() => void el.dispatchEvent(e))
  return e
}

describe('the canvas: wheel and trackpad', () => {
  it('two-finger scroll moves the map, in both directions, and does not zoom', () => {
    render(<Canvas />)
    const e = wheel(tree(), { deltaX: 10.5, deltaY: 30.25 })
    expect(e.defaultPrevented).toBe(true)
    frame()
    expect(vp()).toMatchObject({ x: -10.5, y: -30.25, k: 1 })
  })

  it('Ctrl + wheel (a pinch) zooms around the pointer and stops the browser zooming the page', () => {
    render(<Canvas />)
    const e = wheel(tree(), { ctrlKey: true, deltaY: -8.5, clientX: 400, clientY: 300 })
    expect(e.defaultPrevented).toBe(true)
    frame()
    expect(vp().k).toBeGreaterThan(1)
    // the world point under the pointer did not move
    expect((400 - vp().x) / vp().k).toBeCloseTo(400, 3)
  })

  it('Shift + wheel moves sideways', () => {
    render(<Canvas />)
    wheel(tree(), { shiftKey: true, deltaY: 40.5 })
    frame()
    expect(vp()).toMatchObject({ x: -40.5, y: 0 })
  })

  it('several events in one frame are applied together, once', () => {
    render(<Canvas />)
    for (let i = 0; i < 6; i++) wheel(tree(), { deltaY: 5.5 })
    expect(vp().y).toBe(0) // nothing yet: waiting for the frame
    frame()
    expect(vp().y).toBeCloseTo(-33)
    expect(raf).toHaveLength(0)
  })

  it('a mouse-wheel notch follows the setting: moves by default, zooms when set to Zoom', () => {
    render(<Canvas />)
    wheel(tree(), { deltaY: 100, clientX: 200, clientY: 200 })
    frame()
    expect(vp()).toMatchObject({ y: -100, k: 1 })
    act(() => useEditor.setState({ viewport: { x: 0, y: 0, k: 1 } }))
    act(() => useSettings.setState({ mouseWheel: 'zoom' }))
    wheel(tree(), { deltaY: -100, clientX: 200, clientY: 200 })
    frame()
    expect(vp().k).toBeGreaterThan(1)
  })

  it('a trackpad scroll still moves the map when the wheel is set to Zoom', () => {
    act(() => useSettings.setState({ mouseWheel: 'zoom' }))
    render(<Canvas />)
    wheel(tree(), { deltaY: 7.5 })
    frame()
    expect(vp()).toMatchObject({ y: -7.5, k: 1 })
  })

  it('never zooms past 2% or 400%', () => {
    render(<Canvas />)
    for (let i = 0; i < 80; i++) wheel(tree(), { ctrlKey: true, deltaY: -100 })
    frame()
    expect(vp().k).toBe(4)
    for (let i = 0; i < 200; i++) wheel(tree(), { ctrlKey: true, deltaY: 100 })
    frame()
    expect(vp().k).toBe(0.02)
  })

  it('leaves wheel events in a text field alone: no preventDefault, no movement', () => {
    render(
      <div>
        <Canvas />
      </div>
    )
    const input = document.createElement('input')
    tree().appendChild(input)
    const e = wheel(input, { deltaY: 50.5 })
    expect(e.defaultPrevented).toBe(false)
    frame()
    expect(vp()).toMatchObject({ x: 0, y: 0 })
  })

  it('shows the Ctrl + wheel tip once, the first time the map is moved by the wheel', () => {
    act(() => useSettings.setState({ wheelHintSeen: false }))
    render(<Canvas />)
    wheel(tree(), { deltaY: 5.5 })
    expect(useEditor.getState().notice?.text).toMatch(/Ctrl/)
    expect(useSettings.getState().wheelHintSeen).toBe(true)
    act(() => useEditor.setState({ notice: null }))
    wheel(tree(), { deltaY: 5.5 })
    expect(useEditor.getState().notice).toBeNull()
  })
})

describe('the zoom percentage', () => {
  it('click it, type a value and press Enter', async () => {
    render(<ZoomBox />)
    fireEvent.click(screen.getByRole('button', { name: /Zoom 100 percent/ }))
    const box = screen.getByRole('textbox', { name: 'Zoom percentage' })
    fireEvent.change(box, { target: { value: '250' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => expect(vp().k).toBeCloseTo(2.5))
  })

  it('keeps typed values inside 2% to 400%, and Esc cancels', async () => {
    render(<ZoomBox />)
    fireEvent.click(screen.getByRole('button', { name: /Zoom/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Zoom percentage' }), { target: { value: '9999' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Zoom percentage' }), { key: 'Enter' })
    await waitFor(() => expect(vp().k).toBe(4))
    fireEvent.click(screen.getByRole('button', { name: /Zoom/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Zoom percentage' }), { target: { value: '50' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Zoom percentage' }), { key: 'Escape' })
    expect(vp().k).toBe(4)
  })
})

describe('the Mouse wheel preference is remembered', () => {
  it('is saved with the other settings on this device', () => {
    useSettings.getState().setMouseWheel('zoom')
    expect(JSON.parse(localStorage.getItem('wishtaamaps:settings') ?? '{}').mouseWheel).toBe('zoom')
  })
})
