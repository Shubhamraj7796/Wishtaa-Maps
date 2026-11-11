// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { addChild } from '@/core/model/commands'
import { patchTask } from '@/core/model/content'
import { addTask, legacyTaskId } from '@/core/model/tasks'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { enterEditMode, enterReadMode } from '../readmode'
import { getScene } from '../scene'
import { closeFile, mapDoc, openFile } from '../session'
import { useEditor } from '../store'
import { OutlineView } from '../ui/OutlineView'
import { ItemsHost } from './ItemsHost'
import { openTask, useItems } from './state'

let repo: RepositoryCore
let t = 1_700_000_000_000
const st = () => useEditor.getState()
const settle = (ms = 30) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))

beforeEach(async () => {
  installMemoryLocalStorage()
  repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'map', name: 'Tasks', content: buildStarterContent('blank') })
  await openFile(f.id, repo)
  await settle()
  useItems.setState({ list: null, popup: null })
})
afterEach(async () => {
  cleanup()
  await closeFile()
})
const topic = () => addChild(mapDoc, st().rootId, 'Dose')

describe('the tasks icon of a topic', () => {
  it('shows only when the topic has tasks of its own, with a count for several, and opens a list', async () => {
    const id = topic()
    await settle()
    render(
      <>
        <OutlineView />
        <ItemsHost />
      </>
    )
    expect(document.querySelector(`[data-tasks-chip="${id}"]`)).toBeNull()
    act(() => void addTask(mapDoc, { topicId: id, title: 'One' }))
    const one = document.querySelector(`[data-tasks-chip="${id}"]`) as HTMLElement
    expect(one.getAttribute('aria-label')).toBe('Task. Open the list')
    act(() => void addTask(mapDoc, { topicId: id, title: 'Two', status: 'done' }))
    const two = document.querySelector(`[data-tasks-chip="${id}"]`) as HTMLElement
    expect(two.getAttribute('aria-label')).toBe('2 tasks (1 open). Open the list')
    expect(st().itemCounts[id]).toEqual({ notes: 0, tasks: 2 })
    fireEvent.click(two)
    const menu = await screen.findByRole('menu', { name: 'Tasks of this topic' })
    expect(within(menu).getAllByRole('menuitem').filter((r) => r.hasAttribute('data-task-row'))).toHaveLength(2)
    expect(within(menu).getByRole('menuitem', { name: 'Add a task' })).toBeTruthy()
  })

  it('the map gives the badge row room for the tasks icon', async () => {
    const id = topic()
    await settle()
    const before = getScene().boxes.get(id)?.w ?? 0
    act(() => void addTask(mapDoc, { topicId: id, title: 'One' }))
    expect(getScene().boxes.get(id)?.w ?? 0).toBeGreaterThanOrEqual(before)
  })
})

describe('the task popup', () => {
  it('shows status, due date, priority and topic; changes are saved at once', async () => {
    const id = topic()
    const k = addTask(mapDoc, { topicId: id, title: 'Order stock', due: '2026-11-20' })
    await settle()
    render(<ItemsHost />)
    act(() => openTask(k))
    const d = await screen.findByRole('dialog', { name: 'Task: Order stock' })
    expect((screen.getByLabelText('Task title') as HTMLInputElement).value).toBe('Order stock')
    expect((screen.getByLabelText('Due date') as HTMLInputElement).value).toBe('2026-11-20')
    expect(d.querySelector('[data-topic-path]')?.textContent).toBe('Central Topic › Dose')
    fireEvent.click(screen.getByRole('radio', { name: 'Doing' }))
    expect(st().tasks[k]?.status).toBe('doing')
    expect(screen.getByRole('radio', { name: 'Doing' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('radio', { name: 'Priority 2' }))
    expect(st().tasks[k]?.priority).toBe(2)
    fireEvent.click(screen.getByRole('radio', { name: 'Priority 2' }))
    expect(st().tasks[k]?.priority).toBeUndefined()
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-12-01' } })
    expect(st().tasks[k]?.due).toBe('2026-12-01')
    fireEvent.click(screen.getByRole('button', { name: 'Clear the due date' }))
    expect(st().tasks[k]?.due).toBeUndefined()
  })

  it('every icon control has a name and none uses a native title', async () => {
    const id = topic()
    const k = addTask(mapDoc, { topicId: id, title: 'x' })
    await settle()
    render(<ItemsHost />)
    act(() => openTask(k))
    const d = await screen.findByRole('dialog')
    const buttons = [...d.querySelectorAll('button')]
    expect(buttons.every((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim() !== '')).toBe(true)
    expect(buttons.every((b) => !b.hasAttribute('title'))).toBe(true)
  })

  it('the title is saved by itself; closing saves a title just typed; a task with nothing in it is not kept', async () => {
    const id = topic()
    const k = addTask(mapDoc, { topicId: id, title: 'Old' })
    const blank = addTask(mapDoc, { topicId: id })
    await settle()
    render(<ItemsHost />)
    act(() => openTask(k))
    fireEvent.change(await screen.findByLabelText('Task title'), { target: { value: 'Quick' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(st().tasks[k]?.title).toBe('Quick')
    act(() => openTask(blank))
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }))
    expect(st().tasks[blank]).toBeUndefined()
  })

  it('moves a task to another topic with the topic picker, or to none', async () => {
    const a = topic()
    const b = addChild(mapDoc, st().rootId, 'Storage')
    const k = addTask(mapDoc, { topicId: a, title: 'Move me' })
    await settle()
    render(<ItemsHost />)
    act(() => openTask(k))
    fireEvent.click(await screen.findByRole('button', { name: 'Choose the topic' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /Central Topic › Storage/ }))
    expect(st().tasks[k]?.topicId).toBe(b)
    fireEvent.click(screen.getByRole('button', { name: 'Choose the topic' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'No topic' }))
    expect(st().tasks[k]?.topicId).toBeNull()
  })

  it('Delete removes it at once and the notice Undo brings it back', async () => {
    const id = topic()
    const k = addTask(mapDoc, { topicId: id, title: 'Gone' })
    await settle()
    mapDoc.undo.stopCapturing()
    render(<ItemsHost />)
    act(() => openTask(k))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete this task' }))
    expect(st().tasks[k]).toBeUndefined()
    act(() => st().notice?.action?.run())
    expect(st().tasks[k]?.title).toBe('Gone')
  })

  it('a topic that is a task opens in the same popup (title is the topic text); its status is kept in the topic flag', async () => {
    const id = topic()
    patchTask(mapDoc, id, { done: false })
    await settle()
    render(<ItemsHost />)
    act(() => openTask(legacyTaskId(id)))
    const d = await screen.findByRole('dialog', { name: 'Task: Dose' })
    expect(screen.queryByLabelText('Task title')).toBeNull()
    expect(d.textContent).toContain('This task is the topic itself.')
    fireEvent.click(screen.getByRole('radio', { name: 'Done' }))
    expect(st().topics[id]?.task?.done).toBe(true)
  })

  it('in Read mode nothing can be changed and there is no Delete', async () => {
    const id = topic()
    const k = addTask(mapDoc, { topicId: id, title: 'Look' })
    await settle()
    await act(async () => void (await enterReadMode('user')))
    await settle()
    render(<ItemsHost />)
    act(() => openTask(k))
    await screen.findByRole('dialog')
    expect(screen.queryByRole('button', { name: 'Delete this task' })).toBeNull()
    expect((screen.getByLabelText('Task title') as HTMLInputElement).readOnly).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: 'Done' }))
    expect(st().tasks[k]?.status).toBe('todo')
    await act(async () => void (await enterEditMode()))
  })
})
