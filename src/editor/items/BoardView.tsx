import { useMemo, useState } from 'react'
import { patchTaskEntry, STATUS_LABEL, TASK_STATUSES, topicPath, type TaskEntry, type TaskStatus } from '@/core/model/tasks'
import type { TopicMap } from '@/core/model/tree'
import { formatDue, formatTime, isOverdue } from '@/core/tasks/agenda'
import { boardColumns } from '@/core/tasks/board'
import { IconButton } from '@/ui/IconButton'
import { Icon, type IconName } from '@/ui/icons'
import { mapDoc } from '../mapdoc'
import { showNotice } from '../notice'
import { addTaskAndOpen } from './TaskList'
import { STATUS_ICON } from './TaskPopup'
import { openTaskEntry } from './openItem'

interface Now {
  today: string
  time: string
}

/** The card's move icons: a play icon for Doing ("start it"), the done icon for Done, the empty box for To do (the clock stays the sign of Doing elsewhere). */
const MOVE_ICON: Record<TaskStatus, IconName> = { todo: STATUS_ICON.todo, doing: 'start', done: STATUS_ICON.done }

function move(entry: TaskEntry, status: TaskStatus, readOnly: boolean) {
  if (readOnly) return showNotice('Reading mode: switch to Edit to change a task.')
  if (entry.status !== status) patchTaskEntry(mapDoc, entry.id, { status })
}

function Card({ e, now, topics, readOnly }: { e: TaskEntry; now: Now; topics: TopicMap; readOnly: boolean }) {
  const overdue = isOverdue(e, now.today, now.time)
  return (
    <li
      data-board-card={e.id}
      draggable={!readOnly}
      onDragStart={(ev) => {
        ev.dataTransfer.setData('text/plain', e.id)
        ev.dataTransfer.effectAllowed = 'move'
      }}
      className={`rounded-ui border border-line bg-bg p-2 ${readOnly ? '' : 'cursor-grab active:cursor-grabbing'}`}
    >
      <button type="button" data-task-row={e.id} onClick={() => openTaskEntry(e)} className="block w-full min-w-0 rounded-ui text-left focus-visible:bg-surface">
        <span className={`block text-sm ${e.status === 'done' ? 'text-muted line-through' : 'font-medium'}`}>{e.title || 'Untitled task'}</span>
        {e.topicId && <span data-task-path className="mt-0.5 block truncate text-xs text-muted">{topicPath(topics, e.topicId)}</span>}
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          {e.priority && <span className="rounded bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-muted">P{e.priority}</span>}
          {e.due && (
            <span data-task-when className={`text-xs ${overdue ? 'font-semibold text-bad' : 'text-muted'}`}>
              {formatDue(e.due)}
              {e.time ? `, ${formatTime(e.time)}` : ''}
            </span>
          )}
        </span>
      </button>
      <div className="mt-1 flex items-center justify-end gap-0.5">
        {TASK_STATUSES.filter((s) => s !== e.status).map((s) => (
          <IconButton key={s} icon={MOVE_ICON[s]} label={`Move to ${STATUS_LABEL[s]}`} disabled={false} data-move-to={s} onClick={() => move(e, s, readOnly)} className="[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11" />
        ))}
      </div>
    </li>
  )
}

/**
 * The Board: the tasks of the map in three columns, To do, Doing and Done. Drag a card to another column (computer), or use the two small
 * icons on a card (every device, keyboard and screen readers too); the plus icon in a column adds a task there. The filters apply (except the
 * status filter: the columns are the statuses). Read mode only looks.
 */
export function BoardView({ entries, topics, now, readOnly, topicId }: { entries: TaskEntry[]; topics: TopicMap; now: Now; readOnly: boolean; topicId: string | null }) {
  const columns = useMemo(() => boardColumns(entries), [entries])
  const [over, setOver] = useState<TaskStatus | null>(null)
  return (
    <div data-board-view className="flex h-full min-h-0 snap-x snap-mandatory gap-3 overflow-x-auto p-3 md:snap-none">
      {columns.map((c) => (
        <section
          key={c.status}
          data-board-column={c.status}
          aria-label={`${c.label}, ${c.items.length}`}
          onDragOver={(ev) => {
            if (readOnly) return
            ev.preventDefault()
            ev.dataTransfer.dropEffect = 'move'
            if (over !== c.status) setOver(c.status)
          }}
          onDragLeave={(ev) => {
            if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setOver(null)
          }}
          onDrop={(ev) => {
            ev.preventDefault()
            setOver(null)
            const id = ev.dataTransfer.getData('text/plain')
            const card = entries.find((x) => x.id === id)
            if (card) move(card, c.status, readOnly)
          }}
          className={`flex min-h-0 min-w-[16rem] flex-1 shrink-0 snap-start flex-col rounded-ui border bg-surface md:min-w-0 ${over === c.status ? 'border-brand ring-2 ring-brand/40' : 'border-line'}`}
        >
          <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5">
            <Icon name={STATUS_ICON[c.status]} size={16} className="shrink-0 text-muted" />
            <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{c.label}</h2>
            <span className="text-xs text-muted">{c.items.length}</span>
            {!readOnly && <IconButton icon="plus" label={`Add a task to ${c.label}`} onClick={() => addTaskAndOpen(topicId, { status: c.status })} className="[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11" />}
          </header>
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2 pb-16 md:pb-2">
            {c.items.map((e) => (
              <Card key={e.id} e={e} now={now} topics={topics} readOnly={readOnly} />
            ))}
            {c.items.length === 0 && <li className="px-2 py-6 text-center text-xs text-muted">{readOnly ? 'No tasks.' : 'Nothing here. Drag a card in, or use the plus icon.'}</li>}
          </ul>
        </section>
      ))}
    </div>
  )
}
