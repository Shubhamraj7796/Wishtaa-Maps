// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { addChild } from '@/core/model/commands'
import { patchTask } from '@/core/model/content'
import { addTask } from '@/core/model/tasks'
import { addDays, ymd } from '@/core/tasks/agenda'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { enterEditMode, enterReadMode } from '../readmode'
import { closeFile, mapDoc, openFile } from '../session'
import { useEditor } from '../store'
import { ItemsHost } from './ItemsHost'
import { useItems } from './state'
import { resetFilters, useTaskView } from './taskViewState'
import { TaskView } from './TaskView'

let repo: RepositoryCore
let t = 1_700_000_000_000
const st = () => useEditor.getState()
const settle = (ms = 30) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))
const today = ymd(new Date())

beforeEach(async () => {
  installMemoryLocalStorage()
  repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'map', name: 'Tasks', content: buildStarterContent('blank') })
  await openFile(f.id, repo)
  await settle()
  useItems.setState({ list: null, popup: null })
  resetFilters()
  useTaskView.setState({ panel: false })
})
afterEach(async () => {
  cleanup()
  await closeFile()
})

function seed() {
  const dose = addChild(mapDoc, st().rootId, 'Dose')
  const storage = addChild(mapDoc, dose, 'Storage')
  const over = addTask(mapDoc, { topicId: dose, title: 'Late one', due: addDays(today, -2) })
  const now = addTask(mapDoc, { topicId: storage, title: 'Due today', due: today, priority: 1 })
  const later = addTask(mapDoc, { topicId: dose, title: 'Far away', due: addDays(today, 40) })
  const none = addTask(mapDoc, { title: 'Loose' })
  const done = addTask(mapDoc, { topicId: dose, title: 'Finished', status: 'done', due: today })
  patchTask(mapDoc, dose, { done: false, dueDate: addDays(today, 1) })
  return { dose, storage, over, now, later, none, done }
}
const mount = () =>
  render(
    <>
      <TaskView />
      <ItemsHost />
    </>
  )

describe('the Task view (Agenda)', () => {
  it('lists the open tasks by date in their groups, each with its topic path as a small label', async () => {
    seed()
    await settle()
    mount()
    const groups = [...document.querySelectorAll('[data-agenda-group]')].map((g) => g.getAttribute('data-agenda-group'))
    expect(groups).toEqual(['overdue', 'today', 'tomorrow', 'later', 'nodate'])
    const today_ = document.querySelector('[data-agenda-group="today"]') as HTMLElement
    expect(today_.textContent).toContain('Due today')
    expect(today_.querySelector('[data-task-path]')?.textContent).toBe('Central Topic › Dose › Storage')
    // The Done task is hidden until the Done status is shown.
    expect(screen.queryByText('Finished')).toBeNull()
    // A topic that is a task (the older flag) is in the list too.
    expect(document.querySelector('[data-agenda-group="tomorrow"]')?.textContent).toContain('Dose')
  })

  it('the tick completes a task and it leaves the open list; a click on the row opens its popup', async () => {
    const { now } = seed()
    await settle()
    mount()
    fireEvent.click(within(document.querySelector(`[data-task-item="${now}"]`) as HTMLElement).getByRole('checkbox'))
    expect(st().tasks[now]?.status).toBe('done')
    expect(document.querySelector(`[data-task-item="${now}"]`)).toBeNull()
    fireEvent.click(document.querySelector('[data-task-row]') as HTMLElement)
    expect(useItems.getState().popup?.kind).toBe('task')
  })

  it('the filter panel is closed until the filter icon is used; status, priority, topic and dates narrow the list; Clear restores it', async () => {
    const { dose } = seed()
    await settle()
    mount()
    expect(document.querySelector('[data-task-filters]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    expect(document.querySelector('[data-task-filters]')).toBeTruthy()
    // Show Done too.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Done tasks' }))
    expect(screen.getByText('Finished')).toBeTruthy()
    // Priority 1 only.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show priority 1' }))
    expect(document.querySelectorAll('[data-task-item]')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Clear the filters' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear the filters' }))
    expect(screen.queryByText('Finished')).toBeNull()
    expect(document.querySelectorAll('[data-task-item]').length).toBeGreaterThan(1)
    // The topic filter: Dose and its sub topics, then only Dose.
    act(() => useTaskView.setState((s) => ({ filters: { ...s.filters, topicId: dose, withSub: true } })))
    expect(screen.getByText('Due today')).toBeTruthy()
    expect(screen.queryByText('Loose')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'This topic only' }))
    expect(screen.queryByText('Due today')).toBeNull()
    expect(screen.getByText('Late one')).toBeTruthy()
  })

  it('the search box finds a task with no topic too', async () => {
    seed()
    await settle()
    mount()
    fireEvent.change(screen.getByLabelText('Search tasks'), { target: { value: 'loose' } })
    expect(document.querySelectorAll('[data-task-item]')).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Search tasks'), { target: { value: 'nothing like this' } })
    expect(screen.getByText('No tasks match the filters.')).toBeTruthy()
  })

  it('Add a task starts a task on the selected topic and opens it', async () => {
    const { storage } = seed()
    act(() => useEditor.setState({ selected: [storage] }))
    await settle()
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Add a task' }))
    const k = Object.values(st().tasks).find((x) => x.title === '' && x.topicId === storage)
    expect(k).toBeTruthy()
    expect(useItems.getState().popup).toEqual({ kind: 'task', id: k?.id })
  })

  it('says so when the map has no tasks; in Read mode there is no Add and a tick changes nothing', async () => {
    mount()
    expect(screen.getByText(/No tasks in this map yet/)).toBeTruthy()
    cleanup()
    const { now } = seed()
    await settle()
    await act(async () => void (await enterReadMode('user')))
    await settle()
    mount()
    expect(screen.queryByRole('button', { name: 'Add a task' })).toBeNull()
    fireEvent.click(within(document.querySelector(`[data-task-item="${now}"]`) as HTMLElement).getByRole('checkbox'))
    expect(st().tasks[now]?.status).toBe('todo')
    await act(async () => void (await enterEditMode()))
  })

  it('every icon control has a name and none uses a native title', async () => {
    seed()
    await settle()
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const buttons = [...document.querySelectorAll('[data-task-view] button')]
    expect(buttons.every((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim() !== '')).toBe(true)
    expect(buttons.every((b) => !b.hasAttribute('title'))).toBe(true)
  })
})
