import { useMemo } from 'react'
import { addTask, tasksOfTopic, toggleTaskEntry, type TaskEntry } from '@/core/model/tasks'
import { IconButton, IconTile } from '@/ui/IconButton'
import { Popover } from '@/ui/Popover'
import { formatDue } from '@/core/tasks/agenda'
import { mapDoc } from '../mapdoc'
import { showNotice } from '../notice'
import { useEditor } from '../store'
import { STATUS_ICON } from './TaskPopup'
import { closeList, openTask, useItems } from './state'

/** The tasks that sit on one topic (the topic's own flag first when `legacy` is true). */
export function useTopicTasks(topicId: string, legacy = true): TaskEntry[] {
  const topics = useEditor((s) => s.topics)
  const tasks = useEditor((s) => s.tasks)
  return useMemo(() => tasksOfTopic(topics, tasks, topicId).filter((e) => legacy || !e.legacy), [topics, tasks, topicId, legacy])
}

/** Adds a task to a topic and opens it. */
export function addTaskAndOpen(topicId: string | null) {
  openTask(addTask(mapDoc, { topicId }))
}

/** A tick box for a task: To do or Doing becomes Done, Done becomes To do. Read mode never changes a task. */
export function TaskTick({ entry, readOnly }: { entry: TaskEntry; readOnly: boolean }) {
  return (
    <IconTile
      icon={STATUS_ICON[entry.status]}
      label={entry.status === 'done' ? 'Done. Press to open the task again' : 'Mark done'}
      selected={entry.status === 'done'}
      role="checkbox"
      aria-checked={entry.status === 'done'}
      data-task-tick={entry.id}
      onClick={(e) => {
        e.stopPropagation()
        if (readOnly) return showNotice('Reading mode: switch to Edit to change a task.')
        toggleTaskEntry(mapDoc, entry)
      }}
    />
  )
}

/** The tasks of one topic as rows (tick, title, due date); a click opens the task in its popup; the plus icon adds one. */
export function TaskRows({ topicId, menu = false, legacy = true }: { topicId: string; menu?: boolean; legacy?: boolean }) {
  const entries = useTopicTasks(topicId, legacy)
  const readOnly = useEditor((s) => s.readOnly)
  const role = menu ? 'menuitem' : undefined
  return (
    <div className="w-[min(340px,88vw)]">
      <ul aria-label="Tasks of this topic" className="max-h-[50vh] overflow-y-auto">
        {entries.map((e) => (
          <li key={e.id} className="flex items-center gap-1">
            <TaskTick entry={e} readOnly={readOnly} />
            <button type="button" role={role} data-task-row={e.id} onClick={() => openTask(e.id)} className="flex min-w-0 flex-1 items-center gap-2 rounded-ui px-2 py-2 text-left hover:bg-bg focus-visible:bg-bg [@media(pointer:coarse)]:min-h-11">
              <span className={`min-w-0 flex-1 truncate text-sm ${e.status === 'done' ? 'text-muted line-through' : ''}`}>{e.title || 'Untitled task'}</span>
              {e.due && <span className="shrink-0 text-xs text-muted">{formatDue(e.due)}</span>}
            </button>
          </li>
        ))}
      </ul>
      {entries.length === 0 && <p className="px-3 py-3 text-sm text-muted">No tasks yet.</p>}
      {!readOnly && (
        <div className="mt-1 flex items-center justify-end border-t border-line pt-1">
          <IconButton icon="plus" label="Add a task" role={menu ? 'menuitem' : undefined} onClick={() => addTaskAndOpen(topicId)} />
        </div>
      )}
    </div>
  )
}

/** The popover that opens from a topic's tasks icon. */
export function TaskListPopover() {
  const list = useItems((s) => (s.list?.kind === 'tasks' ? s.list : null))
  if (!list) return null
  return (
    <Popover anchor={list.anchor} label="Tasks of this topic" onClose={closeList}>
      <TaskRows topicId={list.topicId} menu />
    </Popover>
  )
}
