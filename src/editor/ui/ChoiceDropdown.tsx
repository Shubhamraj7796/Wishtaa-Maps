import { useRef, useState } from 'react'
import { PopoverRow } from './PopoverRow'

export interface Choice {
  id: string
  label: string
  thumb?: React.ReactNode
}

export interface ChoiceGroup {
  /** Heading shown above the group; leave out for a single plain list. */
  heading?: string
  items: Choice[]
}

/**
 * A compact "label + current value" row that opens a grouped list of choices, each with a picture and a name. The current
 * choice is highlighted; the arrow keys move, Enter applies and closes, Esc closes. Hovering or focusing a choice shows its name.
 */
export function ChoiceDropdown({
  label,
  value,
  groups,
  onPick,
  testId,
  columns = 3,
  thumbSize = 30,
}: {
  label: string
  value: string
  groups: ChoiceGroup[]
  onPick: (id: string) => void
  testId?: string
  columns?: number
  thumbSize?: number
}) {
  const all = groups.flatMap((g) => g.items)
  const current = all.find((c) => c.id === value)
  void thumbSize
  return (
    <PopoverRow label={label} thumb={current?.thumb} value={current?.label ?? '—'} testId={testId} wide>
      {(close) => <List groups={groups} value={value} columns={columns} onPick={(id) => { onPick(id); close() }} label={label} />}
    </PopoverRow>
  )
}

function List({ groups, value, columns, onPick, label }: { groups: ChoiceGroup[]; value: string; columns: number; onPick: (id: string) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [hint, setHint] = useState<string>(groups.flatMap((g) => g.items).find((c) => c.id === value)?.label ?? '')
  const options = () => [...(ref.current?.querySelectorAll<HTMLElement>('[role=option]') ?? [])]

  const move = (e: React.KeyboardEvent, to: (i: number, n: number) => number) => {
    e.preventDefault()
    const items = options()
    const i = items.indexOf(document.activeElement as HTMLElement)
    items[Math.max(0, Math.min(items.length - 1, to(i < 0 ? 0 : i, items.length)))]?.focus()
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') move(e, (i) => i + 1)
    else if (e.key === 'ArrowLeft') move(e, (i) => i - 1)
    else if (e.key === 'ArrowDown') move(e, (i) => i + columns)
    else if (e.key === 'ArrowUp') move(e, (i) => i - columns)
    else if (e.key === 'Home') move(e, () => 0)
    else if (e.key === 'End') move(e, (_i, n) => n - 1)
  }

  return (
    <div ref={ref} onKeyDown={onKey} className="space-y-3">
      {groups.map((g, gi) => (
        <div key={g.heading ?? gi} role="group" aria-label={g.heading ?? label}>
          {g.heading && <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{g.heading}</div>}
          <div role="listbox" aria-label={g.heading ?? label} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {g.items.map((c) => {
              const on = c.id === value
              return (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={on}
                  aria-label={g.heading ? `${g.heading}: ${c.label}` : c.label}
                  title={c.label}
                  onClick={() => onPick(c.id)}
                  onFocus={() => setHint(c.label)}
                  onMouseEnter={() => setHint(c.label)}
                  className={`flex flex-col items-center gap-1 rounded-ui border px-1 py-1.5 text-[11px] leading-tight ${on ? 'border-brand bg-brand/15 font-medium' : 'border-line hover:bg-bg'}`}
                >
                  {c.thumb}
                  <span className="line-clamp-2 text-center">{c.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <p aria-live="polite" className="min-h-4 border-t border-line pt-2 text-xs text-muted">
        {hint}
      </p>
    </div>
  )
}
