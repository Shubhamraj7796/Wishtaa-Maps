import { useMemo } from 'react'
import { Icon } from '@/ui/icons'
import { TipButton } from '@/ui/IconButton'
import { useEditor } from '../store'
import { toggleList } from './state'

/**
 * The small tasks icon of a topic that has tasks of its own, with their number when there are several. A click opens the topic's list of
 * tasks. (A topic that is itself a task keeps its own round tick, as before.)
 */
export function TasksChip({ id, className = '', size = 14, stop = false }: { id: string; className?: string; size?: number; stop?: boolean }) {
  const n = useEditor((s) => s.itemCounts[id]?.tasks ?? 0)
  const tasks = useEditor((s) => s.tasks)
  const open = useMemo(() => Object.values(tasks).filter((t) => t.topicId === id && t.status !== 'done').length, [tasks, id])
  if (!n) return null
  const label = `${n === 1 ? 'Task' : `${n} tasks`}${open !== n ? ` (${open} open)` : ''}`
  return (
    <TipButton
      tip={label}
      type="button"
      data-action
      data-tasks-chip={id}
      aria-label={`${label}. Open the list`}
      aria-haspopup="menu"
      onClick={(e) => {
        if (stop) e.stopPropagation()
        toggleList('tasks', id, e.currentTarget)
      }}
      className={`inline-flex items-center gap-0.5 rounded px-0.5 text-[10px] leading-none hover:bg-black/10 ${className}`}
    >
      <Icon name={open === 0 ? 'taskDone' : 'task'} size={size} />
      {n > 1 && <span>{n}</span>}
    </TipButton>
  )
}
