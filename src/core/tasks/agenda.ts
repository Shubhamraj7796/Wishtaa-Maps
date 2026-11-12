import { buildIndex, descendantIds, type TopicMap } from '../model/tree'
import { STATUS_LABEL, TASK_STATUSES, topicPath, type TaskEntry, type TaskStatus } from '../model/tasks'

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
/** The clock time "HH:MM" of a date, local. */
export const hhmm = (d: Date): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`
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
/** "5:00 pm" (in the device's own 12 or 24 hour style) for "17:00". */
export function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return t
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
/** "Nov 14, 5:00 pm", or "Nov 14" when there is no time. */
export function formatDueAt(due: string, time?: string): string {
  return time ? `${formatDue(due)}, ${formatTime(time)}` : formatDue(due)
}
/** The Sunday that ends the week (Monday to Sunday) a date is in. */
export function endOfWeek(date: string): string {
  const dow = (new Date(`${date}T00:00:00`).getDay() + 6) % 7 // Monday = 0
  return addDays(date, 6 - dow)
}

/**
 * Which group of the agenda a task is in, as seen on `today` at `nowTime` ("HH:MM"). A task with no time is overdue from the next day; one
 * with a time is overdue once that minute has passed, so a 5 pm task is not overdue at 4 pm or at exactly 5:00 pm, but is at 5:01 pm.
 */
export function groupOf(t: Pick<TaskEntry, 'due' | 'status'> & { time?: string }, today: string, nowTime = ''): GroupId {
  if (t.status === 'done') return 'done'
  if (!t.due) return 'nodate'
  if (t.due < today) return 'overdue'
  if (t.due === today) return t.time && nowTime && t.time < nowTime ? 'overdue' : 'today'
  const tomorrow = addDays(today, 1)
  if (t.due === tomorrow) return 'tomorrow'
  return t.due <= endOfWeek(today) ? 'week' : 'later'
}

/** True when a task is overdue at this moment (not done, and its date or its time has passed). */
export const isOverdue = (t: Pick<TaskEntry, 'due' | 'status'> & { time?: string }, today: string, nowTime = ''): boolean => groupOf(t, today, nowTime) === 'overdue'

export type Timing = 'any' | 'timed' | 'allday'

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
  /** Only tasks with a time of day, or only all-day ones. */
  timing: Timing
}
export const defaultFilters = (): TaskFilters => ({ statuses: ['todo', 'doing'], priorities: [], topicId: null, withSub: true, from: '', to: '', text: '', timing: 'any' })
/** True when anything but the starting view (open tasks) is chosen. */
export function filtersActive(f: TaskFilters): boolean {
  const d = defaultFilters()
  return f.statuses.join() !== d.statuses.join() || f.priorities.length > 0 || f.topicId !== null || f.from !== '' || f.to !== '' || f.text.trim() !== '' || f.timing !== 'any'
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
    if (f.timing === 'timed' && !e.time) return false
    if (f.timing === 'allday' && e.time) return false
    if (needle) {
      const hay = `${e.title} ${e.details} ${e.topicId ? topicPath(topics, e.topicId) : ''}`.toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  })
}

// ---- Arrange: how the Task view groups and sorts ---------------------------------------------------------------------------------

export type GroupBy = 'date' | 'priority' | 'status' | 'topic' | 'none'
export type SortBy = 'datetime' | 'date' | 'name' | 'priority' | 'status' | 'created'
export interface Arrange {
  groupBy: GroupBy
  sortBy: SortBy
  /** Descending (the last first). A missing value (no date, no priority, ...) is always last. */
  desc: boolean
}
export const defaultArrange = (): Arrange => ({ groupBy: 'date', sortBy: 'datetime', desc: false })
export const GROUP_BY: { id: GroupBy; label: string }[] = [
  { id: 'date', label: 'Date' },
  { id: 'priority', label: 'Priority' },
  { id: 'status', label: 'Status' },
  { id: 'topic', label: 'Topic / branch' },
  { id: 'none', label: 'None (one list)' },
]
export const SORT_BY: { id: SortBy; label: string }[] = [
  { id: 'datetime', label: 'Date and time' },
  { id: 'date', label: 'Date only' },
  { id: 'name', label: 'Name (A to Z)' },
  { id: 'priority', label: 'Priority' },
  { id: 'status', label: 'Status' },
  { id: 'created', label: 'Created' },
]
/** Reads a saved arrangement, ignoring anything that is not one (a hand-edited or older value). */
export function parseArrange(raw: unknown): Arrange {
  const d = defaultArrange()
  if (!raw || typeof raw !== 'object') return d
  const r = raw as Record<string, unknown>
  return {
    groupBy: GROUP_BY.some((g) => g.id === r.groupBy) ? (r.groupBy as GroupBy) : d.groupBy,
    sortBy: SORT_BY.some((g) => g.id === r.sortBy) ? (r.sortBy as SortBy) : d.sortBy,
    desc: r.desc === true,
  }
}
/** True when the arrangement is not the starting one. */
export const arrangeChanged = (a: Arrange): boolean => {
  const d = defaultArrange()
  return a.groupBy !== d.groupBy || a.sortBy !== d.sortBy || a.desc !== d.desc
}

export interface TaskGroup {
  id: string
  label: string
  items: TaskEntry[]
  /** Shown in red (Overdue). */
  alert?: boolean
}

type Key = number | string | null
const STATUS_RANK: Record<TaskStatus, number> = { todo: 0, doing: 1, done: 2 }
/** The value a task is sorted on; null (nothing to sort on) always goes last, whichever way the list runs. */
function sortKey(e: TaskEntry, by: SortBy): Key {
  switch (by) {
    case 'datetime':
      return e.due ? `${e.due} ${e.time ?? '00:00'}` : null
    case 'date':
      return e.due ?? null
    case 'name':
      return e.title.trim().toLowerCase() || null
    case 'priority':
      return e.priority ?? null
    case 'status':
      return STATUS_RANK[e.status]
    case 'created':
      return e.createdAt
  }
}
const cmpKey = (a: Key, b: Key): number => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b)))
const byName = (a: TaskEntry, b: TaskEntry) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })

/** A comparer for one sort choice. Ties: for the date sorts the priority first, then always the name, then the order they were made in. */
export function taskComparer(a: Arrange): (x: TaskEntry, y: TaskEntry) => number {
  return (x, y) => {
    const kx = sortKey(x, a.sortBy)
    const ky = sortKey(y, a.sortBy)
    if (kx === null && ky !== null) return 1
    if (ky === null && kx !== null) return -1
    if (kx !== null && ky !== null) {
      const c = cmpKey(kx, ky)
      if (c) return a.desc ? -c : c
    }
    if (a.sortBy === 'datetime' || a.sortBy === 'date') {
      const p = (x.priority ?? 9) - (y.priority ?? 9)
      if (p) return p
    }
    return byName(x, y) || x.order - y.order || x.id.localeCompare(y.id)
  }
}

/**
 * The Task view's list: the tasks in their groups (empty groups left out) and each group sorted. The groups come in a fixed order (the
 * direction only turns the tasks inside a group round); a group of tasks with nothing to group on ("No date", "No priority", "No topic")
 * is the last one (for the date grouping "Done" comes after it, as it always has).
 */
export function arrangeTasks(entries: TaskEntry[], topics: TopicMap, arrange: Arrange, today: string, nowTime = ''): TaskGroup[] {
  const cmp = taskComparer(arrange)
  const buckets = new Map<string, TaskEntry[]>()
  const put = (id: string, e: TaskEntry) => buckets.set(id, [...(buckets.get(id) ?? []), e])
  const defs: { id: string; label: string; alert?: boolean }[] = []
  switch (arrange.groupBy) {
    case 'none':
      for (const e of entries) put('all', e)
      defs.push({ id: 'all', label: 'All tasks' })
      break
    case 'date':
      for (const e of entries) put(groupOf(e, today, nowTime), e)
      defs.push(...GROUPS.map((g) => ({ ...g, alert: g.id === 'overdue' })))
      break
    case 'priority':
      for (const e of entries) put(e.priority ? `p${e.priority}` : 'p0', e)
      defs.push(...[1, 2, 3, 4, 5].map((p) => ({ id: `p${p}`, label: `Priority ${p}` })), { id: 'p0', label: 'No priority' })
      break
    case 'status':
      for (const e of entries) put(e.status, e)
      defs.push(...TASK_STATUSES.map((s) => ({ id: s, label: STATUS_LABEL[s] })))
      break
    case 'topic': {
      const paths = new Map<string, string>()
      for (const e of entries) {
        put(e.topicId ? `t:${e.topicId}` : 'none', e)
        if (e.topicId) paths.set(`t:${e.topicId}`, topicPath(topics, e.topicId))
      }
      defs.push(
        ...[...paths].sort((a, b) => a[1].localeCompare(b[1], undefined, { sensitivity: 'base' }) || a[0].localeCompare(b[0])).map(([id, label]) => ({ id, label })),
        { id: 'none', label: 'No topic' }
      )
      break
    }
  }
  return defs.filter((d) => buckets.has(d.id)).map((d) => ({ ...d, items: (buckets.get(d.id) ?? []).sort(cmp) }))
}

/** The agenda as it has always been: by date, soonest first. */
export function agendaGroups(entries: TaskEntry[], today: string, nowTime = ''): TaskGroup[] {
  return arrangeTasks(entries, {}, defaultArrange(), today, nowTime)
}
