import { newId } from './ids'
import { LOCAL, type MapDoc } from './doc'
import { patchTask, setTask } from './content'
import { ancestorIds, type TopicMap } from './tree'

export type TaskStatus = 'todo' | 'doing' | 'done'
export const TASK_STATUSES: TaskStatus[] = ['todo', 'doing', 'done']
export const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'To do', doing: 'Doing', done: 'Done' }
/** Priority 1 (highest) to 5, the scale the topic Task section has always used. */
export const PRIORITIES = [1, 2, 3, 4, 5] as const
export const MAX_TASK_TITLE = 120
export const MAX_TASK_DETAILS = 2000

/** A task of its own: it can sit on a topic (`topicId`) or on none. (A topic can also itself be a task: see `TaskEntry.legacy`.) */
export interface TaskItem {
  id: string
  topicId: string | null
  title: string
  /** Plain text. */
  details: string
  /** Due date, "YYYY-MM-DD" (local). */
  due?: string
  /** Optional clock time of the due date, "HH:MM" (24 hours, local: it never shifts with the time zone). Only with a date. Missing = all day. */
  time?: string
  status: TaskStatus
  priority?: number
  /** The note this task belongs to (a note id; `topic:<topicId>` is a topic's first note). The link is kept here only, never on the note. */
  noteId?: string
  createdAt: number
  updatedAt: number
  order: number
}

/** One task as the lists show it: a task of its own, or a topic that is a task (the flag `topic.task`, id `topic:<topicId>`). */
export interface TaskEntry {
  id: string
  topicId: string | null
  title: string
  details: string
  due?: string
  time?: string
  status: TaskStatus
  priority?: number
  noteId?: string
  /** The topic is the task: its title is the topic's text, and it is stored in `topic.task` (older versions of the app read it too). */
  legacy: boolean
  createdAt: number | null
  updatedAt: number | null
  order: number
}

export const legacyTaskId = (topicId: string) => `topic:${topicId}`
export const isLegacyTaskId = (id: string) => id.startsWith('topic:')
export const topicOfLegacyTask = (id: string) => id.slice('topic:'.length)

const tx = (doc: MapDoc, fn: () => void) => doc.ydoc.transact(fn, LOCAL)
const cleanTitle = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, MAX_TASK_TITLE)
const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
export const validTime = (t: unknown): t is string => typeof t === 'string' && TIME.test(t)
export const validDate = (d: unknown): d is string => typeof d === 'string' && DATE.test(d) && !Number.isNaN(new Date(`${d}T00:00:00`).getTime())

/** done is the flag older versions read; the status adds "doing". A done flag always means Done. */
export const statusOfFlag = (t: { done: boolean; status?: TaskStatus }): TaskStatus => (t.done ? 'done' : t.status === 'doing' ? 'doing' : 'todo')

/** Every task of the map: the topics that are tasks first (in topic order of the object), then the tasks of their own by `order`. */
export function allTasks(topics: TopicMap, tasks: Record<string, TaskItem>): TaskEntry[] {
  const out: TaskEntry[] = []
  for (const t of Object.values(topics)) {
    if (!t.task) continue
    out.push({
      id: legacyTaskId(t.id),
      topicId: t.id,
      title: t.text.trim() || 'Untitled topic',
      details: '',
      ...(t.task.dueDate ? { due: t.task.dueDate } : {}),
      status: statusOfFlag(t.task),
      ...(t.task.priority ? { priority: t.task.priority } : {}),
      legacy: true,
      createdAt: null,
      updatedAt: null,
      order: t.order,
    })
  }
  for (const k of Object.values(tasks)) {
    out.push({ id: k.id, topicId: k.topicId && topics[k.topicId] ? k.topicId : null, title: k.title, details: k.details, ...(k.due ? { due: k.due } : {}), ...(k.due && validTime(k.time) ? { time: k.time } : {}), status: k.status, ...(k.priority ? { priority: k.priority } : {}), ...(k.noteId ? { noteId: k.noteId } : {}), legacy: false, createdAt: k.createdAt, updatedAt: k.updatedAt, order: k.order })
  }
  return out
}

/** One task by its id (a topic that is a task is found by `topic:<id>`). */
export function taskEntry(topics: TopicMap, tasks: Record<string, TaskItem>, id: string): TaskEntry | null {
  return allTasks(topics, tasks).find((e) => e.id === id) ?? null
}

/** The tasks that belong to one note (normally one; two devices adding at once can make two). Oldest first. */
export function tasksOfNote(tasks: Record<string, TaskItem>, noteId: string): TaskItem[] {
  return Object.values(tasks)
    .filter((k) => k.noteId === noteId)
    .sort((a, b) => a.createdAt - b.createdAt || a.order - b.order || a.id.localeCompare(b.id))
}

/** The tasks that sit on one topic (its own flag first, then the others). */
export function tasksOfTopic(topics: TopicMap, tasks: Record<string, TaskItem>, topicId: string): TaskEntry[] {
  return allTasks(topics, tasks)
    .filter((e) => e.topicId === topicId)
    .sort((a, b) => Number(b.legacy) - Number(a.legacy) || a.order - b.order || (a.createdAt ?? 0) - (b.createdAt ?? 0))
}

/** How many tasks of their own (done or not) each topic has. */
export function taskCounts(topics: TopicMap, tasks: Record<string, TaskItem>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const k of Object.values(tasks)) if (k.topicId && topics[k.topicId]) out[k.topicId] = (out[k.topicId] ?? 0) + 1
  return out
}

/** "Central > Dose > Storage": where a topic is. */
export function topicPath(topics: TopicMap, id: string): string {
  const parts = [...ancestorIds(topics, id)].reverse().concat(id).map((x) => topics[x]?.text.trim() || 'Untitled')
  return parts.join(' › ')
}

/** Adds a task of its own and returns its id. One undo step. */
export function addTask(doc: MapDoc, init: { topicId?: string | null; title?: string; due?: string; time?: string; noteId?: string; priority?: number; status?: TaskStatus; details?: string } = {}, now = Date.now()): string {
  let order = 0
  doc.tasks.forEach((k) => (order = Math.max(order, k.order + 1)))
  const id = newId()
  const item: TaskItem = {
    id,
    topicId: init.topicId && doc.topics.has(init.topicId) ? init.topicId : null,
    title: cleanTitle(init.title ?? ''),
    details: (init.details ?? '').slice(0, MAX_TASK_DETAILS),
    status: init.status ?? 'todo',
    createdAt: now,
    updatedAt: now,
    order,
    ...(validDate(init.due) ? { due: init.due } : {}),
    ...(validDate(init.due) && validTime(init.time) ? { time: init.time } : {}),
    ...(init.noteId ? { noteId: init.noteId } : {}),
    ...(init.priority && PRIORITIES.includes(init.priority as 1) ? { priority: init.priority } : {}),
  }
  tx(doc, () => doc.tasks.set(id, item))
  return id
}

export interface TaskPatch {
  title?: string
  details?: string
  /** null or '' clears the date. */
  due?: string | null
  /** "HH:MM", or null / '' for all day. Needs a date; clearing the date clears it too. A topic that is a task has no time. */
  time?: string | null
  /** The note it belongs to (null: none). */
  noteId?: string | null
  status?: TaskStatus
  /** null clears it. */
  priority?: number | null
  /** The topic a task of its own sits on (null: none). */
  topicId?: string | null
}

/** Changes a task, whichever kind it is. Only what changed is written; a task of its own gets a new edited time then. */
export function patchTaskEntry(doc: MapDoc, id: string, patch: TaskPatch, now = Date.now()) {
  if (isLegacyTaskId(id)) {
    const tid = topicOfLegacyTask(id)
    const cur = doc.topics.get(tid)?.task
    if (!cur) return
    const flag: Record<string, unknown> = {}
    if (patch.status !== undefined) {
      flag.done = patch.status === 'done'
      flag.status = patch.status === 'doing' ? 'doing' : undefined
    }
    if (patch.due !== undefined) flag.dueDate = patch.due && validDate(patch.due) ? patch.due : undefined
    if (patch.priority !== undefined) flag.priority = patch.priority ?? undefined
    if (Object.keys(flag).length) patchTask(doc, tid, flag)
    return
  }
  const k = doc.tasks.get(id)
  if (!k) return
  const next: TaskItem = { ...k }
  if (patch.title !== undefined) next.title = cleanTitle(patch.title)
  if (patch.details !== undefined) next.details = patch.details.slice(0, MAX_TASK_DETAILS)
  if (patch.status !== undefined) next.status = patch.status
  if (patch.due !== undefined) {
    if (patch.due && validDate(patch.due)) next.due = patch.due
    else delete next.due
  }
  if (patch.time !== undefined) {
    if (validTime(patch.time)) next.time = patch.time
    else delete next.time
  }
  if (!next.due) delete next.time
  if (patch.noteId !== undefined) {
    if (patch.noteId) next.noteId = patch.noteId
    else delete next.noteId
  }
  if (patch.priority !== undefined) {
    if (patch.priority && PRIORITIES.includes(patch.priority as 1)) next.priority = patch.priority
    else delete next.priority
  }
  if (patch.topicId !== undefined) next.topicId = patch.topicId && doc.topics.has(patch.topicId) ? patch.topicId : null
  const same = (Object.keys(next) as (keyof TaskItem)[]).every((key) => next[key] === k[key]) && Object.keys(k).length === Object.keys(next).length
  if (same) return
  next.updatedAt = now
  tx(doc, () => doc.tasks.set(id, next))
}

/** Ticks a task off (Done) or opens it again (To do). */
export function toggleTaskEntry(doc: MapDoc, entry: Pick<TaskEntry, 'id' | 'status'>, now = Date.now()) {
  patchTaskEntry(doc, entry.id, { status: entry.status === 'done' ? 'todo' : 'done' }, now)
}

/** Removes a task of its own, or makes a topic stop being a task (the topic stays). One undo step. */
export function deleteTaskEntry(doc: MapDoc, id: string) {
  if (isLegacyTaskId(id)) return setTask(doc, topicOfLegacyTask(id), null)
  if (doc.tasks.has(id)) tx(doc, () => doc.tasks.delete(id))
}

/** A task as one outline line: "[Task] ☐ Title (due 2026-11-20, doing, priority 2)". */
export function taskLine(e: Pick<TaskEntry, 'title' | 'due' | 'status' | 'priority' | 'details'> & { time?: string }): string {
  const box = e.status === 'done' ? '[x]' : e.status === 'doing' ? '[~]' : '[ ]'
  const bits = [e.due ? `due ${e.due}${e.time ? ` ${e.time}` : ''}` : '', e.status === 'doing' ? 'doing' : '', e.priority ? `priority ${e.priority}` : ''].filter(Boolean)
  const details = e.details.replace(/\s+/g, ' ').trim()
  return `[Task] ${box} ${e.title || 'Task'}${bits.length ? ` (${bits.join(', ')})` : ''}${details ? `: ${details}` : ''}`
}
