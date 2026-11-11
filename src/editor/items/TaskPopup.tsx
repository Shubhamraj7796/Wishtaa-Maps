import { useEffect, useMemo, useRef, useState } from 'react'
import { timeAgo } from '@/app/format'
import { deleteTaskEntry, patchTaskEntry, STATUS_LABEL, TASK_STATUSES, taskEntry, type TaskStatus } from '@/core/model/tasks'
import type { IconName } from '@/ui/icons'
import { IconButton, IconTile } from '@/ui/IconButton'
import { ItemPopup } from '@/ui/ItemPopup'
import { mapDoc } from '../mapdoc'
import { showNotice } from '../notice'
import { useEditor } from '../store'
import { PriorityTiles } from './PriorityTiles'
import { closePopup } from './state'
import { TopicPickerButton } from './TopicPicker'

export const STATUS_ICON: Record<TaskStatus, IconName> = { todo: 'square', doing: 'clock', done: 'taskDone' }
const field = 'rounded-ui border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-brand'

/**
 * A task in its popup: a title, its status (To do, Doing, Done: three icons), a due date, a priority (1 is the highest), the topic it
 * sits on, and some details. It autosaves; closing saves what was typed first. A new task left with no title is removed again. A topic
 * that is itself a task (the older kind) shows its text as the title (change the text on the topic) and keeps its details on the topic.
 */
export function TaskPopup({ id }: { id: string }) {
  const topics = useEditor((s) => s.topics)
  const tasks = useEditor((s) => s.tasks)
  const readOnly = useEditor((s) => s.readOnly)
  const entry = useMemo(() => taskEntry(topics, tasks, id), [topics, tasks, id])
  const gone = !entry
  const [title, setTitle] = useState(entry?.title ?? '')
  const [details, setDetails] = useState(entry?.details ?? '')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const draft = useRef({ title, details })
  draft.current = { title, details }

  useEffect(() => {
    if (gone) {
      showNotice('That task is no longer there.')
      closePopup()
    }
  }, [gone])
  // Changed from outside (another device, undo) while nothing is being typed.
  useEffect(() => {
    if (entry && !timer.current) {
      setTitle(entry.title)
      setDetails(entry.details)
    }
  }, [entry?.title, entry?.details]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!entry) return null
  const write = () => {
    clearTimeout(timer.current)
    timer.current = undefined
    if (readOnly || entry.legacy) return
    patchTaskEntry(mapDoc, entry.id, { title: draft.current.title, details: draft.current.details })
  }
  const later = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(write, 500)
  }
  const patch = (p: Parameters<typeof patchTaskEntry>[2]) => {
    if (!readOnly) patchTaskEntry(mapDoc, entry.id, p)
  }
  const close = () => {
    write()
    const now = taskEntry(useEditor.getState().topics, useEditor.getState().tasks, entry.id)
    // A new task that never got a title (and no date or details) is not kept.
    if (now && !readOnly && !now.legacy && !now.title.trim() && !now.details.trim() && !now.due) deleteTaskEntry(mapDoc, now.id)
    closePopup()
  }
  const remove = () => {
    write()
    deleteTaskEntry(mapDoc, entry.id)
    closePopup()
    showNotice(entry.legacy ? 'The topic is no longer a task.' : 'Task deleted.', 8000, { label: 'Undo', run: () => mapDoc.undo.undo() })
  }

  return (
    <ItemPopup
      label={`Task: ${entry.title || 'untitled'}`}
      onClose={close}
      header={
        entry.legacy ? (
          <div className="min-w-0 truncate px-1 text-sm font-medium" data-task-title>
            {entry.title}
          </div>
        ) : (
          <input
            data-autofocus={entry.title ? undefined : ''}
            aria-label="Task title"
            value={title}
            readOnly={readOnly}
            maxLength={120}
            placeholder="What needs doing?"
            onChange={(e) => {
              setTitle(e.target.value)
              later()
            }}
            className="w-full rounded-ui bg-transparent px-1 py-1 text-sm font-medium outline-none placeholder:font-normal placeholder:text-muted focus:bg-bg"
          />
        )
      }
      actions={!readOnly ? <IconButton icon="trash" label={entry.legacy ? 'Stop being a task' : 'Delete this task'} onClick={remove} className="text-bad [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11" /> : undefined}
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div role="radiogroup" aria-label="Status" className="flex items-center gap-1">
          {TASK_STATUSES.map((s) => (
            <IconTile key={s} role="radio" icon={STATUS_ICON[s]} label={STATUS_LABEL[s]} selected={entry.status === s} disabled={readOnly} onClick={() => patch({ status: s })} data-status={s} />
          ))}
          <span className="ml-2 text-sm text-muted">{STATUS_LABEL[entry.status]}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input type="date" aria-label="Due date" value={entry.due ?? ''} disabled={readOnly} onChange={(e) => patch({ due: e.target.value || null })} className={field} />
          {entry.due && !readOnly && <IconButton icon="close" label="Clear the due date" onClick={() => patch({ due: null })} />}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <PriorityTiles value={entry.priority ?? null} disabled={readOnly} onChange={(p) => patch({ priority: p })} />
          <span className="ml-2 text-sm text-muted">{entry.priority ? `Priority ${entry.priority}` : 'No priority'}</span>
        </div>

        <div>
          <span className="mb-1 block text-xs text-muted">Topic</span>
          {entry.legacy ? (
            <p className="text-sm text-muted">This task is the topic itself.</p>
          ) : (
            <TopicPickerButton value={entry.topicId} disabled={readOnly} onChange={(topicId) => patch({ topicId })} />
          )}
        </div>

        {!entry.legacy && (
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Details</span>
            <textarea
              aria-label="Task details"
              value={details}
              readOnly={readOnly}
              maxLength={2000}
              rows={5}
              onChange={(e) => {
                setDetails(e.target.value)
                later()
              }}
              className={`${field} w-full resize-y`}
            />
          </label>
        )}
      </div>
      <div className="shrink-0 border-t border-line px-3 py-1.5 text-xs text-muted">
        {entry.createdAt !== null && entry.updatedAt !== null ? `Created ${timeAgo(entry.createdAt)} · Edited ${timeAgo(entry.updatedAt)}` : 'A topic that is a task'}
      </div>
    </ItemPopup>
  )
}
