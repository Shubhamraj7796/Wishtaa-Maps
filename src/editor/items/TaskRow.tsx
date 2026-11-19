import { topicPath, type TaskEntry } from '@/core/model/tasks'
import type { TopicMap } from '@/core/model/tree'
import { formatDue, formatTime, isOverdue } from '@/core/tasks/agenda'
import { Icon } from '@/ui/icons'
import { TaskTick } from './TaskList'

/** One task as a row: tick, title, the path of its topic, priority and when it is due. A click opens the task in its popup. */
export function TaskRow({ e, now, topics, readOnly, onOpen }: { e: TaskEntry; now: { today: string; time: string }; topics: TopicMap; readOnly: boolean; onOpen: (e: TaskEntry) => void }) {
  const overdue = isOverdue(e, now.today, now.time)
  return (
    <li data-task-item={e.id} className="flex items-center gap-1 border-b border-line/60 last:border-0">
      <TaskTick entry={e} readOnly={readOnly} />
      <button type="button" data-task-row={e.id} onClick={() => onOpen(e)} className="flex min-w-0 flex-1 items-center gap-3 rounded-ui px-2 py-2 text-left hover:bg-bg focus-visible:bg-bg [@media(pointer:coarse)]:min-h-11">
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm ${e.status === 'done' ? 'text-muted line-through' : 'font-medium'}`}>{e.title || 'Untitled task'}</span>
          {e.topicId && (
            <span data-task-path className="block truncate text-xs text-muted">
              {topicPath(topics, e.topicId)}
            </span>
          )}
        </span>
        {e.status === 'doing' && <Icon name="clock" size={14} className="shrink-0 text-muted" />}
        {e.priority && <span className="shrink-0 rounded bg-bg px-1.5 py-0.5 text-[11px] font-semibold text-muted">P{e.priority}</span>}
        {e.due && (
          <span data-task-when className={`shrink-0 text-right text-xs ${overdue ? 'font-semibold text-bad' : 'text-muted'}`}>
            {formatDue(e.due)}
            <span data-task-time className="block text-[11px] font-normal">
              {e.time ? formatTime(e.time) : 'All day'}
            </span>
          </span>
        )}
      </button>
    </li>
  )
}
