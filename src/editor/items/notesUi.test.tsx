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
import NotesPanel from '../ui/NotesPanel'
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

describe('the progress count of a checklist in the notes list', () => {
  it('shows "3/6" with the words "3 of 6 done" for a note with a checklist, and nothing for a note without one', async () => {
    const id = addChild(mapDoc, useEditor.getState().rootId, 'Dose')
    const item = (checked: boolean, text: string) => `<li data-checked="${checked}" data-type="taskItem"><p>${text}</p></li>`
    const html = `<ul data-type="taskList">${[true, true, true, false, false, false].map((c, i) => item(c, `item ${i + 1}`)).join('')}</ul>`
    addNote(mapDoc, id, { title: 'Todo', html })
    addNote(mapDoc, id, { title: 'Plain', html: '<p>no list</p>' })
    act(() => useEditor.setState({ selected: [id] }))
    await settle()
    render(<NotesPanel />)
    const chips = document.querySelectorAll('[data-checklist-progress]')
    expect(chips).toHaveLength(1)
    expect(chips[0]?.textContent).toBe('3/6')
    expect(chips[0]?.getAttribute('aria-label')).toBe('3 of 6 done')
    expect(chips[0]?.hasAttribute('title')).toBe(false)
    // The list text shows the boxes as [ ] and [x].
    expect(document.body.textContent).toContain('[x] item 1')
  })
})

describe('the "Add a note" bar of the Notes tab', () => {
  async function tab() {
    const id = addChild(mapDoc, useEditor.getState().rootId, 'Dose')
    act(() => useEditor.setState({ selected: [id] }))
    await settle()
    render(
      <>
        <NotesPanel />
        <ItemsHost />
      </>
    )
    return id
  }

  it('is a full-width button with a plus icon and the words, outside the scrolling list so it stays in view, at least 44 px on touch', async () => {
    await tab()
    const bar = document.querySelector('[data-add-note-bar]') as HTMLElement
    expect(bar.tagName).toBe('BUTTON')
    expect(bar.getAttribute('type')).toBe('button') // so Enter and Space press it
    expect(bar.getAttribute('aria-label')).toBe('Add a note')
    expect(bar.textContent).toContain('Add a note')
    expect(bar.querySelector('svg')).toBeTruthy()
    expect(bar.className).toContain('w-full')
    expect(bar.className).toContain('min-h-11')
    expect(bar.hasAttribute('title')).toBe(false)
    expect(bar.closest('.overflow-y-auto')).toBeNull() // not inside the list that scrolls
    expect(document.querySelector('[aria-label="Notes of this topic"]')?.closest('.overflow-y-auto')).toBeTruthy()
    // The small round plus is gone from the tab.
    expect(screen.queryAllByRole('button', { name: 'Add a note' })).toHaveLength(1)
  })

  it('adds a note and opens it, exactly as the icon did', async () => {
    const id = await tab()
    fireEvent.click(screen.getByRole('button', { name: 'Add a note' }))
    const added = Object.values(st().notes).filter((n) => n.topicId === id)
    expect(added).toHaveLength(1)
    expect(useItems.getState().popup).toEqual({ kind: 'note', id: added[0]?.id })
    expect(await screen.findByRole('dialog', { name: /^Note/ })).toBeTruthy()
  })

  it('is not there in Read mode, and the small popover list keeps its plus icon', async () => {
    const id = await tab()
    cleanup()
    render(<ItemsHost />)
    act(() => useItems.setState({ list: { kind: 'notes', topicId: id, anchor: document.body } }))
    const menu = await screen.findByRole('menu', { name: 'Notes of this topic' })
    expect(within(menu).getByRole('menuitem', { name: 'Add a note' })).toBeTruthy()
    expect(document.querySelector('[data-add-note-bar]')).toBeNull()
    act(() => useItems.setState({ list: null }))
    cleanup()
    await act(async () => void (await enterReadMode('user')))
    await settle()
    render(<NotesPanel />)
    expect(document.querySelector('[data-add-note-bar]')).toBeNull()
    await act(async () => void (await enterEditMode()))
  })
})
