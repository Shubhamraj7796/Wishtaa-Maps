// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { addChild } from '@/core/model/commands'
import { setNote } from '@/core/model/content'
import { addNote } from '@/core/model/notes'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { enterEditMode, enterReadMode } from '../readmode'
import { closeFile, mapDoc, openFile } from '../session'
import { useEditor } from '../store'
import NotesPanel from '../ui/NotesPanel'
import { loadNoteSize } from './NotePopup'
import { ItemsHost } from './ItemsHost'
import { visibleTools } from './RichNoteEditor'
import { legacyNoteId } from '@/core/model/notes'
import { openNote, useItems } from './state'

// jsdom cannot measure text; the editor scrolls the cursor into view with these.
const none = { length: 0, item: () => null, [Symbol.iterator]: function* () {} }
Range.prototype.getClientRects = () => none as unknown as DOMRectList
Range.prototype.getBoundingClientRect = () => new DOMRect()
Element.prototype.getClientRects = () => none as unknown as DOMRectList

let repo: RepositoryCore
let t = 1_700_000_000_000
const st = () => useEditor.getState()
const settle = (ms = 30) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))

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

const topic = () => addChild(mapDoc, st().rootId, 'Dose')

describe('the note popup', () => {
  it('opens as a dialog with a title field, the formatting icons (each with a name, no native title) and the editor', async () => {
    const id = topic()
    const n = addNote(mapDoc, id, { title: 'Storage', html: '<p>cold</p>' }) as string
    await settle()
    render(<ItemsHost />)
    act(() => openNote(n))
    const d = await screen.findByRole('dialog', { name: 'Note: Storage' })
    expect((screen.getByLabelText('Note title') as HTMLInputElement).value).toBe('Storage')
    const bar = screen.getByRole('toolbar', { name: 'Note formatting' })
    const names = [...bar.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))
    expect(names).toEqual(['Bold', 'Italic', 'Underline', 'Strikethrough', 'Heading 1', 'Heading 2', 'Bulleted list', 'Numbered list', 'Quote', 'Code', 'Link', 'Remove link', 'Undo typing', 'Redo typing'])
    expect([...bar.querySelectorAll('button')].every((b) => !b.hasAttribute('title'))).toBe(true)
    expect(screen.getByLabelText('Note text')).toBeTruthy()
    expect(d.textContent).toContain('Topic: Dose')
  })

  it('the title is saved by itself and the edited time moves', async () => {
    const id = topic()
    const n = addNote(mapDoc, id, { title: 'Old', html: '<p>x</p>' }, 1000) as string
    await settle()
    render(<ItemsHost />)
    act(() => openNote(n))
    fireEvent.change(await screen.findByLabelText('Note title'), { target: { value: 'New title' } })
    expect(st().notes[n]?.title).toBe('Old') // waits for typing to stop
    await settle(650)
    expect(st().notes[n]?.title).toBe('New title')
    expect(st().notes[n]?.updatedAt).toBeGreaterThan(1000)
  })

  it('closing saves a title that was just typed', async () => {
    const id = topic()
    const n = addNote(mapDoc, id, { title: 'Old', html: '<p>x</p>' }) as string
    await settle()
    render(<ItemsHost />)
    act(() => openNote(n))
    fireEvent.change(await screen.findByLabelText('Note title'), { target: { value: 'Quick' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(st().notes[n]?.title).toBe('Quick')
    expect(useItems.getState().popup).toBeNull()
  })

  it('a new note left completely empty is removed when the popup closes; one with a title is kept', async () => {
    const id = topic()
    const empty = addNote(mapDoc, id) as string
    const titled = addNote(mapDoc, id, { title: 'Kept' }) as string
    await settle()
    render(<ItemsHost />)
    act(() => openNote(empty))
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }))
    expect(st().notes[empty]).toBeUndefined()
    act(() => openNote(titled))
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }))
    expect(st().notes[titled]).toBeTruthy()
  })

  it('Delete removes the note at once and a notice offers Undo, which brings it back', async () => {
    const id = topic()
    const n = addNote(mapDoc, id, { title: 'Gone', html: '<p>text</p>' }) as string
    await settle()
    mapDoc.undo.stopCapturing()
    render(<ItemsHost />)
    act(() => openNote(n))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete this note' }))
    expect(st().notes[n]).toBeUndefined()
    expect(st().notice?.text).toBe('Note deleted.')
    act(() => st().notice?.action?.run())
    expect(st().notes[n]?.title).toBe('Gone')
  })

  it('the first note of a topic opens in the same popup (no title field) and is saved in the topic', async () => {
    const id = topic()
    setNote(mapDoc, id, '<p>first</p>')
    await settle()
    render(<ItemsHost />)
    act(() => openNote(legacyNoteId(id)))
    await screen.findByRole('dialog', { name: 'Note' })
    expect(screen.queryByLabelText('Note title')).toBeNull()
    expect(screen.getByText('First note of this topic')).toBeTruthy()
  })

  it('a note that disappears (another device, undo) closes its popup with a notice', async () => {
    const id = topic()
    const n = addNote(mapDoc, id, { title: 'Temp' }) as string
    await settle()
    render(<ItemsHost />)
    act(() => openNote(n))
    await screen.findByRole('dialog')
    act(() => void mapDoc.notes.delete(n))
    await settle()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(st().notice?.text).toBe('That note is no longer there.')
  })

  it('in Read mode there is no toolbar, no Delete, and the title cannot be edited', async () => {
    const id = topic()
    const n = addNote(mapDoc, id, { title: 'Look', html: '<p>only reading</p>' }) as string
    await settle()
    await act(async () => void (await enterReadMode('user')))
    await settle()
    render(<ItemsHost />)
    act(() => openNote(n))
    await screen.findByRole('dialog')
    expect(screen.queryByRole('toolbar', { name: 'Note formatting' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete this note' })).toBeNull()
    expect((screen.getByLabelText('Note title') as HTMLInputElement).readOnly).toBe(true)
    await act(async () => void (await enterEditMode()))
  })
})

describe('the Notes tab of the side panel', () => {
  it('lists the notes of the selected topic; a row opens the popup', async () => {
    const id = topic()
    setNote(mapDoc, id, '<p>first</p>')
    const n = addNote(mapDoc, id, { title: 'Second' }) as string
    act(() => useEditor.setState({ selected: [id] }))
    await settle()
    render(
      <>
        <NotesPanel />
        <ItemsHost />
      </>
    )
    const rows = document.querySelectorAll('[data-note-row]')
    expect(rows).toHaveLength(2)
    fireEvent.click(rows[1] as HTMLElement)
    expect(useItems.getState().popup).toEqual({ kind: 'note', id: n })
  })
})

describe('the size of the note popup', () => {
  it('one icon steps Normal, Wide, Full screen and back, names the next step, and is remembered on this device', async () => {
    const id = topic()
    const n = addNote(mapDoc, id, { title: 'Storage', html: '<p>cold</p>' }) as string
    await settle()
    render(<ItemsHost />)
    act(() => openNote(n))
    const d = await screen.findByRole('dialog', { name: 'Note: Storage' })
    expect(d.getAttribute('data-popup-size')).toBe('normal')
    fireEvent.click(screen.getByRole('button', { name: 'Wider' }))
    expect(d.getAttribute('data-popup-size')).toBe('wide')
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }))
    expect(d.getAttribute('data-popup-size')).toBe('full')
    expect(d.className).toContain('sm:inset-0')
    expect(localStorage.getItem('wishtaa.noteSize')).toBe('full')
    // Opened again later: it comes back at the size it was left at.
    cleanup()
    render(<ItemsHost />)
    act(() => openNote(n))
    const again = await screen.findByRole('dialog', { name: 'Note: Storage' })
    expect(again.getAttribute('data-popup-size')).toBe('full')
    fireEvent.click(screen.getByRole('button', { name: 'Narrower' }))
    expect(again.getAttribute('data-popup-size')).toBe('normal')
    expect(screen.getByRole('button', { name: 'Wider' }).hasAttribute('title')).toBe(false)
    // On a phone the size button is hidden (the popup is always a full sheet).
    expect(screen.getByRole('button', { name: 'Wider' }).className).toContain('max-sm:hidden')
  })

  it('a stored value that is not a size is ignored', () => {
    localStorage.setItem('wishtaa.noteSize', 'huge')
    expect(loadNoteSize()).toBe('normal')
  })

  it('the toolbar shows every tool when they fit and moves the rest into More when they do not (never wrapping)', () => {
    expect(visibleTools(0, 14, 4)).toBe(14) // width unknown
    expect(visibleTools(900, 14, 4)).toBe(14)
    expect(visibleTools(374, 14, 4)).toBeLessThan(14)
    expect(visibleTools(374, 14, 4)).toBeGreaterThanOrEqual(2)
    expect(visibleTools(100, 14, 4)).toBe(2)
    // The narrower the bar, the fewer icons are shown, and at least one is always left for the More menu.
    expect(visibleTools(300, 14, 4)).toBeLessThanOrEqual(visibleTools(374, 14, 4))
    expect(visibleTools(500, 14, 4)).toBeLessThanOrEqual(13)
  })
})
