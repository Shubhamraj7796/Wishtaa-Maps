// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { addChild, setImage } from '@/core/model/commands'
import { addPictureMark, marksOf, rotatePicture } from '@/core/model/pictureEdit'
import { fakeCodec, source } from '../../test/fakeCodec'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { Canvas } from '../canvas/Canvas'
import { imageStore } from '../images'
import { setPictureCodec } from '../pictures/flow'
import { enterEditMode, enterReadMode } from '../readmode'
import { closeFile, mapDoc, openFile } from '../session'
import { useEditor } from '../store'
import { Lightbox } from '../ui/Dialogs'
import { OutlineView } from '../ui/OutlineView'

let t = 1_700_000_000_000
let id = ''
const st = () => useEditor.getState()
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 40))))
const img = () => st().topics[id]?.image
const { codec } = fakeCodec({ webp: true })

URL.createObjectURL = vi.fn(() => 'blob:fake') as never
URL.revokeObjectURL = vi.fn()

beforeEach(async () => {
  installMemoryLocalStorage()
  setPictureCodec(codec)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 700 })
  const repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'map', name: 'Viewer', content: buildStarterContent('blank') })
  await openFile(f.id, repo)
  await imageStore.put({ id: 'pic-1', width: 800, height: 400, type: 'image/png', size: 5, blob: source(800, 400, 'photo', 6000, 'image/png') })
  id = addChild(mapDoc, st().rootId, 'Chart')
  setImage(mapDoc, id, { imageId: 'pic-1', width: 400, height: 200 })
  await settle()
  mapDoc.undo.clear()
  act(() => useEditor.setState({ selected: [id], lightbox: 'pic-1', canUndo: false }))
})
afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  await closeFile()
})

describe('rotation is shown everywhere the picture is', () => {
  it('on the map, in the Outline and in the viewer, turned as the topic says (and a plain picture stays a plain image)', async () => {
    act(() => useEditor.setState({ lightbox: null }))
    const canvas = render(<Canvas />)
    const outline = render(<OutlineView />)
    await settle()
    expect(canvas.container.querySelector(`[data-image="${id}"] [data-face]`)).toBeNull() // untouched: a plain <img>
    expect(outline.container.querySelector('[data-outline-picture] [data-face]')).toBeNull()
    act(() => void rotatePicture(mapDoc, id, 90))
    await settle()
    expect(img()).toMatchObject({ rotation: 90, width: 200, height: 400 })
    expect(canvas.container.querySelector(`[data-image="${id}"] [data-face="90"]`)).not.toBeNull()
    expect(outline.container.querySelector('[data-outline-picture] [data-face="90"]')).not.toBeNull()
    const turned = (canvas.container.querySelector(`[data-image="${id}"] [data-face="90"] > div`) as HTMLElement).style.transform
    expect(turned).toContain('rotate(90deg)')
    cleanup()
    act(() => useEditor.setState({ lightbox: 'pic-1' }))
    const viewer = render(<Lightbox />)
    await settle()
    expect((viewer.container.querySelector('[data-picture-box] img')?.parentElement as HTMLElement).style.transform).toContain('rotate(90deg)')
  })

  it('marks are drawn on the picture, in the picture’s own coordinates, on the map and in the viewer', async () => {
    act(() => void addPictureMark(mapDoc, id, { kind: 'rect', color: '#ef4444', rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }], width: 0.004 }))
    act(() => void rotatePicture(mapDoc, id, 90))
    act(() => useEditor.setState({ lightbox: null }))
    const canvas = render(<Canvas />)
    await settle()
    const rect = canvas.container.querySelector(`[data-image="${id}"] [data-markup-layer] rect`) as SVGRectElement
    expect(rect).not.toBeNull()
    // The stored picture is laid out upright at its own size (400 by 200 once turned back from 200 by 400), and the mark is placed in it.
    expect(Number(rect.getAttribute('x'))).toBeCloseTo(0.1 * 400)
    expect(Number(rect.getAttribute('y'))).toBeCloseTo(0.2 * 200)
    expect(Number(rect.getAttribute('width'))).toBeCloseTo(0.3 * 400)
    cleanup()
    act(() => useEditor.setState({ lightbox: 'pic-1' }))
    const viewer = render(<Lightbox />)
    await settle()
    expect(viewer.container.querySelector('[data-picture-box] [data-markup-layer] rect')).not.toBeNull()
    // Show markup off hides them without deleting.
    fireEvent.click(screen.getByLabelText('Show markup'))
    expect(viewer.container.querySelector('[data-picture-box] [data-markup-layer]')).toBeNull()
    expect(marksOf(img()).length).toBe(1)
    expect(img()?.markHidden).toBe(true)
  })
})

describe('the viewer', () => {
  it('turns and flips from its toolbar, one undo step each, and Undo and Redo bring them back', async () => {
    render(<Lightbox />)
    await settle()
    const tools = screen.getByRole('toolbar', { name: 'Picture actions' })
    fireEvent.click(within(tools).getByRole('button', { name: 'Rotate right' }))
    expect(img()?.rotation).toBe(90)
    fireEvent.click(within(tools).getByRole('button', { name: 'Rotate left' }))
    fireEvent.click(within(tools).getByRole('button', { name: 'Rotate left' }))
    expect(img()?.rotation).toBe(270)
    fireEvent.click(within(tools).getByRole('button', { name: 'Flip left to right' }))
    expect(img()?.flipX).toBe(true)
    expect(mapDoc.undo.undoStack.length).toBe(4)
    act(() => void mapDoc.undo.undo())
    expect(img()?.flipX).toBeUndefined()
    act(() => void mapDoc.undo.redo())
    expect(img()?.flipX).toBe(true)
  })

  it('has the same floating markup toolbar as a PDF, with each tool’s own colour, and keeps it in Edit mode only', async () => {
    const first = render(<Lightbox />)
    await settle()
    const bar = screen.getByRole('toolbar', { name: 'Picture markup tools' })
    for (const name of ['Select text or markup', 'Highlight', 'Underline', 'Strikethrough', 'Pen', 'Text box', 'Eraser']) expect(within(bar).getAllByRole('button').some((b) => (b.getAttribute('aria-label') ?? '').startsWith(name)), name).toBe(true)
    expect(within(bar).getByRole('button', { name: 'Pen' }).querySelector('span')?.getAttribute('style')).toContain('rgb(239, 68, 68)')
    first.unmount()
    await act(async () => void (await enterReadMode()))
    render(<Lightbox />)
    await settle()
    expect(screen.queryByRole('toolbar', { name: 'Picture markup tools' })).toBeNull()
    expect(screen.queryByRole('toolbar', { name: 'Picture actions' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Picture preview' })).toBeTruthy() // viewing only
    await act(async () => void enterEditMode())
  })

  it('a mouse draws with the Pen: one mark, one undo step, stored on the picture reference only', async () => {
    const { container } = render(<Lightbox />)
    await settle()
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Picture markup tools' })).getByRole('button', { name: 'Pen' }))
    const box = container.querySelector('[data-picture-box]') as HTMLElement
    box.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    const layer = container.querySelector('[data-draw-layer="pen"]') as HTMLElement
    expect(layer).not.toBeNull()
    layer.setPointerCapture = () => undefined
    fireEvent.pointerDown(layer, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 40, clientY: 20 })
    for (let i = 1; i <= 8; i++) fireEvent.pointerMove(layer, { pointerId: 1, pointerType: 'mouse', clientX: 40 + i * 20, clientY: 20 + i * 10 })
    fireEvent.pointerUp(layer, { pointerId: 1, pointerType: 'mouse' })
    const marks = marksOf(img())
    expect(marks).toHaveLength(1)
    expect(marks[0]).toMatchObject({ kind: 'pen', color: '#ef4444' })
    expect(marks[0]?.points?.[0]?.[0]).toBeCloseTo(0.1, 5) // 40 of 400 across, 20 of 200 down
    expect(marks[0]?.points?.[0]?.[1]).toBeCloseTo(0.1, 5)
    expect(mapDoc.undo.undoStack.length).toBe(1)
    expect(img()?.imageId).toBe('pic-1')
  })

  it('a finger does not draw (it pans and zooms) unless "Finger draws" is on', async () => {
    const { container } = render(<Lightbox />)
    await settle()
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Picture markup tools' })).getByRole('button', { name: 'Pen' }))
    const layer = container.querySelector('[data-draw-layer="pen"]') as HTMLElement
    layer.setPointerCapture = () => undefined
    const box = container.querySelector('[data-picture-box]') as HTMLElement
    box.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    const stroke = () => {
      fireEvent.pointerDown(layer, { pointerId: 2, pointerType: 'touch', button: 0, clientX: 40, clientY: 20 })
      for (let i = 1; i <= 5; i++) fireEvent.pointerMove(layer, { pointerId: 2, pointerType: 'touch', clientX: 40 + i * 20, clientY: 20 })
      fireEvent.pointerUp(layer, { pointerId: 2, pointerType: 'touch' })
    }
    stroke()
    expect(marksOf(img())).toHaveLength(0)
    fireEvent.click(screen.getByLabelText('Finger draws'))
    stroke()
    expect(marksOf(img())).toHaveLength(1)
  })

  it('Esc closes a tool first, then the viewer; Left and Right step through the pictures; the wheel zooms', async () => {
    const other = addChild(mapDoc, st().rootId, 'Second')
    await imageStore.put({ id: 'pic-2', width: 100, height: 100, type: 'image/png', size: 5, blob: source(100, 100, 'photo', 3000, 'image/png') })
    setImage(mapDoc, other, { imageId: 'pic-2', width: 100, height: 100 })
    await settle()
    const { container } = render(<Lightbox />)
    await settle()
    const dialog = screen.getByRole('dialog', { name: 'Picture preview' })
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Picture markup tools' })).getByRole('button', { name: 'Pen' }))
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(st().lightbox).toBe('pic-1') // only the tool stopped
    expect(container.querySelector('[data-draw-layer]')).toBeNull()
    fireEvent.keyDown(dialog, { key: 'ArrowRight' })
    expect(st().lightbox).toBe('pic-2')
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' })
    expect(st().lightbox).toBe('pic-1')
    const zoomBefore = screen.getByRole('button', { name: 'Actual size' }).textContent
    fireEvent.wheel(container.querySelector('[data-viewer-stage]') as HTMLElement, { deltaY: -300, clientX: 500, clientY: 300 })
    expect(screen.getByRole('button', { name: 'Actual size' }).textContent).not.toBe(zoomBefore)
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(st().lightbox).toBeNull()
  })
})

describe('making a turn permanent', () => {
  beforeEach(() => {
    // jsdom has no canvas: a stand-in that produces a picture of the size drawn.
    vi.stubGlobal('createImageBitmap', async () => ({ width: 800, height: 400, close: () => undefined }))
    const ctx = new Proxy({}, { get: (_t, p) => (p === 'canvas' ? {} : () => undefined), set: () => true })
    HTMLCanvasElement.prototype.getContext = (() => ctx) as never
    HTMLCanvasElement.prototype.toBlob = function (this: HTMLCanvasElement, cb: BlobCallback) {
      cb(source(this.width, this.height, 'photo', 6000, 'image/png'))
    } as never
  })

  it('stores ONE new picture, points the topic at it with the turn gone, in one undo step; the original stays', async () => {
    act(() => void rotatePicture(mapDoc, id, 90))
    act(() => void addPictureMark(mapDoc, id, { kind: 'pen', color: '#ef4444', points: [[0.1, 0.1], [0.5, 0.5]], width: 0.004 }))
    await settle()
    mapDoc.undo.clear()
    render(<Lightbox />)
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Make permanent…' }))
    const dialog = screen.getByRole('dialog', { name: 'Make permanent' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make permanent' }))
    await waitFor(() => expect(img()?.imageId).not.toBe('pic-1'))
    expect(img()?.rotation).toBeUndefined()
    expect(img()?.marks).toBeUndefined() // drawn into the new picture
    expect(img()).toMatchObject({ width: 200, height: 400 }) // the shown size is unchanged
    expect(mapDoc.undo.undoStack.length).toBe(1)
    expect(await imageStore.getMeta('pic-1')).toBeTruthy() // the original is untouched
    expect(await imageStore.getMeta(img()?.imageId as string)).toBeTruthy()
    // Doing the same again produces the same bytes: still one new picture.
    act(() => void mapDoc.undo.undo())
    expect(img()?.imageId).toBe('pic-1')
    expect(img()?.rotation).toBe(90)
  })

  it('asks "this topic only or all topics" when others show the picture the same way', async () => {
    const twin = addChild(mapDoc, st().rootId, 'Twin')
    setImage(mapDoc, twin, { imageId: 'pic-1', width: 400, height: 200 })
    const other = addChild(mapDoc, st().rootId, 'Other')
    setImage(mapDoc, other, { imageId: 'pic-1', width: 400, height: 200 })
    act(() => void rotatePicture(mapDoc, id, 90))
    act(() => void rotatePicture(mapDoc, twin, 90)) // looks the same as the first
    await settle()
    mapDoc.undo.clear()
    render(<Lightbox />)
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Make permanent…' }))
    const dialog = screen.getByRole('dialog', { name: 'Make permanent' })
    fireEvent.click(within(dialog).getByLabelText('All 2 topics showing it the same way'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make permanent' }))
    await waitFor(() => expect(img()?.imageId).not.toBe('pic-1'))
    expect(st().topics[twin]?.image?.imageId).toBe(img()?.imageId) // the one that looked the same
    expect(st().topics[twin]?.image?.rotation).toBeUndefined()
    expect(st().topics[other]?.image?.imageId).toBe('pic-1') // the one that looked different is untouched
  })
})
