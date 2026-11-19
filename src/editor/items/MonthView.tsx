import { useEffect, useMemo, useRef } from 'react'
import type { TaskEntry } from '@/core/model/tasks'
import type { TopicMap } from '@/core/model/tree'
import { formatTime, isOverdue } from '@/core/tasks/agenda'
import { monthCells, monthLabel, moveDay, shiftMonth, tasksByDate, weekdayNames } from '@/core/tasks/month'
import { IconButton, TipButton } from '@/ui/IconButton'
import { Icon } from '@/ui/icons'
import { openTaskEntry } from './openItem'
import { TaskRow } from './TaskRow'
import { goToday, pickDay, setMonth, useTaskView } from './taskViewState'

interface Now {
  today: string
  time: string
}

const dayName = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const shortDay = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

function chipClass(e: TaskEntry, overdue: boolean): string {
  if (e.status === 'done') return 'bg-bg text-muted line-through'
  if (overdue) return 'bg-bad/15 text-bad'
  if (e.status === 'doing') return 'bg-brand/15 text-ink'
  return 'bg-brand/10 text-ink'
}

/**
 * The tasks of the map on a calendar month (Monday to Sunday weeks, like the Agenda). A square shows its day number and the first tasks of that
 * day (titles from a tablet width, small dots on a phone); a click on a square picks the day and lists its tasks beside the calendar (below it
 * on a narrow window); a click on a task opens it. Arrow keys move between days, Page Up and Page Down between months. Tasks with no date are
 * under their own icon. Only what the filters let through is shown.
 */
export function MonthView({ entries, topics, now, readOnly }: { entries: TaskEntry[]; topics: TopicMap; now: Now; readOnly: boolean }) {
  const month = useTaskView((s) => s.month)
  const day = useTaskView((s) => s.day)
  const grid = useRef<HTMLDivElement>(null)
  const focusNext = useRef(false)
  const cells = useMemo(() => monthCells(month, now.today), [month, now.today])
  const byDate = useMemo(() => tasksByDate(entries), [entries])
  const noDate = useMemo(() => entries.filter((e) => !e.due), [entries])
  const names = useMemo(() => weekdayNames(), [])

  // After a key press moved the day, the focus follows it (the square may have moved to another month).
  useEffect(() => {
    if (!focusNext.current) return
    focusNext.current = false
    grid.current?.querySelector<HTMLElement>(`[data-day="${day}"]`)?.focus()
  }, [day, month])

  const onKey = (e: React.KeyboardEvent, date: string) => {
    const next = moveDay(date, e.key)
    if (!next) return
    e.preventDefault()
    focusNext.current = true
    pickDay(next)
  }

  const picked = day === 'nodate' ? null : day
  const list = day === 'nodate' ? noDate : (byDate.get(day) ?? [])

  return (
    <div data-month-view className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <div className="mb-2 flex items-center gap-1">
          <IconButton icon="chevronLeft" label="Previous month" keys="PageUp" onClick={() => setMonth(shiftMonth(month, -1))} className="[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11" />
          <h2 aria-live="polite" data-month-label className="min-w-0 flex-1 truncate text-center text-sm font-semibold">{monthLabel(month)}</h2>
          <IconButton icon="chevronRight" label="Next month" keys="PageDown" onClick={() => setMonth(shiftMonth(month, 1))} className="[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11" />
          <IconButton icon="today" label="Go to today" onClick={goToday} className="[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11" />
          <TipButton
            type="button"
            tip={`Tasks with no date (${noDate.length})`}
            aria-label={`Tasks with no date, ${noDate.length}`}
            aria-pressed={day === 'nodate'}
            data-no-date
            onClick={() => pickDay(day === 'nodate' ? now.today : 'nodate')}
            className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-ui border [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 ${day === 'nodate' ? 'border-brand bg-brand/15' : 'border-transparent hover:bg-bg'}`}
          >
            <Icon name="taskList" size={18} />
            {noDate.length > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] font-semibold leading-4 text-brand-ink">{noDate.length}</span>}
          </TipButton>
        </div>
        <div ref={grid} role="grid" aria-label={monthLabel(month)} className="flex min-h-0 flex-1 flex-col">
          <div role="row" className="grid grid-cols-7 border-b border-line pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
            {names.map((n) => (
              <div key={n} role="columnheader">{n}</div>
            ))}
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-7 gap-px bg-line" style={{ gridTemplateRows: `repeat(${cells.length / 7}, minmax(3.25rem, 1fr))` }}>
            {cells.map((c) => {
              const tasks = byDate.get(c.date) ?? []
              const selected = c.date === picked
              const label = `${dayName(c.date)}${tasks.length ? `, ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}` : ''}`
              return (
                <div
                  key={c.date}
                  role="gridcell"
                  aria-selected={selected}
                  data-cell={c.date}
                  onClick={(e) => e.target === e.currentTarget && pickDay(c.date)}
                  className={`flex min-w-0 flex-col gap-0.5 overflow-hidden p-1 ${c.inMonth ? (c.weekend ? 'bg-surface/70' : 'bg-surface') : 'bg-bg text-muted'} ${selected ? 'ring-2 ring-inset ring-brand' : ''}`}
                >
                  <button
                    type="button"
                    data-day={c.date}
                    aria-label={label}
                    aria-current={c.isToday ? 'date' : undefined}
                    tabIndex={selected || (picked === null && c.isToday) ? 0 : -1}
                    onClick={() => pickDay(c.date)}
                    onKeyDown={(e) => onKey(e, c.date)}
                    className={`self-start rounded-full px-1.5 text-xs font-semibold leading-5 [@media(pointer:coarse)]:min-h-7 [@media(pointer:coarse)]:min-w-7 ${c.isToday ? 'bg-brand text-brand-ink' : ''}`}
                  >
                    {Number(c.date.slice(8, 10))}
                  </button>
                  <div className="hidden min-h-0 flex-col gap-0.5 sm:flex">
                    {tasks.slice(0, 3).map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        data-task-chip={e.id}
                        tabIndex={selected ? 0 : -1}
                        onClick={() => openTaskEntry(e)}
                        className={`truncate rounded px-1 text-left text-[11px] leading-4 ${chipClass(e, isOverdue(e, now.today, now.time))}`}
                      >
                        {e.time ? `${formatTime(e.time)} ` : ''}{e.title || 'Untitled task'}
                      </button>
                    ))}
                    {tasks.length > 3 && <span className="px-1 text-[11px] text-muted">+{tasks.length - 3}</span>}
                  </div>
                  {tasks.length > 0 && (
                    <div aria-hidden="true" className="flex flex-wrap gap-0.5 px-0.5 sm:hidden">
                      {tasks.slice(0, 3).map((e) => (
                        <span key={e.id} className={`h-1.5 w-1.5 rounded-full ${e.status === 'done' ? 'bg-muted' : isOverdue(e, now.today, now.time) ? 'bg-bad' : 'bg-brand'}`} />
                      ))}
                      {tasks.length > 3 && <span className="text-[9px] leading-none text-muted">+{tasks.length - 3}</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <aside data-day-list aria-label={picked ? shortDay(picked) : 'Tasks with no date'} className="max-h-[45%] shrink-0 overflow-y-auto border-t border-line bg-bg px-3 pb-16 pt-3 lg:max-h-none lg:w-80 lg:border-l lg:border-t-0 lg:pb-3">
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
          <span className="min-w-0 flex-1 truncate">{picked ? shortDay(picked) : 'No date'}</span>
          <span className="font-normal">{list.length}</span>
        </h3>
        {list.length > 0 ? (
          <ul className="overflow-hidden rounded-ui border border-line bg-surface">
            {list.map((e) => (
              <TaskRow key={e.id} e={e} now={now} topics={topics} readOnly={readOnly} onOpen={openTaskEntry} />
            ))}
          </ul>
        ) : (
          <p className="px-1 py-6 text-center text-sm text-muted">{picked ? (readOnly ? 'No tasks on this day.' : 'No tasks on this day. Use the plus icon to add one.') : 'Every task has a date.'}</p>
        )}
      </aside>
    </div>
  )
}
