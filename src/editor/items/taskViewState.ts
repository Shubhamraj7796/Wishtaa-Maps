import { create } from 'zustand'
import { defaultFilters, type TaskFilters } from '@/core/tasks/agenda'

/** What the Task view is showing: the filters and whether their panel is open. Kept while you switch between Map, Outline and Tasks. */
interface TaskViewState {
  filters: TaskFilters
  panel: boolean
}

export const useTaskView = create<TaskViewState>(() => ({ filters: defaultFilters(), panel: false }))
export const setFilters = (patch: Partial<TaskFilters>) => useTaskView.setState((s) => ({ filters: { ...s.filters, ...patch } }))
export const resetFilters = () => useTaskView.setState({ filters: defaultFilters() })
export const toggleFilterPanel = () => useTaskView.setState((s) => ({ panel: !s.panel }))
