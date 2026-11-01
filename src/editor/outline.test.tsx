// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { addChild, reorder, setCollapsed, setImage, setText } from '@/core/model/commands'
import { buildIndex, childrenOf } from '@/core/model/tree'
import { installMemoryLocalStorage } from '../test/memoryStorage'
import * as A from './actions'
import { imageStore } from './images'
import { enterEditMode, enterReadMode } from './readmode'
import { getScene } from './scene'
import { closeFile, mapDoc, openFile } from './session'
import { useEditor } from './store'
import { Lightbox } from './ui/Dialogs'
import { OutlineView } from './ui/OutlineView'

let repo: RepositoryCore
let t = 1_700_000_000_000
const st = () => useEditor.getState()
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))))
const topicsOf = (parent: string) => childrenOf(buildIndex(st().topics), parent).map((x) => x.id)
const rowIds = () => [...document.querySelectorAll('[data-row]')].map((e) => e.getAttribute('data-row') as string)
const inputOf = (id: string) => document.querySelector(`[data-row="${id}"] input`) as HTMLInputElement
const drawn = () => Number(document.querySelector('[role="tree"]')?.getAttribute('data-drawn'))
const total = () => Number(document.querySelector('[role="tree"]')?.getAttribute('data-total'))

URL.createObjectURL = vi.fn(() => 'blob:fake') as never
URL.revokeObjectURL = vi.fn()

async function put(id: string, w = 1280, h = 720) {
  await imageStore.put({ id, width: w, height: h, type: 'image/webp', size: 5, blob: new Blob(['x'], { type: 'image/webp' }) })
}

beforeEach(async () => {
  installMemoryLocalStorage()
  repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'map', name: 'Outline', content: buildStarterContent('blank') })
  await openFile(f.id, repo)
  await settle()
  mapDoc.undo.stopCapturing()
  mapDoc.undo.clear()
})
afterEach(async () => {
  cleanup()
  await closeFile()
})

describe('pictures in the outline', () => {
  it('a topic with only a picture shows the picture, with "Picture" as its label (never an empty row)', async () => {
    await put('pic-a')
    const id = addChild(mapDoc, st().rootId, '')
    setImage(mapDoc, id, { imageId: 'pic-a', width: 320, height: 180 })
    await settle()
    render(<OutlineView />)
    const row = document.querySelector(`[data-row="${id}"]`) as HTMLElement
    expect(inputOf(id).value).toBe('')
    expect(inputOf(id).placeholder).toBe('Picture') // shown, never stored
    expect(within(row).getByRole('button', { name: /Open picture/ })).toBeTruthy()
    await settle()
    expect(row.querySelector('img')?.getAttribute('src')).toBe('blob:fake')
    expect(st().topics[id]?.text).toBe('') // the label is not saved into the map
  })

  it('a topic with text shows the text first, and the picture below it', async () => {
    await put('pic-b')
    const id = addChild(mapDoc, st().rootId, 'Lease term')
    setImage(mapDoc, id, { imageId: 'pic-b', width: 640, height: 360 })
    await settle()
    render(<OutlineView />)
    const row = document.querySelector(`[data-row="${id}"]`) as HTMLElement
    const input = within(row).getByRole('textbox')
    const pic = within(row).getByRole('button', { name: /Open picture: Lease term/ })
    expect(input.compareDocumentPosition(pic) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // a desktop row: the picture is at most 320 px wide, in proportion
    expect((row.querySelector('[data-outline-picture]') as HTMLElement).style.width).toBe('320px')
    expect((row.querySelector('[data-outline-picture]') as HTMLElement).style.height).toBe('180px')
  })

  it('a topic without a picture is still one line, and shows a hint when empty', () => {
    const id = addChild(mapDoc, st().rootId, '')
    render(<OutlineView />)
    expect(inputOf(id).placeholder).toBe('Empty topic')
    expect(document.querySelector(`[data-row="${id}"] [data-outline-picture]`)).toBeNull()
  })

  it('a missing picture says so instead of leaving a hole', async () => {
    const id = addChild(mapDoc, st().rootId, '')
    setImage(mapDoc, id, { imageId: 'gone', width: 320, height: 180 })
    render(<OutlineView />)
    await waitFor(() => expect(document.querySelector(`[data-row="${id}"]`)?.textContent).toMatch(/Picture missing/), { timeout: 3000 })
  })
})

describe('"IND AS 116 Leases": a line break in a topic is shown as a space', () => {
  it('shows the two lines of the central topic with a space, and does not change the stored text', async () => {
    mapDoc.ydoc.transact(() => setText(mapDoc, st().rootId, 'IND AS 116\nLeases'))
    await settle()
    render(<OutlineView />)
    const root = inputOf(st().rootId)
    expect(root.value).toBe('IND AS 116 Leases')
    fireEvent.focus(root)
    fireEvent.blur(root) // just looking at it, then leaving
    fireEvent.keyDown(root, { key: 'ArrowDown' })
    expect(st().topics[st().rootId]?.text).toBe('IND AS 116\nLeases')
  })

  it('typing a change saves it', async () => {
    mapDoc.ydoc.transact(() => setText(mapDoc, st().rootId, 'A\nB'))
    await settle()
    render(<OutlineView />)
    const root = inputOf(st().rootId)
    fireEvent.change(root, { target: { value: 'A B C' } })
    fireEvent.blur(root)
    expect(st().topics[st().rootId]?.text).toBe('A B C')
  })
})

describe('the outline and the map are one set of data', () => {
  function build(n: number) {
    return Array.from({ length: n }, (_, i) => addChild(mapDoc, st().rootId, `T${i + 1}`))
  }

  it('the outline lists the children in their stored order, and so does everything else', async () => {
    const ids = build(6)
    await settle()
    render(<OutlineView />)
    expect(rowIds()).toEqual([st().rootId, ...ids])
    expect(topicsOf(st().rootId)).toEqual(ids)
  })

  it('a branch direction changes where the map draws the topics, never the outline order', async () => {
    const ids = build(7)
    await settle()
    render(<OutlineView />)
    const before = rowIds()
    for (const d of ['clockwise', 'reverse', 'balanced'] as const) {
      act(() => A.setBranchDirection(d))
      await settle()
      expect(rowIds(), d).toEqual(before)
      expect(topicsOf(st().rootId), d).toEqual(ids)
    }
    act(() => A.setBranchDirection('clockwise'))
    await settle()
    const sides = ids.map((id) => getScene().boxes.get(id)?.side)
    expect(sides).toContain('left') // the map did change
    expect(rowIds()).toEqual(before) // the outline did not
  })

  it('reordering in the outline (Alt+Up) changes the map order too, and reordering from the map shows in the outline', async () => {
    const ids = build(4)
    await settle()
    render(<OutlineView />)
    fireEvent.keyDown(inputOf(ids[2] as string), { key: 'ArrowUp', altKey: true })
    await settle()
    expect(topicsOf(st().rootId)).toEqual([ids[0], ids[2], ids[1], ids[3]])
    expect(rowIds()).toEqual([st().rootId, ids[0], ids[2], ids[1], ids[3]])
    act(() => void reorder(mapDoc, ids[3] as string, -1)) // done "in the map"
    await settle()
    expect(rowIds()).toEqual([st().rootId, ids[0], ids[2], ids[3], ids[1]])
  })

  it('text edited in the outline appears in the map data, and text edited elsewhere appears in the outline', async () => {
    const [a] = build(2)
    await settle()
    render(<OutlineView />)
    fireEvent.change(inputOf(a as string), { target: { value: 'From the outline' } })
    fireEvent.blur(inputOf(a as string))
    expect(st().topics[a as string]?.text).toBe('From the outline')
    expect(getScene().boxes.has(a as string)).toBe(true)
    act(() => setText(mapDoc, a as string, 'From the map'))
    await settle()
    expect(inputOf(a as string).value).toBe('From the map')
  })

  it('adding, indenting, outdenting and deleting in the outline all reach the map', async () => {
    const [a, b] = build(2)
    await settle()
    render(<OutlineView />)
    fireEvent.keyDown(inputOf(b as string), { key: 'Tab' }) // indent under a
    await settle()
    expect(st().topics[b as string]?.parentId).toBe(a)
    fireEvent.keyDown(inputOf(b as string), { key: 'Tab', shiftKey: true }) // and back out
    await settle()
    expect(st().topics[b as string]?.parentId).toBe(st().rootId)
    fireEvent.keyDown(inputOf(b as string), { key: 'Enter' }) // a new sibling
    await settle()
    expect(topicsOf(st().rootId)).toHaveLength(3)
    const fresh = topicsOf(st().rootId)[2] as string
    fireEvent.change(inputOf(fresh), { target: { value: '' } })
    fireEvent.keyDown(inputOf(fresh), { key: 'Backspace' }) // empty: deleted
    await settle()
    expect(topicsOf(st().rootId)).toEqual([a, b])
  })

  it('folding is shared: folding in the outline folds the branch for the map, and the other way round', async () => {
    const [a] = build(1)
    addChild(mapDoc, a as string, 'child')
    await settle()
    render(<OutlineView />)
    expect(rowIds()).toHaveLength(3)
    fireEvent.click(within(document.querySelector(`[data-row="${a}"]`) as HTMLElement).getByRole('button', { name: 'Collapse' }))
    await settle()
    expect(st().topics[a as string]?.collapsed).toBe(true)
    expect(rowIds()).toHaveLength(2)
    expect([...getScene().boxes.keys()]).not.toContain(topicsOf(a as string)[0])
    act(() => setCollapsed(mapDoc, [a as string], false)) // unfolded "in the map"
    await settle()
    expect(rowIds()).toHaveLength(3)
  })

  it('every action is one undo step, and Undo / Redo reach the other view', async () => {
    const [a] = build(1)
    await settle()
    render(<OutlineView />)
    mapDoc.undo.stopCapturing()
    mapDoc.undo.clear()
    fireEvent.keyDown(inputOf(a as string), { key: 'Enter' })
    await settle()
    expect(topicsOf(st().rootId)).toHaveLength(2)
    expect(mapDoc.undo.undoStack.length).toBe(1)
    act(() => A.cmdUndo())
    await settle()
    expect(topicsOf(st().rootId)).toEqual([a])
    expect(rowIds()).toEqual([st().rootId, a])
    act(() => A.cmdRedo())
    await settle()
    expect(rowIds()).toHaveLength(3)
  })
})

describe('selection', () => {
  it('a topic selected in the map is selected in the outline (and the other way round)', async () => {
    const ids = Array.from({ length: 5 }, (_, i) => addChild(mapDoc, st().rootId, `T${i}`))
    await settle()
    render(<OutlineView />)
    act(() => A.selectOnly(ids[3] as string))
    await settle()
    expect(document.querySelector(`[data-row="${ids[3]}"]`)?.getAttribute('aria-selected')).toBe('true')
    fireEvent.focus(inputOf(ids[1] as string))
    expect(st().selected).toEqual([ids[1]])
  })

  it('a far-away topic selected in the map is scrolled to: it is drawn, and the rows are not all drawn', async () => {
    const ids = Array.from({ length: 300 }, (_, i) => addChild(mapDoc, st().rootId, `T${i}`))
    await settle()
    render(<OutlineView />)
    expect(document.querySelector(`[data-row="${ids[250]}"]`)).toBeNull() // not drawn yet
    act(() => A.selectOnly(ids[250] as string))
    await settle()
    expect(document.querySelector(`[data-row="${ids[250]}"]`)).toBeTruthy()
    expect(drawn()).toBeLessThan(80) // a screenful and a margin, out of 301
  })

  it('remembers where it was scrolled to when you come back from the map', async () => {
    Array.from({ length: 300 }, (_, i) => addChild(mapDoc, st().rootId, `T${i}`))
    await settle()
    const first = render(<OutlineView />)
    const scroller = first.container.querySelector('[role="region"]') as HTMLElement
    scroller.scrollTop = 3000
    fireEvent.scroll(scroller)
    await settle()
    first.unmount() // to the map
    act(() => A.clearSelection())
    const again = render(<OutlineView />)
    expect((again.container.querySelector('[role="region"]') as HTMLElement).scrollTop).toBe(3000)
  })
})

describe('a map with 500 pictures', () => {
  it('draws only the rows near the screen, however many there are, and keeps drawing a small number while scrolling', async () => {
    await put('big')
    for (let i = 0; i < 500; i++) {
      const id = addChild(mapDoc, st().rootId, `Topic ${i}`)
      setImage(mapDoc, id, { imageId: 'big', width: 1280, height: 720 })
    }
    await settle()
    const view = render(<OutlineView />)
    expect(total()).toBe(501)
    expect(drawn()).toBeLessThan(30)
    expect(document.querySelectorAll('img').length).toBeLessThan(30)
    const scroller = view.container.querySelector('[role="region"]') as HTMLElement
    const seen = new Set<string>()
    for (let y = 0; y < 100_000; y += 4000) {
      scroller.scrollTop = y
      fireEvent.scroll(scroller)
      await act(async () => void (await new Promise((r) => setTimeout(r, 25))))
      expect(drawn()).toBeLessThan(30)
      rowIds().forEach((id) => seen.add(id))
    }
    expect(seen.size).toBeGreaterThan(100) // it really did scroll through the list
  })
})

describe('doing things to a picture from the outline', () => {
  async function withPicture() {
    await put('pic-c')
    const id = addChild(mapDoc, st().rootId, 'Chart')
    setImage(mapDoc, id, { imageId: 'pic-c', width: 640, height: 360 })
    await settle()
    mapDoc.undo.stopCapturing()
    mapDoc.undo.clear()
    return id
  }

  it('clicking the picture selects the topic and opens a larger preview (Esc closes it)', async () => {
    const id = await withPicture()
    render(
      <>
        <OutlineView />
        <Lightbox />
      </>
    )
    fireEvent.click(screen.getByRole('button', { name: /Open picture: Chart/ }))
    await settle()
    expect(st().selected).toEqual([id])
    expect(st().lightbox).toBe('pic-c')
    const dialog = screen.getByRole('dialog', { name: 'Picture preview' })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(st().lightbox).toBeNull()
  })

  it('in Edit mode the preview offers Replace, Resize and Delete picture; Delete is one undo step', async () => {
    const id = await withPicture()
    render(
      <>
        <OutlineView />
        <Lightbox />
      </>
    )
    fireEvent.click(screen.getByRole('button', { name: /Open picture: Chart/ }))
    await settle()
    const tools = screen.getByRole('toolbar', { name: 'Picture actions' })
    expect(within(tools).getByRole('button', { name: 'Replace' })).toBeTruthy()
    expect(within(tools).getByRole('button', { name: 'Resize' })).toBeTruthy()
    fireEvent.click(within(tools).getByRole('button', { name: 'Delete picture' }))
    await settle()
    expect(st().topics[id]?.image ?? null).toBeNull()
    expect(st().lightbox).toBeNull()
    expect(mapDoc.undo.undoStack.length).toBe(1)
    act(() => A.cmdUndo())
    await settle()
    expect(st().topics[id]?.image?.imageId).toBe('pic-c') // back, across views
  })

  it('Replace from the preview opens the usual Add picture menu for that topic', async () => {
    const id = await withPicture()
    render(
      <>
        <OutlineView />
        <Lightbox />
      </>
    )
    fireEvent.click(screen.getByRole('button', { name: /Open picture: Chart/ }))
    await settle()
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Picture actions' })).getByRole('button', { name: 'Replace' }))
    await settle()
    expect(st().pictureMenu).toEqual({ kind: 'replace', id })
  })

  it('a selected row has an Add picture / Replace picture button that opens the same menu (so "Compressed or Original" and "don\'t ask again" apply)', async () => {
    const plain = addChild(mapDoc, st().rootId, 'No picture yet')
    await settle()
    render(<OutlineView />)
    fireEvent.focus(inputOf(plain))
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Add picture' }))
    expect(st().pictureMenu).toEqual({ kind: 'topic', id: plain })
  })

  it('the buttons on the picture itself replace and delete it (one undo step)', async () => {
    const id = await withPicture()
    render(<OutlineView />)
    fireEvent.focus(inputOf(id))
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Delete the picture' }))
    await settle()
    expect(st().topics[id]?.image ?? null).toBeNull()
    expect(mapDoc.undo.undoStack.length).toBe(1)
  })
})

describe('Read mode', () => {
  it('shows the pictures and opens the preview, but offers nothing that edits', async () => {
    await put('pic-r')
    const id = addChild(mapDoc, st().rootId, 'Chart')
    setImage(mapDoc, id, { imageId: 'pic-r', width: 640, height: 360 })
    await settle()
    await act(async () => void (await enterReadMode()))
    render(
      <>
        <OutlineView />
        <Lightbox />
      </>
    )
    fireEvent.focus(inputOf(id))
    expect(screen.queryByRole('button', { name: /Add picture|Replace picture/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Delete the picture|Replace the picture/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Open picture: Chart/ }))
    await settle()
    expect(screen.getByRole('dialog', { name: 'Picture preview' })).toBeTruthy()
    expect(screen.queryByRole('toolbar', { name: 'Picture actions' })).toBeNull() // viewing only
    expect(inputOf(id).readOnly).toBe(true)
    await act(async () => void enterEditMode())
  })
})

describe('dragging a row to reorder it', () => {
  const grip = (id: string) => document.querySelector(`[data-row="${id}"] [data-drag-handle]`) as HTMLElement
  // A row is 30 px tall and the list starts 8 px down. These are heights in the upper or lower half of row i.
  const at = (i: number, half: 'upper' | 'lower') => 8 + i * 30 + (half === 'upper' ? 6 : 22)
  const move = (x: number, y: number) => act(() => void window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y })))
  const drop = () => act(() => void window.dispatchEvent(new MouseEvent('pointerup')))
  async function four() {
    const ids = Array.from({ length: 4 }, (_, i) => addChild(mapDoc, st().rootId, `T${i + 1}`))
    await settle()
    mapDoc.undo.stopCapturing()
    mapDoc.undo.clear()
    return ids
  }

  it('dragging the grip of the last topic above the first moves it there, in the map too, as one undo step', async () => {
    const ids = await four()
    render(<OutlineView />)
    fireEvent.pointerDown(grip(ids[3] as string), { button: 0 })
    move(10, at(1, 'upper')) // row 0 is the central topic, row 1 is T1
    expect(document.querySelector('[data-drop-line="before"]')).toBeTruthy() // a line shows where it will land
    drop()
    await settle()
    expect(topicsOf(st().rootId)).toEqual([ids[3], ids[0], ids[1], ids[2]])
    expect(rowIds()).toEqual([st().rootId, ids[3], ids[0], ids[1], ids[2]])
    expect(mapDoc.undo.undoStack.length).toBe(1)
    expect(document.querySelector('[data-drop-line]')).toBeNull() // the line is gone
    act(() => A.cmdUndo())
    await settle()
    expect(topicsOf(st().rootId)).toEqual(ids)
  })

  it('dropping on the lower half goes after; dragged well to the right it becomes a sub-topic', async () => {
    const ids = await four()
    render(<OutlineView />)
    fireEvent.pointerDown(grip(ids[0] as string), { button: 0 })
    move(10, at(3, 'lower')) // after T3
    drop()
    await settle()
    expect(topicsOf(st().rootId)).toEqual([ids[1], ids[2], ids[0], ids[3]])
    fireEvent.pointerDown(grip(ids[3] as string), { button: 0 })
    move(500, at(1, 'lower')) // far to the right of T2 (now row 1)
    expect(document.querySelector('[data-drop-line="child"]')).toBeTruthy()
    drop()
    await settle()
    expect(st().topics[ids[3] as string]?.parentId).toBe(ids[1])
  })

  it('Escape puts it back: nothing moves and no undo step is left', async () => {
    const ids = await four()
    render(<OutlineView />)
    fireEvent.pointerDown(grip(ids[3] as string), { button: 0 })
    move(10, at(1, 'upper'))
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    drop()
    await settle()
    expect(topicsOf(st().rootId)).toEqual(ids)
    expect(mapDoc.undo.undoStack.length).toBe(0)
    expect(document.querySelector('[data-drop-line]')).toBeNull()
  })

  it('a topic cannot be dropped into its own branch', async () => {
    const ids = await four()
    const kid = addChild(mapDoc, ids[1] as string, 'inside T2')
    await settle()
    mapDoc.undo.stopCapturing()
    mapDoc.undo.clear()
    render(<OutlineView />)
    fireEvent.pointerDown(grip(ids[1] as string), { button: 0 })
    move(500, at(3, 'lower')) // row 3 is T2's own child
    drop()
    await settle()
    expect(st().topics[kid]?.parentId).toBe(ids[1])
    expect(st().topics[ids[1] as string]?.parentId).toBe(st().rootId)
    expect(mapDoc.undo.undoStack.length).toBe(0)
  })

  it('there is no grip in Read mode', async () => {
    const ids = await four()
    await act(async () => void (await enterReadMode()))
    render(<OutlineView />)
    expect(grip(ids[0] as string)).toBeNull()
    await act(async () => void enterEditMode())
  })
})
