// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { addChild } from '@/core/model/commands'
import { setNote } from '@/core/model/content'
import { addNote, deleteNote } from '@/core/model/notes'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { enterEditMode, enterReadMode } from '../readmode'
import { getScene } from '../scene'
import { closeFile, mapDoc, openFile } from '../session'
import { useEditor } from '../store'
import { OutlineView } from '../ui/OutlineView'
import { ItemsHost } from './ItemsHost'
import { useItems } from './state'

let repo: RepositoryCore
let t = 1_700_000_000_000
const st = () => useEditor.getState()
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))))

beforeEach(async () => {
  installMemoryLocalStorage()
  repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'map', name: 'Notes', content: buildStarterContent('blank') })
  await openFile(f.id, repo)
  await settle()
  useItems.setState({ list: null, popup: null })
})
afterEach(async () => {
  cleanup()
  await closeFile()
})

describe('the notes icon of a topic', () => {
  it('shows nothing without a note, an icon with one note, and a count with several', async () => {
    const id = addChild(mapDoc, st().rootId, 'Dose')
    await settle()
    render(<OutlineView />)
    expect(document.querySelector(`[data-notes-chip="${id}"]`)).toBeNull()
    act(() => setNote(mapDoc, id, '<p>first</p>'))
    const one = document.querySelector(`[data-notes-chip="${id}"]`) as HTMLElement
    expect(one.getAttribute('aria-label')).toBe('Note. Open the list')
    expect(one.textContent).toBe('')
    act(() => void addNote(mapDoc, id, { title: 'Second' }))
    act(() => void addNote(mapDoc, id, { title: 'Third' }))
    const three = document.querySelector(`[data-notes-chip="${id}"]`) as HTMLElement
    expect(three.getAttribute('aria-label')).toBe('3 notes. Open the list')
    expect(three.textContent).toBe('3')
    expect(st().itemCounts[id]).toEqual({ notes: 3, tasks: 0 })
  })

  it('a topic with only a note of its own (no first note) also shows it, and it goes when the note is deleted', async () => {
    const id = addChild(mapDoc, st().rootId, 'Dose')
    const n = addNote(mapDoc, id, { title: 'Only' }) as string
    await settle()
    render(<OutlineView />)
    expect(document.querySelector(`[data-notes-chip="${id}"]`)).toBeTruthy()
    act(() => deleteNote(mapDoc, n))
    expect(document.querySelector(`[data-notes-chip="${id}"]`)).toBeNull()
  })

  it('a click opens the list of notes, with a title or the start of each; a row opens that note', async () => {
    const id = addChild(mapDoc, st().rootId, 'Dose')
    setNote(mapDoc, id, '<p>first note text</p>')
    const second = addNote(mapDoc, id, { title: 'Storage', html: '<p>cold chain</p>' }) as string
    await settle()
    render(
      <>
        <OutlineView />
        <ItemsHost />
      </>
    )
    fireEvent.click(document.querySelector(`[data-notes-chip="${id}"]`) as HTMLElement)
    const menu = await screen.findByRole('menu', { name: 'Notes of this topic' })
    const rows = within(menu).getAllByRole('menuitem').filter((r) => r.hasAttribute('data-note-row'))
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('first note text')
    expect(rows[1]?.textContent).toContain('Storage')
    expect(within(menu).getByRole('menuitem', { name: 'Add a note' })).toBeTruthy()
    fireEvent.click(rows[1] as HTMLElement)
    expect(useItems.getState().popup).toEqual({ kind: 'note', id: second })
    expect(useItems.getState().list).toBeNull()
  })

  it('Add a note in the list makes a new note and opens it', async () => {
    const id = addChild(mapDoc, st().rootId, 'Dose')
    setNote(mapDoc, id, '<p>first</p>')
    await settle()
    render(
      <>
        <OutlineView />
        <ItemsHost />
      </>
    )
    fireEvent.click(document.querySelector(`[data-notes-chip="${id}"]`) as HTMLElement)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Add a note' }))
    await waitFor(() => expect(Object.keys(st().notes)).toHaveLength(1))
    const only = Object.keys(st().notes)[0]
    expect(useItems.getState().popup).toEqual({ kind: 'note', id: only })
  })

  it('in Read mode the list has no Add icon and nothing can be added', async () => {
    const id = addChild(mapDoc, st().rootId, 'Dose')
    setNote(mapDoc, id, '<p>first</p>')
    await settle()
    await act(async () => void (await enterReadMode('user')))
    await settle()
    render(
      <>
        <OutlineView />
        <ItemsHost />
      </>
    )
    fireEvent.click(document.querySelector(`[data-notes-chip="${id}"]`) as HTMLElement)
    const menu = await screen.findByRole('menu', { name: 'Notes of this topic' })
    expect(within(menu).queryByRole('menuitem', { name: 'Add a note' })).toBeNull()
    await act(async () => void (await enterEditMode()))
  })
})

describe('the map gives room for the notes icon', () => {
  it('a topic with several notes is a little wider than one with none, and the layout needs no DOM', async () => {
    const id = addChild(mapDoc, st().rootId, 'Dose')
    await settle()
    const before = getScene().boxes.get(id)?.w ?? 0
    act(() => void addNote(mapDoc, id, { title: 'A' }))
    act(() => void addNote(mapDoc, id, { title: 'B' }))
    const after = getScene().boxes.get(id)?.w ?? 0
    expect(after).toBeGreaterThanOrEqual(before)
    expect(st().itemCounts[id]?.notes).toBe(2)
  })
})
