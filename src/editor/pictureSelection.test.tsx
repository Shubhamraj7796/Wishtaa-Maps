// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { addChild, setImage } from '@/core/model/commands'
import { installMemoryLocalStorage } from '../test/memoryStorage'
import { Canvas } from './canvas/Canvas'
import { enterEditMode, enterReadMode } from './readmode'
import { COMMANDS } from './registry'
import { closeFile, mapDoc, openFile } from './session'
import { useEditor } from './store'

let t = 1_700_000_000_000
let now = 10_000
let id = ''
const st = () => useEditor.getState()
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))))
const escape = () => act(() => COMMANDS.find((c) => c.id === 'escape')?.run())

beforeEach(async () => {
  installMemoryLocalStorage()
  Object.assign(HTMLElement.prototype, { setPointerCapture: () => undefined, releasePointerCapture: () => undefined, hasPointerCapture: () => false })
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'map', name: 'Pictures', content: buildStarterContent('blank') })
  await openFile(f.id, repo)
  id = addChild(mapDoc, st().rootId, 'Chart')
  setImage(mapDoc, id, { imageId: 'pic-1', width: 200, height: 120 })
  await settle()
  act(() => useEditor.setState({ selected: [st().rootId], imageSelected: null }))
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await closeFile()
})

/** One press and release of the pointer on an element, `after` milliseconds after the last one. */
function press(el: Element, after = 1000) {
  now += after
  fireEvent.pointerDown(el, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 50 })
  fireEvent.pointerUp(el, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 50 })
}
const picture = (c: HTMLElement) => c.querySelector(`[data-image="${id}"]`) as HTMLElement
const topic = (c: HTMLElement) => c.querySelector(`[data-topic="${id}"]`) as HTMLElement
const text = (c: HTMLElement) => topic(c).querySelector('span.truncate, span.min-w-0') as HTMLElement

describe('selecting a topic with a picture (Map)', () => {
  it('a single click or tap on the picture selects only the topic: no frame, no handles, no picture toolbar', async () => {
    const { container } = render(<Canvas />)
    await settle()
    press(picture(container))
    expect(st().selected).toEqual([id])
    expect(st().imageSelected).toBeNull()
    expect(container.querySelector('[data-image] button[aria-label*="resize" i]')).toBeNull()
  })

  it('a single click on the text selects only the topic too', async () => {
    const { container } = render(<Canvas />)
    await settle()
    press(text(container))
    expect(st().selected).toEqual([id])
    expect(st().imageSelected).toBeNull()
  })

  it('a double click or double tap ON THE PICTURE selects the picture (toolbar, panel, frame and handles)', async () => {
    const { container } = render(<Canvas />)
    await settle()
    press(picture(container))
    press(picture(container), 120)
    expect(st().selected).toEqual([id])
    expect(st().imageSelected).toBe(id)
    expect(st().editingId).toBeNull() // not text editing
    await settle()
    expect(container.querySelector(`[data-image="${id}"] button`)).not.toBeNull() // the resize handles appear only now
  })

  it('a double click on the TEXT still edits the text, and does not select the picture', async () => {
    const { container } = render(<Canvas />)
    await settle()
    press(text(container))
    press(text(container), 120)
    expect(st().editingId).toBe(id)
    expect(st().imageSelected).toBeNull()
  })

  it('two clicks far apart are two single clicks', async () => {
    const { container } = render(<Canvas />)
    await settle()
    press(picture(container))
    press(picture(container), 900)
    expect(st().imageSelected).toBeNull()
  })

  it('a click on the selected picture keeps it selected; a click on the text goes back to the topic only', async () => {
    const { container } = render(<Canvas />)
    await settle()
    press(picture(container))
    press(picture(container), 100)
    expect(st().imageSelected).toBe(id)
    press(picture(container), 1000)
    expect(st().imageSelected).toBe(id)
    press(text(container), 1000)
    expect(st().imageSelected).toBeNull()
    expect(st().selected).toEqual([id])
  })

  it('Escape moves the selection from the picture back to its topic, then deselects', async () => {
    const { container } = render(<Canvas />)
    await settle()
    press(picture(container))
    press(picture(container), 100)
    escape()
    expect(st().imageSelected).toBeNull()
    expect(st().selected).toEqual([id])
    escape()
    expect(st().selected).toEqual([])
  })

  it('the keyboard: I selects the picture of the selected topic, Escape goes back', async () => {
    render(<Canvas />)
    act(() => useEditor.setState({ selected: [id] }))
    act(() => COMMANDS.find((c) => c.id === 'selectImage')?.run())
    expect(st().imageSelected).toBe(id)
    expect(COMMANDS.find((c) => c.id === 'selectImage')?.keys).toEqual(['I'])
    escape()
    expect(st().imageSelected).toBeNull()
  })

  it('an empty part of the canvas deselects everything', async () => {
    const { container } = render(<Canvas />)
    await settle()
    press(picture(container))
    press(picture(container), 100)
    expect(st().imageSelected).toBe(id)
    const surface = container.firstElementChild as HTMLElement
    press(surface, 1000)
    expect(st().imageSelected).toBeNull()
    expect(st().selected).toEqual([])
  })

  it('Read mode: a single tap selects the topic, a double tap opens the picture large, and nothing can be edited', async () => {
    await act(async () => void (await enterReadMode()))
    const { container } = render(<Canvas />)
    await settle()
    press(picture(container))
    expect(st().lightbox).toBeNull()
    expect(st().imageSelected).toBeNull()
    press(picture(container), 120)
    expect(st().lightbox).toBe('pic-1')
    expect(st().imageSelected).toBeNull()
    expect(st().editingId).toBeNull()
    press(text(container), 1000)
    press(text(container), 100)
    expect(st().editingId).toBeNull() // a double tap on the text does not edit in Read mode
    await act(async () => void enterEditMode())
  })
})
