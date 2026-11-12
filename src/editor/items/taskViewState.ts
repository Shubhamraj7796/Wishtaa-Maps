import { create } from 'zustand'
import { defaultArrange, defaultFilters, parseArrange, type Arrange, type TaskFilters } from '@/core/tasks/agenda'

const ARRANGE_KEY = 'wishtaa.taskArrange'

function loadArrange(): Arrange {
  try {
    return parseArrange(JSON.parse(localStorage.getItem(ARRANGE_KEY) ?? 'null'))
  } catch {
    return defaultArrange()
  }
}

/**
 * What the Task view is showing: the filters, how the list is arranged (the grouping and the sort, remembered on this device) and whether
 * the filter panel is open. Kept while you switch between Map, Outline and Tasks.
 */
interface TaskViewState {
  filters: TaskFilters
  arrange: Arrange
  panel: boolean
}

export const useTaskView = create<TaskViewState>(() => ({ filters: defaultFilters(), arrange: loadArrange(), panel: false }))
export const setFilters = (patch: Partial<TaskFilters>) => useTaskView.setState((s) => ({ filters: { ...s.filters, ...patch } }))
export const resetFilters = () => useTaskView.setState({ filters: defaultFilters() })
export const toggleFilterPanel = () => useTaskView.setState((s) => ({ panel: !s.panel }))
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
