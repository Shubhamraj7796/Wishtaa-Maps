import { useEffect, useRef, useState } from 'react'
import { addTask, deleteTaskEntry, patchTaskEntry, STATUS_LABEL, TASK_STATUSES, type TaskItem, type TaskStatus, validTime } from '@/core/model/tasks'
import { formatDueAt, hhmm, isOverdue, ymd } from '@/core/tasks/agenda'
import { Icon } from '@/ui/icons'
import { IconButton, IconTile } from '@/ui/IconButton'
import { mapDoc } from '../mapdoc'
import { showNotice } from '../notice'
import { PriorityTiles } from './PriorityTiles'
import { STATUS_ICON } from './TaskPopup'

const field = 'rounded-ui border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-brand disabled:opacity-50'

/** The text of the chip: "Task · 14 Nov, 5:00 pm · To do". */
export function taskChipText(t: Pick<TaskItem, 'due' | 'time' | 'status'>): string {
  return ['Task', t.due ? formatDueAt(t.due, t.time) : '', STATUS_LABEL[t.status]].filter(Boolean).join(' · ')
}

/**
 * The small chip a note with a task shows under its toolbar: "Task · 14 Nov, 5:00 pm · To do". A click opens the panel to edit it. It
 * reads the task itself, so ticking the task off in the Task view changes the chip at once. A second task on the same note (two devices
 * adding at once) shows as "+1".
 */
export function NoteTaskChip({ task, extra, readOnly = false, onOpen }: { task: TaskItem; extra: number; readOnly?: boolean; onOpen: (e: HTMLElement) => void }) {
  const now = new Date()
  const late = isOverdue({ due: task.due, status: task.status, time: task.time }, ymd(now), hhmm(now))
  const text = taskChipText(task)
  return (
    <button
      type="button"
      data-note-task-chip={task.id}
      aria-label={`${text}${extra ? `, and ${extra} more` : ''}. ${readOnly ? 'Show' : 'Edit'} the task details`}
      onClick={(e) => onOpen(e.currentTarget)}
      className={`mx-3 mt-2 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-xs hover:bg-bg focus-visible:bg-bg [@media(pointer:coarse)]:min-h-11 ${late ? 'border-bad/60 text-bad' : 'border-line text-ink'}`}
    >
      <Icon name={STATUS_ICON[task.status]} size={14} className="shrink-0" />
      <span className={`min-w-0 truncate ${task.status === 'done' ? 'line-through' : ''}`}>{text}</span>
      {extra > 0 && <span className="shrink-0 text-muted">+{extra}</span>}
    </button>
  )
}

/**
 * The compact panel over the note for the task details of THIS note: title (starts as the note title), due date, due time (optional),
 * status and priority. With no task yet it only collects the details; "Add the task" creates it (nothing is created, so nothing is left
 * behind, when the panel is closed without it). With a task, every change is saved at once (the title 500 ms after typing stops).
 * The task is linked to this note (`noteId`) and sits on the note's topic.
 */
export function NoteTaskPanel({
  task,
  noteId,
  topicId,
  defaultTitle,
  readOnly,
  onClose,
  onCreated,
}: {
  task: TaskItem | null
  noteId: string
  topicId: string
  defaultTitle: string
  readOnly: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<{ title: string; due: string; time: string; status: TaskStatus; priority: number | null }>({ title: defaultTitle, due: '', time: '', status: 'todo', priority: null })
  const [title, setTitle] = useState(task?.title ?? '')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const titleRef = useRef(title)
  titleRef.current = title
  const close = useRef(onClose)
  close.current = onClose

  const writeTitle = () => {
    clearTimeout(timer.current)
    timer.current = undefined
    if (task && !readOnly) patchTaskEntry(mapDoc, task.id, { title: titleRef.current })
  }
  // Changed from outside (another device, the Task view) while nothing is being typed.
  useEffect(() => {
    if (task && !timer.current) setTitle(task.title)
  }, [task?.title]) // eslint-disable-line react-hooks/exhaustive-deps

  // Escape closes the panel first (the note stays open); a press outside it closes it too. It saves what was typed.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      writeTitle()
      close.current()
    }
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (box.current?.contains(t) || t.closest('[data-note-task-button], [data-note-task-chip], [data-popover]')) return
      writeTitle()
      close.current()
    }
    window.addEventListener('keydown', key, true)
    window.addEventListener('pointerdown', down, true)
    return () => {
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('pointerdown', down, true)
      writeTitle()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  }, [])

  const cur = task ? { due: task.due ?? '', time: task.time ?? '', status: task.status, priority: task.priority ?? null } : draft
  const set = (p: { due?: string; time?: string; status?: TaskStatus; priority?: number | null }) => {
    if (readOnly) return
    if (task) {
      patchTaskEntry(mapDoc, task.id, { ...(p.due !== undefined ? { due: p.due || null } : {}), ...(p.time !== undefined ? { time: p.time || null } : {}), ...(p.status ? { status: p.status } : {}), ...(p.priority !== undefined ? { priority: p.priority } : {}) })
    } else setDraft((d) => ({ ...d, ...p, priority: p.priority !== undefined ? p.priority : d.priority }))
  }
  const create = () => {
    addTask(mapDoc, { topicId, noteId, title: draft.title.trim() || defaultTitle, due: draft.due || undefined, time: validTime(draft.time) ? draft.time : undefined, status: draft.status, ...(draft.priority ? { priority: draft.priority } : {}) })
    onCreated()
  }
  const remove = () => {
    if (!task) return
    writeTitle()
    deleteTaskEntry(mapDoc, task.id)
    onClose()
    showNotice('Task removed from this note.', 8000, { label: 'Undo', run: () => mapDoc.undo.undo() })
  }

  return (
    <div
      ref={box}
      data-popover
      data-note-task-panel
      role="group"
      aria-label="Task details"
      className="absolute bottom-16 left-3 z-20 w-[min(360px,calc(100%-1.5rem))] space-y-3 rounded-ui border border-line bg-surface p-3 text-ink shadow-xl"
    >
      <div className="flex items-center gap-1">
        <input
          data-autofocus=""
          aria-label="Task title"
          value={task ? title : draft.title}
          readOnly={readOnly}
          maxLength={120}
          placeholder="What needs doing?"
          onChange={(e) => {
            if (task) {
              setTitle(e.target.value)
              clearTimeout(timer.current)
              timer.current = setTimeout(writeTitle, 500)
            } else setDraft((d) => ({ ...d, title: e.target.value }))
          }}
          className={`${field} min-w-0 flex-1 font-medium`}
        />
        {task && !readOnly && <IconButton icon="trash" label="Remove this task" onClick={remove} className="text-bad [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11" />}
        <IconButton icon="close" label="Close the task details" onClick={() => (writeTitle(), onClose())} className="[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" aria-label="Due date" value={cur.due} disabled={readOnly} onChange={(e) => set({ due: e.target.value, ...(e.target.value ? {} : { time: '' }) })} className={field} />
        <input type="time" aria-label="Due time" value={cur.time} disabled={readOnly || !cur.due} onChange={(e) => set({ time: e.target.value })} className={field} />
        {cur.time && !readOnly && <IconButton icon="close" label="Clear the due time (all day)" onClick={() => set({ time: '' })} />}
      </div>
      <div role="radiogroup" aria-label="Status" className="flex items-center gap-1">
        {TASK_STATUSES.map((s) => (
          <IconTile key={s} role="radio" icon={STATUS_ICON[s]} label={STATUS_LABEL[s]} selected={cur.status === s} disabled={readOnly} onClick={() => set({ status: s })} data-status={s} />
        ))}
        <span className="ml-2 text-sm text-muted">{STATUS_LABEL[cur.status]}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <PriorityTiles value={cur.priority} disabled={readOnly} onChange={(p) => set({ priority: p })} />
        <span className="ml-2 text-sm text-muted">{cur.priority ? `Priority ${cur.priority}` : 'No priority'}</span>
      </div>
      {!task && !readOnly && (
        <div className="flex justify-end">
          <button type="button" data-note-task-add onClick={create} className="inline-flex items-center gap-1.5 rounded-ui bg-brand px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 [@media(pointer:coarse)]:min-h-11">
            <Icon name="check" size={16} /> Add the task
          </button>
        </div>
      )}
    </div>
  )
}
