// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { addChild } from '@/core/model/commands'
import { installMemoryLocalStorage } from '../test/memoryStorage'
import * as A from './actions'
import { enterEditMode, enterReadMode } from './readmode'
import { COMMANDS } from './registry'
import { getScene } from './scene'
import { closeFile, mapDoc, openFile } from './session'
import { useEditor } from './store'
import { CanvasTab } from './ui/CanvasTab'

let repo: RepositoryCore
let fileId = ''
let t = 1_700_000_000_000
const st = () => useEditor.getState()
const direction = () => st().settings.branchDirection
const group = () => screen.queryByRole('radiogroup', { name: 'Branch direction' })
const button = (name: string) => screen.getByRole('radio', { name })
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))))

beforeEach(async () => {
  installMemoryLocalStorage()
  repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'map', name: 'Directions', content: buildStarterContent('blank') })
  fileId = f.id
  await openFile(f.id, repo)
  for (let i = 1; i <= 5; i++) addChild(mapDoc, st().rootId, `T${i}`)
  await settle()
  mapDoc.undo.stopCapturing()
  mapDoc.undo.clear()
})
afterEach(async () => {
  cleanup()
  await closeFile()
})

describe('the Branch direction row (Canvas tab)', () => {
  it('shows three picture buttons under the layout, with Balanced chosen on a map that has never set one', () => {
    render(<CanvasTab />)
    expect(group()).toBeTruthy()
    expect(['Balanced', 'Clockwise', 'Reverse'].map((n) => button(n).getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])
    expect(button('Clockwise').getAttribute('title')).toMatch(/down the right side, then up the left/)
    expect(button('Reverse').getAttribute('title')).toMatch(/anticlockwise/)
    expect(button('Balanced').querySelector('svg')).toBeTruthy()
  })

  it('choosing one changes the picture, highlights it, and is ONE undo step that Undo and Redo reverse', async () => {
    render(<CanvasTab />)
    const mains = Object.values(st().topics).filter((x) => x.parentId === st().rootId)
    const before = JSON.stringify([...getScene().boxes])
    fireEvent.click(button('Clockwise'))
    await settle()
    expect(direction()).toBe('clockwise')
    expect(button('Clockwise').getAttribute('aria-checked')).toBe('true')
    expect(JSON.stringify([...getScene().boxes])).not.toBe(before)
    expect(mapDoc.undo.undoStack.length).toBe(1)
    // The stored order is untouched.
    expect(Object.values(st().topics).filter((x) => x.parentId === st().rootId).map((x) => x.id)).toEqual(mains.map((x) => x.id))

    act(() => A.cmdUndo())
    await settle()
    expect(direction()).toBe('balanced')
    expect(JSON.stringify([...getScene().boxes])).toBe(before) // exactly the picture it was
    act(() => A.cmdRedo())
    await settle()
    expect(direction()).toBe('clockwise')
  })

  it('Reverse puts the last topic at the top right; Balanced then brings the old picture back exactly', async () => {
    render(<CanvasTab />)
    const before = JSON.stringify([...getScene().boxes])
    const mains = Object.values(st().topics).filter((x) => x.parentId === st().rootId).map((x) => x.id)
    fireEvent.click(button('Reverse'))
    await settle()
    const boxes = getScene().boxes
    const last = boxes.get(mains[mains.length - 1] as string)!
    const rightSide = mains.map((id) => boxes.get(id)!).filter((b) => b.side === 'right')
    expect(last.side).toBe('right')
    expect(Math.min(...rightSide.map((b) => b.y))).toBe(last.y) // the last topic is the highest one on the right
    fireEvent.click(button('Balanced'))
    await settle()
    expect(JSON.stringify([...getScene().boxes])).toBe(before)
  })

  it('is hidden for the one-sided and other layouts, and comes back with the two-sided Mind map', async () => {
    render(<CanvasTab />)
    for (const layout of ['mindmap:right', 'mindmap:left', 'mindmap:down', 'tree:right', 'org:down', 'circular']) {
      act(() => A.setLayout(layout))
      await settle()
      expect(group(), layout).toBeNull()
    }
    act(() => A.setLayout('mindmap:both'))
    await settle()
    expect(group()).toBeTruthy()
  })

  it('the choice is kept for the map, but does not change a one-sided layout while it is set', async () => {
    fireEvent.click((render(<CanvasTab />), button('Clockwise')))
    await settle()
    const sidesBefore = JSON.stringify([...getScene().boxes])
    act(() => A.setLayout('mindmap:right'))
    await settle()
    expect(direction()).toBe('clockwise') // still stored with the map
    expect([...getScene().boxes.values()].filter((b) => b.depth === 1).every((b) => b.side === 'right')).toBe(true)
    act(() => A.setLayout('mindmap:both'))
    await settle()
    expect(JSON.stringify([...getScene().boxes])).toBe(sidesBefore)
  })

  it('is hidden in Read mode, and back in Edit mode', async () => {
    render(<CanvasTab />)
    expect(group()).toBeTruthy()
    await act(async () => void (await enterReadMode()))
    expect(group()).toBeNull()
    await act(async () => void enterEditMode())
    expect(group()).toBeTruthy()
  })
})

describe('saved with the map', () => {
  it('survives closing and opening the file again (as after a reload)', async () => {
    A.setBranchDirection('reverse')
    await settle()
    await closeFile()
    await openFile(fileId, repo)
    expect(direction()).toBe('reverse')
    const mains = Object.values(st().topics).filter((x) => x.parentId === st().rootId).map((x) => x.id)
    expect(mains).toHaveLength(5)
    const boxes = getScene().boxes
    expect(boxes.get(mains[4] as string)?.side).toBe('right') // the last topic is at the top right
  })

  it('a map saved before this existed opens as Balanced, and nothing else about it changes', async () => {
    // (the starter map never set one)
    expect(direction()).toBe('balanced')
    expect(st().settings.layout).toBe('mindmap:both')
  })

  it('an unknown value in a file falls back to Balanced', async () => {
    mapDoc.ydoc.transact(() => mapDoc.settings.set('branchDirection', 'sideways'))
    await settle()
    expect(direction()).toBe('balanced')
  })
})

describe('command palette', () => {
  const cmd = (d: string) => COMMANDS.find((c) => c.id === `direction:${d}`)!

  it('lists all three', () => {
    expect(COMMANDS.filter((c) => c.id.startsWith('direction:')).map((c) => c.label)).toEqual(['Branch direction: Balanced', 'Branch direction: Clockwise', 'Branch direction: Reverse (anticlockwise)'])
  })

  it('applies a direction, as one undo step', async () => {
    act(() => cmd('clockwise').run())
    await settle()
    expect(direction()).toBe('clockwise')
    expect(mapDoc.undo.undoStack.length).toBe(1)
    act(() => cmd('balanced').run())
    await settle()
    expect(direction()).toBe('balanced')
  })

  it('on a one-sided layout it says so and changes nothing', async () => {
    act(() => A.setLayout('mindmap:right'))
    await settle()
    act(() => cmd('clockwise').run())
    expect(direction()).toBe('balanced')
    expect(st().notice?.text).toMatch(/Branch direction applies to the Mind map that uses both sides/)
  })

  it('is blocked in Read mode', async () => {
    await act(async () => void (await enterReadMode()))
    act(() => cmd('clockwise').run())
    expect(direction()).toBe('balanced')
  })
})
