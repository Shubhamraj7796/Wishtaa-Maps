import { create } from 'zustand'
import { defaultArrange, defaultFilters, parseArrange, ymd, type Arrange, type TaskFilters } from '@/core/tasks/agenda'
import { monthOf, type MonthRef } from '@/core/tasks/month'

const ARRANGE_KEY = 'wishtaa.taskArrange'
const MODE_KEY = 'wishtaa.taskMode'

/** How the Task view draws the tasks: a list by date (Agenda), a calendar month, or columns by status (Board). */
export type TaskMode = 'agenda' | 'month' | 'board'
export const TASK_MODES: TaskMode[] = ['agenda', 'month', 'board']

function loadArrange(): Arrange {
  try {
    return parseArrange(JSON.parse(localStorage.getItem(ARRANGE_KEY) ?? 'null'))
  } catch {
    return defaultArrange()
  }
}

export function loadMode(): TaskMode {
  try {
    const v = localStorage.getItem(MODE_KEY)
    return TASK_MODES.includes(v as TaskMode) ? (v as TaskMode) : 'agenda'
  } catch {
    return 'agenda'
  }
}

/** The day picked on the calendar: a date "YYYY-MM-DD", or 'nodate' for the tasks that have none. */
export type PickedDay = string | 'nodate'

/**
 * What the Task view is showing: the way it is drawn (Agenda, Month or Board, remembered on this device), the filters, how the Agenda is
 * arranged (also remembered), whether the filter panel is open, and the month and day picked on the calendar. Kept while you switch between Map,
 * Outline and Tasks.
 */
interface TaskViewState {
  mode: TaskMode
  filters: TaskFilters
  arrange: Arrange
  panel: boolean
  month: MonthRef
  day: PickedDay
}

const today = () => ymd(new Date())

export const useTaskView = create<TaskViewState>(() => ({
  mode: loadMode(),
  filters: defaultFilters(),
  arrange: loadArrange(),
  panel: false,
  month: monthOf(today()),
  day: today(),
}))
export const setFilters = (patch: Partial<TaskFilters>) => useTaskView.setState((s) => ({ filters: { ...s.filters, ...patch } }))
export const resetFilters = () => useTaskView.setState({ filters: defaultFilters() })
export const toggleFilterPanel = () => useTaskView.setState((s) => ({ panel: !s.panel }))
export function setMode(mode: TaskMode) {
  useTaskView.setState({ mode })
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    // Storage blocked: the choice still works until the page is closed.
  }
}
export const setMonth = (month: MonthRef) => useTaskView.setState({ month })
/** Picks a day on the calendar and shows its month. */
export const pickDay = (day: PickedDay) => useTaskView.setState((s) => ({ day, month: day === 'nodate' ? s.month : monthOf(day) }))
/** Back to today (its month and the day itself). */
export const goToday = () => pickDay(today())
export function setArrange(patch: Partial<Arrange>) {
  const next = { ...useTaskView.getState().arrange, ...patch }
  useTaskView.setState({ arrange: next })
  try {
    localStorage.setItem(ARRANGE_KEY, JSON.stringify(next))
  } catch {
    // Storage blocked: the choice still works until the page is closed.
  }
}
export const resetArrange = () => setArrange(defaultArrange())
