// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { addChild } from '@/core/model/commands'
import { setNote } from '@/core/model/content'
import { addNote } from '@/core/model/notes'
import { addTask, legacyTaskId, tasksOfNote, toggleTaskEntry } from '@/core/model/tasks'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { enterEditMode, enterReadMode } from '../readmode'
import { closeFile, mapDoc, openFile } from '../session'
import { useEditor } from '../store'
import { ItemsHost } from './ItemsHost'
import { openNote, useItems } from './state'
import { resetArrange, resetFilters, useTaskView } from './taskViewState'
import { TaskView } from './TaskView'

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
  resetFilters()
  resetArrange()
  useTaskView.setState({ panel: false })
})
afterEach(async () => {
  cleanup()
  await closeFile()
})

const topic = () => addChild(mapDoc, st().rootId, 'Dose')
async function openNoteWith(title = 'Storage') {
  const id = topic()
  const n = addNote(mapDoc, id, { title, html: '<p>cold chain</p>' }) as string
  await settle()
  render(<ItemsHost />)
  act(() => openNote(n))
  await screen.findByRole('dialog', { name: `Note: ${title}` })
  return { id, n }
}

describe('the task on a note', () => {
  it('a floating icon opens a compact panel; the title starts as the note title; Add the task links it to the note and its topic and shows the chip', async () => {
    const { id, n } = await openNoteWith()
    expect(document.querySelector('[data-note-task-chip]')).toBeNull()
    const icon = screen.getByRole('button', { name: 'Add task details' })
    expect(icon.hasAttribute('title')).toBe(false)
    fireEvent.click(icon)
    const panel = document.querySelector('[data-note-task-panel]') as HTMLElement
    expect((within(panel).getByLabelText('Task title') as HTMLInputElement).value).toBe('Storage')
    fireEvent.change(within(panel).getByLabelText('Due date'), { target: { value: '2026-11-14' } })
    fireEvent.change(within(panel).getByLabelText('Due time'), { target: { value: '17:00' } })
    fireEvent.click(within(panel).getByRole('radio', { name: 'Doing' }))
    fireEvent.click(within(panel).getByRole('radio', { name: /^Priority 2/ }))
    expect(tasksOfNote(st().tasks, n)).toHaveLength(0) // nothing is created until Add
    fireEvent.click(within(panel).getByRole('button', { name: /Add the task/ }))
    const k = tasksOfNote(st().tasks, n)
    expect(k).toHaveLength(1)
    expect(k[0]).toMatchObject({ title: 'Storage', topicId: id, noteId: n, due: '2026-11-14', time: '17:00', status: 'doing', priority: 2 })
    expect(document.querySelector('[data-note-task-panel]')).toBeNull()
    const chip = document.querySelector('[data-note-task-chip]') as HTMLElement
    expect(chip.textContent).toMatch(/^Task · .*14.*5:00.* · Doing$/)
    expect(screen.getByRole('button', { name: 'Edit task details' })).toBeTruthy()
  })

  it('closing the panel without adding creates nothing; Escape closes the panel first and the note stays open', async () => {
    const { n } = await openNoteWith()
    fireEvent.click(screen.getByRole('button', { name: 'Add task details' }))
    expect(document.querySelector('[data-note-task-panel]')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.querySelector('[data-note-task-panel]')).toBeNull()
    expect(screen.getByRole('dialog', { name: /^Note/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add task details' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close the task details' }))
    expect(tasksOfNote(st().tasks, n)).toHaveLength(0)
    expect(Object.keys(st().tasks)).toHaveLength(0)
  })

  it('the chip opens the panel to edit; changes are saved at once and the chip follows (also when the task is ticked elsewhere)', async () => {
    const { id, n } = await openNoteWith()
    const k = addTask(mapDoc, { topicId: id, title: 'Call', noteId: n, due: '2026-11-14', time: '17:00' })
    await settle()
    const chip = document.querySelector('[data-note-task-chip]') as HTMLElement
    expect(chip.textContent).toContain('To do')
    fireEvent.click(chip)
    const panel = document.querySelector('[data-note-task-panel]') as HTMLElement
    expect((within(panel).getByLabelText('Due time') as HTMLInputElement).value).toBe('17:00')
    fireEvent.change(within(panel).getByLabelText('Due time'), { target: { value: '18:30' } })
    expect(st().tasks[k]?.time).toBe('18:30')
    fireEvent.click(within(panel).getByRole('radio', { name: 'Doing' }))
    expect(document.querySelector('[data-note-task-chip]')?.textContent).toMatch(/6:30.* · Doing$/)
    fireEvent.change(within(panel).getByLabelText('Task title'), { target: { value: 'Call back' } })
    await settle(650)
    expect(st().tasks[k]?.title).toBe('Call back')
    // Completing the task from somewhere else (the Task view) updates the chip.
    act(() => toggleTaskEntry(mapDoc, { id: k, status: 'doing' }))
    expect(document.querySelector('[data-note-task-chip]')?.textContent).toMatch(/ · Done$/)
    // Clearing the date also clears the time.
    fireEvent.change(within(document.querySelector('[data-note-task-panel]') as HTMLElement).getByLabelText('Due date'), { target: { value: '' } })
    expect(st().tasks[k]).not.toHaveProperty('due')
    expect(st().tasks[k]).not.toHaveProperty('time')
    expect(document.querySelector('[data-note-task-chip]')?.textContent).toBe('Task · Done')
  })

  it('Remove this task takes the task away with an Undo, and the note stays', async () => {
    const { id, n } = await openNoteWith()
    addTask(mapDoc, { topicId: id, title: 'Call', noteId: n })
    await settle()
    fireEvent.click(document.querySelector('[data-note-task-chip]') as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Remove this task' }))
    expect(tasksOfNote(st().tasks, n)).toHaveLength(0)
    expect(st().notes[n]).toBeTruthy()
    expect(document.querySelector('[data-note-task-chip]')).toBeNull()
  })

  it('a second task on the same note (two devices) shows as +1 and nothing is lost', async () => {
    const { id, n } = await openNoteWith()
    addTask(mapDoc, { topicId: id, title: 'First', noteId: n }, 100)
    addTask(mapDoc, { topicId: id, title: 'Second', noteId: n }, 200)
    await settle()
    const chip = document.querySelector('[data-note-task-chip]') as HTMLElement
    expect(chip.textContent).toContain('+1')
    expect(chip.getAttribute('aria-label')).toContain('1 more')
  })

  it('Read mode: no floating icon, the chip is shown and opens the details to read', async () => {
    const { id, n } = await openNoteWith()
    addTask(mapDoc, { topicId: id, title: 'Call', noteId: n, due: '2026-11-14' })
    await settle()
    await act(async () => void (await enterReadMode('user')))
    await settle()
    expect(screen.queryByRole('button', { name: 'Add task details' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit task details' })).toBeNull()
    fireEvent.click(document.querySelector('[data-note-task-chip]') as HTMLElement)
    const panel = document.querySelector('[data-note-task-panel]') as HTMLElement
    expect((within(panel).getByLabelText('Due date') as HTMLInputElement).disabled).toBe(true)
    expect(within(panel).queryByRole('button', { name: 'Remove this task' })).toBeNull()
    fireEvent.click(within(panel).getByRole('radio', { name: 'Done' }))
    expect(Object.values(st().tasks)[0]?.status).toBe('todo')
    await act(async () => void (await enterEditMode()))
  })

  it('deleting a note keeps its task; a new empty note that has a task is not thrown away when closed', async () => {
    const { id, n } = await openNoteWith('Gone')
    const k = addTask(mapDoc, { topicId: id, title: 'Keep me', noteId: n })
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Delete this note' }))
    expect(st().notes[n]).toBeUndefined()
    expect(st().tasks[k]).toMatchObject({ title: 'Keep me', noteId: n })
    // An empty note with a task survives closing.
    const e = addNote(mapDoc, id, { title: '', html: '' }) as string
    const k2 = addTask(mapDoc, { topicId: id, title: 'On empty', noteId: e })
    await settle()
    act(() => openNote(e))
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }))
    expect(st().notes[e]).toBeTruthy()
    expect(st().tasks[k2]).toBeTruthy()
  })
})

describe('the Task view opens the note a task belongs to', () => {
  it('a row of a task with a note opens that note; a task with none (or whose note is gone) opens its own popup', async () => {
    const id = topic()
    const n = addNote(mapDoc, id, { title: 'Meeting', html: '<p>x</p>' }) as string
    const withNote = addTask(mapDoc, { topicId: id, title: 'Linked', noteId: n })
    const plain = addTask(mapDoc, { topicId: id, title: 'Plain' })
    const orphan = addTask(mapDoc, { topicId: id, title: 'Orphan', noteId: 'no-such-note' })
    await settle()
    render(
      <>
        <TaskView />
        <ItemsHost />
      </>
    )
    const row = (k: string) => document.querySelector(`[data-task-row="${k}"]`) as HTMLElement
    fireEvent.click(row(withNote))
    expect(useItems.getState().popup).toEqual({ kind: 'note', id: n })
    act(() => useItems.setState({ popup: null }))
    fireEvent.click(row(plain))
    expect(useItems.getState().popup).toEqual({ kind: 'task', id: plain })
    act(() => useItems.setState({ popup: null }))
    fireEvent.click(row(orphan))
    expect(useItems.getState().popup).toEqual({ kind: 'task', id: orphan })
  })

  it('a task on the first note of a topic opens that note when it has text, and the task popup when it has none', async () => {
    const id = topic()
    setNote(mapDoc, id, '<p>first</p>')
    const k = addTask(mapDoc, { topicId: id, title: 'On first', noteId: `topic:${id}` })
    await settle()
    render(
      <>
        <TaskView />
        <ItemsHost />
      </>
    )
    fireEvent.click(document.querySelector(`[data-task-row="${k}"]`) as HTMLElement)
    expect(useItems.getState().popup).toEqual({ kind: 'note', id: `topic:${id}` })
    act(() => useItems.setState({ popup: null }))
    act(() => setNote(mapDoc, id, ''))
    fireEvent.click(document.querySelector(`[data-task-row="${k}"]`) as HTMLElement)
    expect(useItems.getState().popup).toEqual({ kind: 'task', id: k })
    expect(legacyTaskId(id)).toBe(`topic:${id}`)
  })
})
