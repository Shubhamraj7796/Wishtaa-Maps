import { useState } from 'react'
import { arrangeChanged, GROUP_BY, SORT_BY, type Arrange, type GroupBy, type SortBy } from '@/core/tasks/agenda'
import { Icon, type IconName } from '@/ui/icons'
import { IconButton } from '@/ui/IconButton'
import { SELECTED, UNSELECTED } from '@/ui/iconSize'
import { Popover } from '@/ui/Popover'
import { resetArrange, setArrange } from './taskViewState'

const GROUP_ICON: Record<GroupBy, IconName> = { date: 'calendar', priority: 'flag', status: 'taskDone', topic: 'map', none: 'outline' }
const SORT_ICON: Record<SortBy, IconName> = { datetime: 'clock', date: 'calendar', name: 'type', priority: 'flag', status: 'taskDone', created: 'filePlus' }

function Choice({ icon, label, on, onPick, first, attr }: { icon: IconName; label: string; on: boolean; onPick: () => void; first?: boolean; attr: Record<string, string> }) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={on}
      data-autofocus={on && first ? '' : undefined}
      {...attr}
      onClick={onPick}
      className={`flex w-full items-center gap-2 rounded-ui px-2 py-1.5 text-left text-sm [@media(pointer:coarse)]:min-h-11 ${on ? SELECTED : UNSELECTED}`}
    >
      <Icon name={icon} size={18} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}

/**
 * "Arrange": how the Task view groups and sorts. An icon with a tooltip; its popover has Group by (Date, Priority, Status, Topic / branch,
 * None), Sort by (Date and time, Date only, Name, Priority, Status, Created) and an icon that turns the sort round. The choice is
 * remembered on this device and combines with the filters.
 */
export function ArrangeMenu({ arrange }: { arrange: Arrange }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const changed = arrangeChanged(arrange)
  return (
    <>
      <IconButton icon="arrange" label="Arrange" aria-haspopup="menu" aria-expanded={!!anchor} selected={!!anchor || changed} onClick={(e) => setAnchor(anchor ? null : e.currentTarget)} />
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} label="Arrange the tasks" className="w-64 p-2">
          <div data-arrange-menu>
            <div className="flex items-center justify-between px-1 pb-1 text-xs text-muted">
              <span>Group by</span>
            </div>
            <div role="group" aria-label="Group by" className="space-y-0.5">
              {GROUP_BY.map((g) => (
                <Choice key={g.id} icon={GROUP_ICON[g.id]} label={g.label} on={arrange.groupBy === g.id} onPick={() => setArrange({ groupBy: g.id })} attr={{ 'data-group-by': g.id }} first />
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between px-1 pb-1 text-xs text-muted">
              <span>Sort by</span>
              <span className="flex items-center gap-1">
                <IconButton
                  icon={arrange.desc ? 'sortDesc' : 'sortAsc'}
                  label={arrange.desc ? 'Descending: switch to ascending' : 'Ascending: switch to descending'}
                  role="menuitem"
                  data-sort-direction={arrange.desc ? 'desc' : 'asc'}
                  onClick={() => setArrange({ desc: !arrange.desc })}
                  className="[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
                />
                {changed && <IconButton icon="reset" label="Back to the starting arrangement" role="menuitem" onClick={resetArrange} className="[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11" />}
              </span>
            </div>
            <div role="group" aria-label="Sort by" className="space-y-0.5">
              {SORT_BY.map((g) => (
                <Choice key={g.id} icon={SORT_ICON[g.id]} label={g.label} on={arrange.sortBy === g.id} onPick={() => setArrange({ sortBy: g.id })} attr={{ 'data-sort-by': g.id }} />
              ))}
            </div>
            <p className="mt-2 px-1 text-xs text-muted">Tasks with no date or priority come last.</p>
          </div>
        </Popover>
      )}
    </>
  )
}
