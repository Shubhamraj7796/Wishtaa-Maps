import { buildIndex, descendantIds, type TopicMap } from '../model/tree'
import { topicPath, type TaskEntry, type TaskStatus } from '../model/tasks'

export type GroupId = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'nodate' | 'done'
export const GROUPS: { id: GroupId; label: string }[] = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'week', label: 'This week' },
  { id: 'later', label: 'Later' },
  { id: 'nodate', label: 'No date' },
  { id: 'done', label: 'Done' },
]

const pad = (n: number) => String(n).padStart(2, '0')
/** A date as "YYYY-MM-DD" in local time. */
export const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
/** The date `n` days after a "YYYY-MM-DD" date (negative: before). */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + n)
  return ymd(d)
}
/** "Nov 20" (or the text itself when it is not a date). */
export function formatDue(d: string): string {
  const date = new Date(`${d}T00:00:00`)
  return Number.isNaN(date.getTime()) ? d : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
/** The Sunday that ends the week (Monday to Sunday) a date is in. */
export function endOfWeek(date: string): string {
  const dow = (new Date(`${date}T00:00:00`).getDay() + 6) % 7 // Monday = 0
  return addDays(date, 6 - dow)
}

/** Which group of the agenda a task is in, as seen on `today`. */
export function groupOf(t: Pick<TaskEntry, 'due' | 'status'>, today: string): GroupId {
  if (t.status === 'done') return 'done'
  if (!t.due) return 'nodate'
  if (t.due < today) return 'overdue'
  if (t.due === today) return 'today'
  const tomorrow = addDays(today, 1)
  if (t.due === tomorrow) return 'tomorrow'
  return t.due <= endOfWeek(today) ? 'week' : 'later'
}

export interface TaskFilters {
  /** Which statuses are shown (an empty list shows all). */
  statuses: TaskStatus[]
  priorities: number[]
  /** Only tasks on this topic (and below it when `withSub`). */
  topicId: string | null
  withSub: boolean
  /** Only tasks due on or after / on or before these dates ("" = no limit). A date range leaves out tasks with no date. */
  from: string
  to: string
  /** Words that must be in the title, the details or the topic's path. */
  text: string
}
export const defaultFilters = (): TaskFilters => ({ statuses: ['todo', 'doing'], priorities: [], topicId: null, withSub: true, from: '', to: '', text: '' })
/** True when anything but the starting view (open tasks) is chosen. */
export function filtersActive(f: TaskFilters): boolean {
  const d = defaultFilters()
  return f.statuses.join() !== d.statuses.join() || f.priorities.length > 0 || f.topicId !== null || f.from !== '' || f.to !== '' || f.text.trim() !== ''
}

export function filterTasks(entries: TaskEntry[], topics: TopicMap, f: TaskFilters): TaskEntry[] {
  let branch: Set<string> | null = null
  if (f.topicId) {
    branch = new Set([f.topicId])
    if (f.withSub) for (const id of descendantIds(buildIndex(topics), f.topicId)) branch.add(id)
  }
  const needle = f.text.trim().toLowerCase()
  return entries.filter((e) => {
    if (f.statuses.length && !f.statuses.includes(e.status)) return false
    if (f.priorities.length && !(e.priority && f.priorities.includes(e.priority))) return false
    if (branch && !(e.topicId && branch.has(e.topicId))) return false
    if ((f.from || f.to) && !e.due) return false
    if (f.from && e.due && e.due < f.from) return false
    if (f.to && e.due && e.due > f.to) return false
    if (needle) {
      const hay = `${e.title} ${e.details} ${e.topicId ? topicPath(topics, e.topicId) : ''}`.toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  })
}

const byDue = (a: TaskEntry, b: TaskEntry) =>
  (a.due ?? '9999').localeCompare(b.due ?? '9999') || (a.priority ?? 9) - (b.priority ?? 9) || a.order - b.order || a.title.localeCompare(b.title)

/** The agenda: the tasks in their groups (empty groups left out), each group sorted by date, then priority. */
export function agendaGroups(entries: TaskEntry[], today: string): { id: GroupId; label: string; items: TaskEntry[] }[] {
  const by = new Map<GroupId, TaskEntry[]>()
  for (const e of entries) {
    const g = groupOf(e, today)
    by.set(g, [...(by.get(g) ?? []), e])
  }
  return GROUPS.filter((g) => by.has(g.id)).map((g) => ({ ...g, items: (by.get(g.id) ?? []).sort(byDue) }))
}
