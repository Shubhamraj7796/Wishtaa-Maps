// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { addChild } from '@/core/model/commands'
import { addTask, allTasks } from '@/core/model/tasks'
import { addDays, ymd } from '@/core/tasks/agenda'
import { monthLabel, monthOf } from '@/core/tasks/month'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { enterEditMode, enterReadMode } from '../readmode'
import { closeFile, mapDoc, openFile } from '../session'
import { useEditor } from '../store'
import { ItemsHost } from './ItemsHost'
import { useItems } from './state'
import { goToday, pickDay, resetArrange, resetFilters, setMode, useTaskView } from './taskViewState'
import { TaskView } from './TaskView'

let repo: RepositoryCore
let t = 1_700_000_000_000
const st = () => useEditor.getState()
const settle = (ms = 30) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))
const today = ymd(new Date())
const tasksNow = () => allTasks(st().topics, st().tasks)
const byTitle = (title: string) => tasksNow().find((e) => e.title === title)

beforeEach(async () => {
  installMemoryLocalStorage()
  repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'map', name: 'Tasks', content: buildStarterContent('blank') })
  await openFile(f.id, repo)
  await settle()
  useItems.setState({ list: null, popup: null })
  resetFilters()
  resetArrange()
  setMode('agenda')
  goToday()
  useTaskView.setState({ panel: false })
})
afterEach(async () => {
  cleanup()
  await closeFile()
})

function seed() {
  const dose = addChild(mapDoc, st().rootId, 'Dose')
  addTask(mapDoc, { topicId: dose, title: 'Due today', due: today, priority: 1 })
  addTask(mapDoc, { topicId: dose, title: 'Timed today', due: today, time: '23:59' })
  addTask(mapDoc, { topicId: dose, title: 'Next week', due: addDays(today, 7) })
  addTask(mapDoc, { title: 'Loose' })
  addTask(mapDoc, { topicId: dose, title: 'Finished', status: 'done', due: today })
  addTask(mapDoc, { topicId: dose, title: 'In progress', status: 'doing' })
}
const mount = () =>
  render(
    <>
      <TaskView />
      <ItemsHost />
    </>
  )
const mode = (m: string) => fireEvent.click(screen.getByRole('radio', { name: m }))
const cell = (date: string) => document.querySelector(`[data-cell="${date}"]`) as HTMLElement
const dayButton = (date: string) => document.querySelector(`[data-day="${date}"]`) as HTMLElement

describe('the three ways to see the tasks', () => {
  it('has Agenda, Month and Board as icon choices, starts on Agenda, and remembers the choice on this device', async () => {
    seed()
    await settle()
    mount()
    const group = screen.getByRole('radiogroup', { name: 'Task view' })
    expect(within(group).getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual(['Agenda', 'Month', 'Board'])
    expect(screen.getByRole('radio', { name: 'Agenda' }).getAttribute('aria-checked')).toBe('true')
    mode('Month')
    expect(document.querySelector('[data-task-view]')?.getAttribute('data-task-mode')).toBe('month')
    expect(localStorage.getItem('wishtaa.taskMode')).toBe('month')
    mode('Board')
    expect(localStorage.getItem('wishtaa.taskMode')).toBe('board')
    expect(screen.getByRole('radio', { name: 'Board' }).getAttribute('aria-checked')).toBe('true')
    // The Arrange menu belongs to the Agenda only.
    expect(screen.queryByRole('button', { name: 'Arrange' })).toBeNull()
    mode('Agenda')
    expect(screen.getByRole('button', { name: 'Arrange' })).toBeTruthy()
  })

  it('a bad remembered value is ignored (starts on Agenda)', async () => {
    localStorage.setItem('wishtaa.taskMode', 'nonsense')
    const { loadMode } = await import('./taskViewState')
    expect(loadMode()).toBe('agenda')
  })
})

describe('the Month calendar', () => {
  it('shows the month name, today marked, and each task on its day (titles with a time first)', async () => {
    seed()
    await settle()
    setMode('month')
    mount()
    expect(screen.getByRole('grid', { name: monthLabel(monthOf(today)) })).toBeTruthy()
    expect(document.querySelector('[data-month-label]')?.textContent).toBe(monthLabel(monthOf(today)))
    expect(dayButton(today).getAttribute('aria-current')).toBe('date')
    const chips = [...cell(today).querySelectorAll('[data-task-chip]')].map((c) => c.textContent)
    expect(chips).toHaveLength(2) // Finished is hidden (the Done status is not shown by default)
    expect(chips[0]).toMatch(/11:59 (PM|pm)|23:59/) // the timed task comes first, with its time
    expect(chips[0]).toContain('Timed today')
    expect(chips[1]).toBe('Due today')
    expect(dayButton(today).getAttribute('aria-label')).toMatch(/2 tasks$/)
  })

  it('picking a day lists its tasks; a click on a task (chip or row) opens it', async () => {
    seed()
    await settle()
    setMode('month')
    mount()
    fireEvent.click(dayButton(today))
    const list = document.querySelector('[data-day-list]') as HTMLElement
    expect(within(list).getAllByRole('button').some((b) => b.textContent?.includes('Due today'))).toBe(true)
    fireEvent.click(cell(today).querySelector('[data-task-chip]') as HTMLElement)
    expect(await screen.findByRole('dialog', { name: /Task/ })).toBeTruthy()
  })

  it('tasks with no date are under their own icon with a count, and are not on the grid', async () => {
    seed()
    await settle()
    setMode('month')
    mount()
    const noDate = document.querySelector('[data-no-date]') as HTMLElement
    expect(noDate.getAttribute('aria-label')).toBe('Tasks with no date, 2') // Loose and In progress
    expect(document.querySelector('[data-month-view]')?.textContent).not.toContain('Loose')
    fireEvent.click(noDate)
    const list = document.querySelector('[data-day-list]') as HTMLElement
    expect(list.textContent).toContain('Loose')
    expect(list.textContent).toContain('In progress')
    fireEvent.click(noDate) // again: back to today
    expect(useTaskView.getState().day).toBe(today)
  })

  it('moves between months with the icons, Today brings it back, and the label follows', async () => {
    seed()
    await settle()
    setMode('month')
    mount()
    const label = () => document.querySelector('[data-month-label]')?.textContent
    const here = monthOf(today)
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(label()).not.toBe(monthLabel(here))
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(label()).not.toBe(monthLabel(here))
    fireEvent.click(screen.getByRole('button', { name: 'Go to today' }))
    expect(label()).toBe(monthLabel(here))
    expect(useTaskView.getState().day).toBe(today)
  })

  it('arrow keys move the picked day (a day or a week), Page Down moves a month, the focus follows', async () => {
    seed()
    await settle()
    setMode('month')
    mount()
    pickDay(today)
    dayButton(today).focus()
    fireEvent.keyDown(dayButton(today), { key: 'ArrowRight' })
    const tomorrow = addDays(today, 1)
    expect(useTaskView.getState().day).toBe(tomorrow)
    await settle(0)
    expect(document.activeElement).toBe(dayButton(tomorrow))
    fireEvent.keyDown(dayButton(tomorrow), { key: 'ArrowDown' })
    expect(useTaskView.getState().day).toBe(addDays(today, 8))
    const before = useTaskView.getState().month
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'PageDown' })
    expect(useTaskView.getState().month).not.toEqual(before)
    // a key that is not for the calendar changes nothing
    const d = useTaskView.getState().day
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'x' })
    expect(useTaskView.getState().day).toBe(d)
  })

  it('the plus icon adds a task due on the picked day and opens it', async () => {
    seed()
    await settle()
    setMode('month')
    mount()
    const target = addDays(today, 3)
    pickDay(target)
    await settle(0)
    fireEvent.click(screen.getByRole('button', { name: /^Add a task on / }))
    expect(await screen.findByRole('dialog', { name: /Task/ })).toBeTruthy()
    const made = tasksNow().filter((e) => e.due === target)
    expect(made).toHaveLength(1)
    expect(made[0]?.title).toBe('')
  })

  it('the search and filters apply; the Done status shows finished tasks, dimmed', async () => {
    seed()
    await settle()
    setMode('month')
    mount()
    fireEvent.change(screen.getByLabelText('Search tasks'), { target: { value: 'timed' } })
    expect([...cell(today).querySelectorAll('[data-task-chip]')].map((c) => c.textContent?.includes('Timed today'))).toEqual([true])
    fireEvent.change(screen.getByLabelText('Search tasks'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Done tasks' }))
    const done = [...cell(today).querySelectorAll('[data-task-chip]')].find((c) => c.textContent === 'Finished') as HTMLElement
    expect(done).toBeTruthy()
    expect(done.className).toMatch(/line-through/)
  })

  it('in Read mode nothing can be added, and the calendar can still be used', async () => {
    seed()
    await settle()
    await act(async () => void (await enterReadMode('user')))
    setMode('month')
    mount()
    expect(screen.queryByRole('button', { name: /^Add a task/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(document.querySelector('[data-month-label]')).toBeTruthy()
    await act(async () => void (await enterEditMode()))
  })

  it('an empty map shows an empty calendar with a hint on the picked day', async () => {
    setMode('month')
    mount()
    expect(document.querySelector('[data-day-list]')?.textContent).toMatch(/No tasks on this day/)
  })
})

describe('the Board', () => {
  it('has the three columns with their counts and cards, and ignores the status filter (Done is there)', async () => {
    seed()
    await settle()
    setMode('board')
    mount()
    const col = (s: string) => document.querySelector(`[data-board-column="${s}"]`) as HTMLElement
    expect(['todo', 'doing', 'done'].map((s) => col(s).getAttribute('aria-label'))).toEqual(['To do, 4', 'Doing, 1', 'Done, 1'])
    expect(col('todo').textContent).toContain('Due today')
    expect(col('doing').textContent).toContain('In progress')
    expect(col('done').textContent).toContain('Finished')
    // sorted: priority 1 first
    expect([...col('todo').querySelectorAll('[data-board-card]')][0]?.textContent).toContain('Due today')
  })

  it('the filter panel has no Status row on the Board (the columns are the statuses)', async () => {
    seed()
    await settle()
    setMode('board')
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    expect(screen.queryByRole('checkbox', { name: 'Show To do tasks' })).toBeNull()
    expect(screen.getByRole('group', { name: 'Priority filter' })).toBeTruthy()
  })

  it('the two small icons on a card move it to another column (keyboard and touch way)', async () => {
    seed()
    await settle()
    setMode('board')
    mount()
    const card = within(document.querySelector('[data-board-column="todo"]') as HTMLElement).getAllByRole('listitem').find((c) => c.textContent?.includes('Due today')) as HTMLElement
    expect(within(card).queryByRole('button', { name: 'Move to To do' })).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: 'Move to Doing' }))
    expect(byTitle('Due today')?.status).toBe('doing')
    expect(document.querySelector('[data-board-column="doing"]')?.textContent).toContain('Due today')
    const moved = within(document.querySelector('[data-board-column="doing"]') as HTMLElement).getAllByRole('listitem').find((c) => c.textContent?.includes('Due today')) as HTMLElement
    fireEvent.click(within(moved).getByRole('button', { name: 'Move to Done' }))
    expect(byTitle('Due today')?.status).toBe('done')
  })

  it('dragging a card onto another column changes its status; dropping on its own column changes nothing', async () => {
    seed()
    await settle()
    setMode('board')
    mount()
    const store: Record<string, string> = {}
    const dataTransfer = { setData: (k: string, v: string) => void (store[k] = v), getData: (k: string) => store[k] ?? '', effectAllowed: '', dropEffect: '' }
    const card = document.querySelector(`[data-board-card="${byTitle('Next week')?.id}"]`) as HTMLElement
    expect(card.getAttribute('draggable')).toBe('true')
    fireEvent.dragStart(card, { dataTransfer })
    const doing = document.querySelector('[data-board-column="doing"]') as HTMLElement
    fireEvent.dragOver(doing, { dataTransfer })
    fireEvent.drop(doing, { dataTransfer })
    expect(byTitle('Next week')?.status).toBe('doing')
    fireEvent.dragStart(document.querySelector(`[data-board-card="${byTitle('Next week')?.id}"]`) as HTMLElement, { dataTransfer })
    const before = byTitle('Next week')?.updatedAt
    fireEvent.drop(document.querySelector('[data-board-column="doing"]') as HTMLElement, { dataTransfer })
    expect(byTitle('Next week')?.updatedAt).toBe(before)
  })

  it('the plus icon in a column adds a task in that status and opens it', async () => {
    await settle()
    setMode('board')
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Add a task to Doing' }))
    expect(await screen.findByRole('dialog', { name: /Task/ })).toBeTruthy()
    expect(tasksNow().filter((e) => e.status === 'doing')).toHaveLength(1)
  })

  it('a click on a card opens the task', async () => {
    seed()
    await settle()
    setMode('board')
    mount()
    fireEvent.click(document.querySelector(`[data-board-card="${byTitle('Loose')?.id}"] [data-task-row]`) as HTMLElement)
    expect(await screen.findByRole('dialog', { name: /Task/ })).toBeTruthy()
  })

  it('in Read mode cards are not draggable, the icons only explain, and no column has a plus', async () => {
    seed()
    await settle()
    await act(async () => void (await enterReadMode('user')))
    setMode('board')
    mount()
    const card = document.querySelector(`[data-board-card="${byTitle('Loose')?.id}"]`) as HTMLElement
    expect(card.getAttribute('draggable')).toBe('false')
    expect(screen.queryByRole('button', { name: /^Add a task to / })).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: 'Move to Doing' }))
    expect(byTitle('Loose')?.status).toBe('todo')
    const store: Record<string, string> = { 'text/plain': byTitle('Loose')?.id ?? '' }
    const dataTransfer = { setData: () => undefined, getData: (k: string) => store[k] ?? '', dropEffect: '' }
    fireEvent.drop(document.querySelector('[data-board-column="done"]') as HTMLElement, { dataTransfer })
    expect(byTitle('Loose')?.status).toBe('todo')
    await act(async () => void (await enterEditMode()))
  })

  it('an empty column says what to do', async () => {
    await settle()
    setMode('board')
    mount()
    expect(document.querySelector('[data-board-column="done"]')?.textContent).toMatch(/Nothing here/)
  })
})
