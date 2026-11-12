import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { allTasks, PRIORITIES, STATUS_LABEL, TASK_STATUSES, topicPath, type TaskEntry } from '@/core/model/tasks'
import type { TopicMap } from '@/core/model/tree'
import { arrangeTasks, filterTasks, filtersActive, formatDue, formatTime, hhmm, isOverdue, ymd, type Timing, type TaskFilters } from '@/core/tasks/agenda'
import { Icon } from '@/ui/icons'
import { IconButton, IconTile, TipButton } from '@/ui/IconButton'
import { ICON_BOX, SELECTED, UNSELECTED } from '@/ui/iconSize'
import { useEditor } from '../store'
import { ArrangeMenu } from './ArrangeMenu'
import { addTaskAndOpen, TaskTick } from './TaskList'
import { STATUS_ICON } from './TaskPopup'
import { openTaskEntry } from './openItem'
import { resetFilters, setFilters, toggleFilterPanel, useTaskView } from './taskViewState'
import { TopicPickerButton } from './TopicPicker'

/** The date of today and the time of day, kept fresh (a view left open overnight moves on by itself, and a task goes overdue on the minute). */
function useNow(): { today: string; time: string } {
  const [now, setNow] = useState(() => ({ today: ymd(new Date()), time: hhmm(new Date()) }))
  useEffect(() => {
    const id = window.setInterval(() => {
      const d = new Date()
      setNow((n) => (n.today === ymd(d) && n.time === hhmm(d) ? n : { today: ymd(d), time: hhmm(d) }))
    }, 15_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

/**
 * The side panel floats over the right edge of the editor (a bottom sheet on a phone). Its width is left free here, so the view's own
 * buttons are never under it.
 */
function useSidePanelWidth(): number {
  const open = useEditor((s) => s.panelOpen)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    if (!open) return setW(0)
    const measure = () => {
      const el = document.getElementById('settings-panel')
      const wide = window.matchMedia?.('(min-width: 768px)').matches ?? true
      setW(el && wide ? Math.ceil(el.getBoundingClientRect().width) : 0)
    }
    measure()
    const id = window.setInterval(measure, 400)
    window.addEventListener('resize', measure)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('resize', measure)
    }
  }, [open])
  return w
}

const chipBox = `grid select-none place-items-center rounded-ui text-sm font-semibold transition-colors ${ICON_BOX}`
const TIMINGS: { id: Timing; icon: 'calendar' | 'clock' | 'sun'; label: string }[] = [
  { id: 'any', icon: 'calendar', label: 'Any time of day' },
  { id: 'timed', icon: 'clock', label: 'Only tasks with a time' },
  { id: 'allday', icon: 'sun', label: 'Only all-day tasks' },
]
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

function FilterPanel({ f }: { f: TaskFilters }) {
  return (
    <div data-task-filters role="group" aria-label="Task filters" className="grid gap-3 border-b border-line bg-surface px-3 py-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <span className="mb-1 block text-xs text-muted">Status</span>
        <div className="flex items-center gap-1">
          {TASK_STATUSES.map((s) => (
            <IconTile key={s} role="checkbox" icon={STATUS_ICON[s]} label={`Show ${STATUS_LABEL[s]} tasks`} selected={f.statuses.includes(s)} onClick={() => setFilters({ statuses: toggle(f.statuses, s) })} data-filter-status={s} />
          ))}
        </div>
      </div>
      <div>
        <span className="mb-1 block text-xs text-muted">Priority</span>
        <div className="flex items-center gap-1" role="group" aria-label="Priority filter">
          {PRIORITIES.map((p) => (
            <TipButton
              key={p}
              type="button"
              role="checkbox"
              aria-checked={f.priorities.includes(p)}
              aria-label={`Show priority ${p}`}
              tip={`Priority ${p}${p === 1 ? ' (highest)' : p === 5 ? ' (lowest)' : ''}`}
              data-filter-priority={p}
              onClick={() => setFilters({ priorities: toggle(f.priorities, p) })}
              className={`${chipBox} ${f.priorities.includes(p) ? SELECTED : UNSELECTED}`}
            >
              {p}
            </TipButton>
          ))}
        </div>
      </div>
      <div>
        <span className="mb-1 block text-xs text-muted">Topic</span>
        <TopicPickerButton value={f.topicId} label="Choose the topic to look under" none="All topics" onChange={(id) => setFilters({ topicId: id })} />
        <div className="mt-1 flex items-center gap-1" role="radiogroup" aria-label="Sub topics">
          <IconTile role="radio" icon="topic" label="This topic only" selected={!f.withSub} disabled={!f.topicId} onClick={() => setFilters({ withSub: false })} />
          <IconTile role="radio" icon="subTopic" label="This topic and its sub topics" selected={f.withSub} disabled={!f.topicId} onClick={() => setFilters({ withSub: true })} />
        </div>
      </div>
      <div>
        <span className="mb-1 block text-xs text-muted">Due between</span>
        <div className="flex flex-wrap items-center gap-1">
          <input type="date" aria-label="Due from" value={f.from} onChange={(e) => setFilters({ from: e.target.value })} className="rounded-ui border border-line bg-surface px-2 py-1.5 text-sm" />
          <input type="date" aria-label="Due until" value={f.to} onChange={(e) => setFilters({ to: e.target.value })} className="rounded-ui border border-line bg-surface px-2 py-1.5 text-sm" />
        </div>
        <span className="mb-1 mt-2 block text-xs text-muted">Time of day</span>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Time of day">
          {TIMINGS.map((t) => (
            <IconTile key={t.id} role="radio" icon={t.icon} label={t.label} selected={f.timing === t.id} onClick={() => setFilters({ timing: t.id })} data-filter-timing={t.id} />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Project: this map</p>
      </div>
    </div>
  )
}

function Row({ e, now, topics, readOnly, onOpen }: { e: TaskEntry; now: { today: string; time: string }; topics: TopicMap; readOnly: boolean; onOpen: (e: TaskEntry) => void }) {
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

/**
 * Every task of the open map by date, in an Agenda: Overdue, Today, Tomorrow, This week, Later, No date (and Done when that status is
 * shown). Each row has a tick, the title, the path of its topic as a small label, the priority and the due date; a click opens the task in
 * its popup. The filters (status, priority, topic and sub topics, due dates, words) are on demand under the filter icon.
 */
export function TaskView() {
  const topics = useEditor((s) => s.topics)
  const tasks = useEditor((s) => s.tasks)
  const readOnly = useEditor((s) => s.readOnly)
  const selected = useEditor((s) => s.selected)
  const f = useTaskView((s) => s.filters)
  const arrange = useTaskView((s) => s.arrange)
  const panel = useTaskView((s) => s.panel)
  const now = useNow()
  const panelW = useSidePanelWidth()
  const all = useMemo(() => allTasks(topics, tasks), [topics, tasks])
  const shown = useMemo(() => filterTasks(all, topics, f), [all, topics, f])
  const groups = useMemo(() => arrangeTasks(shown, topics, arrange, now.today, now.time), [shown, topics, arrange, now.today, now.time])
  const active = filtersActive(f)
  const open = openTaskEntry
  return (
    <section aria-label="Tasks" data-task-view className="absolute inset-0 flex flex-col bg-bg" style={{ paddingRight: panelW }}>
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line bg-surface px-3 py-1.5">
        <div role="radiogroup" aria-label="Task view" className="flex items-center gap-1">
          <IconTile role="radio" icon="taskList" label="Agenda" selected onClick={() => undefined} />
        </div>
        <div className="mx-1 flex min-w-0 flex-1 items-center gap-2 rounded-ui border border-line bg-bg px-2">
          <Icon name="search" size={16} className="shrink-0 text-muted" />
          <input aria-label="Search tasks" value={f.text} onChange={(e) => setFilters({ text: e.target.value })} placeholder="Search tasks" className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none" />
        </div>
        <ArrangeMenu arrange={arrange} />
        <IconButton icon="filter" label="Filters" aria-expanded={panel} selected={panel || active} onClick={toggleFilterPanel} />
        {active && <IconButton icon="reset" label="Clear the filters" onClick={resetFilters} />}
        {!readOnly && <IconButton icon="plus" label="Add a task" onClick={() => addTaskAndOpen(selected[selected.length - 1] ?? null)} />}
      </div>
      {panel && <FilterPanel f={f} />}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="mx-auto max-w-3xl">
          {groups.map((g) => (
            <section key={g.id} data-agenda-group={g.id} aria-label={g.label} className="mb-4">
              {arrange.groupBy !== 'none' && (
                <h2 className={`mb-1 flex items-center gap-2 px-1 text-xs font-semibold tracking-wide ${arrange.groupBy === 'date' ? 'uppercase' : ''} ${g.alert ? 'text-bad' : 'text-muted'}`}>
                  <span className="min-w-0 truncate">{g.label}</span> <span className="font-normal">{g.items.length}</span>
                </h2>
              )}
              <ul className="overflow-hidden rounded-ui border border-line bg-surface">
                {g.items.map((e) => (
                  <Row key={e.id} e={e} now={now} topics={topics} readOnly={readOnly} onOpen={open} />
                ))}
              </ul>
            </section>
          ))}
          {groups.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-sm text-muted">
              <Icon name="taskList" size={28} />
              {all.length === 0 ? 'No tasks in this map yet. Add one with the plus icon.' : 'No tasks match the filters.'}
              <p className="text-xs">This map only (maps opened on this device come later).</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
