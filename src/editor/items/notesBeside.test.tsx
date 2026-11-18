// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { addChild } from '@/core/model/commands'
import { addNote } from '@/core/model/notes'
import { addTask } from '@/core/model/tasks'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { enterEditMode, enterReadMode } from '../readmode'
import { closeFile, mapDoc, openFile } from '../session'
import { useEditor } from '../store'
import NotesPanel from '../ui/NotesPanel'
import { ItemsHost } from './ItemsHost'
import { openNote, useItems } from './state'

const none = { length: 0, item: () => null, [Symbol.iterator]: function* () {} }
Range.prototype.getClientRects = () => none as unknown as DOMRectList
Range.prototype.getBoundingClientRect = () => new DOMRect()
Element.prototype.getClientRects = () => none as unknown as DOMRectList

let repo: RepositoryCore
let t = 1_700_000_000_000
const st = () => useEditor.getState()
const settle = (ms = 30) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))
const wide = (yes: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: yes && q.includes('768'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))

beforeEach(async () => {
  installMemoryLocalStorage()
  repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'map', name: 'Notes', content: buildStarterContent('blank') })
  await openFile(f.id, repo)
  await settle()
  useItems.setState({ list: null, popup: null })
  act(() => useEditor.setState({ panelOpen: false }))
})
afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  document.querySelectorAll('#settings-panel').forEach((e) => e.remove())
  await closeFile()
})

const topic = (text = 'Dose') => addChild(mapDoc, st().rootId, text)
function three() {
  const id = topic()
  const a = addNote(mapDoc, id, { title: 'First', html: '<p>one</p>' }, 1) as string
  const b = addNote(mapDoc, id, { title: 'Second', html: '<p>two</p>' }, 2) as string
  const c = addNote(mapDoc, id, { title: 'Third', html: '<p>three</p>' }, 3) as string
  return { id, a, b, c }
}
const editorOf = () => (document.querySelector('.note-editor') as unknown as { editor: { commands: { insertContent: (c: string) => boolean; focus: (p?: string) => boolean } } }).editor

describe('the header and Previous / Next', () => {
  it('says which note it is ("Note 2 of 3"), and Previous and Next switch notes; each is off at its end', async () => {
    const { b } = three()
    await settle()
    render(<ItemsHost />)
    act(() => openNote(b))
    await screen.findByRole('dialog', { name: 'Note: Second' })
    expect(document.querySelector('[data-note-position]')?.textContent).toBe('Note 2 of 3 · Topic: Dose')
    fireEvent.click(screen.getByRole('button', { name: 'Next note' }))
    await screen.findByRole('dialog', { name: 'Note: Third' })
    expect(document.querySelector('[data-note-position]')?.textContent).toBe('Note 3 of 3 · Topic: Dose')
    expect((screen.getByRole('button', { name: 'Next note' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Previous note' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous note' }))
    await screen.findByRole('dialog', { name: 'Note: First' })
    expect((screen.getByRole('button', { name: 'Previous note' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Previous note' }).hasAttribute('title')).toBe(false)
  })

  it('a topic with one note has no Previous and Next', async () => {
    const id = topic()
    const a = addNote(mapDoc, id, { title: 'Only', html: '<p>x</p>' }) as string
    await settle()
    render(<ItemsHost />)
    act(() => openNote(a))
    await screen.findByRole('dialog', { name: 'Note: Only' })
    expect(screen.queryByRole('button', { name: 'Next note' })).toBeNull()
    expect(document.querySelector('[data-note-position]')?.textContent).toBe('Note 1 of 1 · Topic: Dose')
  })
})

describe('the active note in the lists', () => {
  it('is highlighted in the Notes tab and in the topic list popover, and the Notes tab follows the open note\'s topic', async () => {
    const { id, b } = three()
    const other = topic('Billing')
    const o = addNote(mapDoc, other, { title: 'Invoice', html: '<p>i</p>' }) as string
    act(() => useEditor.setState({ selected: [id] }))
    await settle()
    render(
      <>
        <NotesPanel />
        <ItemsHost />
      </>
    )
    expect(document.querySelectorAll('[data-note-row][data-active]')).toHaveLength(0)
    act(() => openNote(b))
    await screen.findByRole('dialog', { name: 'Note: Second' })
    const rows = [...document.querySelectorAll('[data-note-row]')]
    expect(rows.filter((r) => r.getAttribute('data-active') === 'true').map((r) => r.getAttribute('data-note-row'))).toEqual([b])
    expect(rows.find((r) => r.getAttribute('data-active'))?.getAttribute('aria-current')).toBe('true')
    // A note of another topic: the tab switches to that topic's list, with the note highlighted.
    act(() => openNote(o))
    await screen.findByRole('dialog', { name: 'Note: Invoice' })
    expect(document.querySelector(`[data-note-row="${o}"]`)?.getAttribute('data-active')).toBe('true')
    expect(document.querySelector(`[data-note-row="${b}"]`)).toBeNull()
  })
})

describe('switching notes never loses what was typed', () => {
  it('text typed and the title changed less than 500 ms before choosing another note are saved', async () => {
    const { a, b } = three()
    await settle()
    render(<ItemsHost />)
    act(() => openNote(a))
    await screen.findByRole('dialog', { name: 'Note: First' })
    act(() => void editorOf().commands.insertContent('TYPED'))
    fireEvent.change(screen.getByLabelText('Note title'), { target: { value: 'Renamed' } })
    act(() => openNote(b)) // at once: nothing waited for the 500 ms autosave
    await screen.findByRole('dialog', { name: 'Note: Second' })
    expect(st().notes[a]?.html).toContain('TYPED')
    expect(st().notes[a]?.title).toBe('Renamed')
    // Previous goes the same way.
    act(() => void editorOf().commands.insertContent('MORE'))
    fireEvent.click(screen.getByRole('button', { name: 'Previous note' }))
    await screen.findByRole('dialog', { name: 'Note: Renamed' })
    expect(st().notes[b]?.html).toContain('MORE')
  })

  it('an empty new note is removed when the list moves on; a note with text, a title or a task is kept', async () => {
    const id = topic()
    const keep = addNote(mapDoc, id, { title: '', html: '<p>text</p>' }, 1) as string
    const empty = addNote(mapDoc, id, { title: '', html: '' }, 2) as string
    const withTask = addNote(mapDoc, id, { title: '', html: '' }, 3) as string
    addTask(mapDoc, { topicId: id, title: 'T', noteId: withTask })
    const titled = addNote(mapDoc, id, { title: 'Just a title', html: '' }, 4) as string
    await settle()
    render(<ItemsHost />)
    for (const n of [empty, withTask, titled]) {
      act(() => openNote(n))
      await settle(10)
      act(() => openNote(keep))
      await settle(10)
    }
    expect(st().notes[empty]).toBeUndefined()
    expect(st().notes[withTask]).toBeTruthy()
    expect(st().notes[titled]).toBeTruthy()
    expect(st().notes[keep]).toBeTruthy()
  })
})

describe('beside the side panel', () => {
  function fakePanel(left = 1046, width = 320) {
    const el = document.createElement('aside')
    el.id = 'settings-panel'
    el.getBoundingClientRect = () => ({ left, width, right: left + width, top: 0, bottom: 768, height: 768, x: left, y: 0, toJSON() {} }) as DOMRect
    document.body.appendChild(el)
    Object.defineProperty(window, 'innerWidth', { value: 1366, configurable: true })
    return el
  }

  it('the popup and its dim layer stop where the panel starts (never over it), and there is no list icon in the header', async () => {
    const { a } = three()
    wide(true)
    fakePanel()
    act(() => useEditor.setState({ panelOpen: true }))
    await settle()
    render(<ItemsHost />)
    act(() => openNote(a))
    await screen.findByRole('dialog', { name: 'Note: First' })
    await settle(250)
    const backdrop = document.querySelector('[data-item-popup-backdrop]') as HTMLElement
    expect(backdrop.style.right).toBe('320px')
    expect(screen.queryByRole('button', { name: 'Notes of this topic' })).toBeNull()
  })

  it('with no panel beside it (a phone) the header has a Notes list icon that opens the list on top, with the open note highlighted', async () => {
    const { a, b } = three()
    wide(false)
    await settle()
    render(<ItemsHost />)
    act(() => openNote(a))
    await screen.findByRole('dialog', { name: 'Note: First' })
    expect((document.querySelector('[data-item-popup-backdrop]') as HTMLElement).style.right).toBe('0px')
    const icon = screen.getByRole('button', { name: 'Notes of this topic' })
    expect(icon.hasAttribute('title')).toBe(false)
    fireEvent.click(icon)
    const menu = await screen.findByRole('menu', { name: 'Notes of this topic' })
    expect(menu.querySelector(`[data-note-row="${a}"]`)?.getAttribute('data-active')).toBe('true')
    fireEvent.click(menu.querySelector(`[data-note-row="${b}"]`) as HTMLElement)
    await screen.findByRole('dialog', { name: 'Note: Second' })
  })

  it('a note that opens at 768 px or wider also opens the side panel on the Notes tab; not on a narrow window, and not in Read mode', async () => {
    const { a } = three()
    wide(true)
    await settle()
    render(<ItemsHost />)
    expect(st().panelOpen).toBe(false)
    act(() => openNote(a))
    await screen.findByRole('dialog', { name: 'Note: First' })
    expect(st().panelOpen).toBe(true)
    expect(st().panelTab).toBe('notes')
    // Closed by the person while the note is open: not forced open again by that same note.
    act(() => useEditor.setState({ panelOpen: false }))
    await settle(50)
    expect(st().panelOpen).toBe(false)
    act(() => useItems.setState({ popup: null }))
    cleanup()
    // Narrow window.
    wide(false)
    render(<ItemsHost />)
    act(() => openNote(a))
    await screen.findByRole('dialog', { name: 'Note: First' })
    expect(st().panelOpen).toBe(false)
    act(() => useItems.setState({ popup: null }))
    cleanup()
    // Read mode.
    wide(true)
    await act(async () => void (await enterReadMode('user')))
    await settle()
    render(<ItemsHost />)
    act(() => openNote(a))
    await screen.findByRole('dialog', { name: /^Note/ })
    expect(st().panelOpen).toBe(false)
    await act(async () => void (await enterEditMode()))
  })

  it('has no side effects on the popup when it closes: Escape still closes it', async () => {
    const { a } = three()
    wide(true)
    await settle()
    render(<ItemsHost />)
    act(() => openNote(a))
    const d = await screen.findByRole('dialog', { name: 'Note: First' })
    expect(within(d).getByLabelText('Note title')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useItems.getState().popup).toBeNull()
  })
})
