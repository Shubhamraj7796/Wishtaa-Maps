import { STATUS_LABEL, TASK_STATUSES, type TaskEntry, type TaskStatus } from '../model/tasks'

export interface BoardColumn {
  status: TaskStatus
  label: string
  items: TaskEntry[]
}

/** Inside a column: priority 1 first (no priority last), then the soonest due date and time (no date last), then the name, then the order made. */
export function boardCompare(a: TaskEntry, b: TaskEntry): number {
  const pa = a.priority ?? 9
  const pb = b.priority ?? 9
  if (pa !== pb) return pa - pb
  const da = a.due ? `${a.due} ${a.time ?? '00:00'}` : null
  const db = b.due ? `${b.due} ${b.time ?? '00:00'}` : null
  if (da !== db) {
    if (da === null) return 1
    if (db === null) return -1
    return da < db ? -1 : 1
  }
  return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || a.order - b.order || a.id.localeCompare(b.id)
}

/** The Board: always the three columns To do, Doing and Done (an empty one stays, so a task can be dropped into it), each sorted. */
export function boardColumns(entries: TaskEntry[]): BoardColumn[] {
  return TASK_STATUSES.map((status) => ({ status, label: STATUS_LABEL[status], items: entries.filter((e) => e.status === status).sort(boardCompare) }))
}
