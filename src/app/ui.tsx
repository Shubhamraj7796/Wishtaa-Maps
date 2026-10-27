import { useCallback, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { SortKey, SortSpec } from '@/core/files/types'
import { ArrowDown, ArrowUp, LayoutGrid, List } from './icons'

/** A value remembered in this browser (view mode, sort order, dismissed banners). */
export function usePref<T extends string>(key: string, fallback: T, allowed?: readonly T[]): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`wishtaamaps:${key}`)
      if (raw !== null && (!allowed || (allowed as readonly string[]).includes(raw))) return raw as T
    } catch {
      /* ignore */
    }
    return fallback
  })
  const set = useCallback(
    (v: T) => {
      setValue(v)
      try {
        localStorage.setItem(`wishtaamaps:${key}`, v)
      } catch {
        /* ignore */
      }
    },
    [key]
  )
  return [value, set]
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">{children}</div>
}

export function ActionCard({ icon, title, hint, onClick, disabled, badge }: { icon: ReactNode; title: string; hint?: string; onClick?: () => void; disabled?: boolean; badge?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="relative flex items-center gap-3 rounded-ui border border-line bg-surface p-3 text-left transition-colors enabled:hover:border-brand enabled:hover:bg-brand/10 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-ui bg-brand/15 text-brand">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{title}</span>
        {hint && <span className="block truncate text-xs text-muted">{hint}</span>}
      </span>
      {badge && <span className="absolute right-2 top-2 rounded-full bg-bg px-2 py-0.5 text-[10px] font-semibold text-muted">{badge}</span>}
    </button>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${value === t.id ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Chips<T extends string>({ chips, value, onChange, label }: { chips: { id: T; label: string; soon?: boolean }[]; value: T; onChange: (c: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          aria-pressed={value === c.id}
          onClick={() => onChange(c.id)}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${value === c.id ? 'border-brand bg-brand/15 text-ink' : 'border-line bg-surface text-muted hover:text-ink'}`}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}

const SORT_LABELS: Record<SortKey, string> = { modified: 'Editing time', name: 'Name', created: 'Created' }

export function SortControl({ sort, onChange }: { sort: SortSpec; onChange: (s: SortSpec) => void }) {
  return (
    <div className="flex items-center gap-1">
      <label className="sr-only" htmlFor="sort-key">Sort by</label>
      <select
        id="sort-key"
        value={sort.key}
        onChange={(e) => onChange({ ...sort, key: e.target.value as SortKey })}
        className="rounded-ui border border-line bg-surface px-2 py-1.5 text-sm"
      >
        {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
          <option key={k} value={k}>{SORT_LABELS[k]}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onChange({ ...sort, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
        aria-label={sort.dir === 'asc' ? 'Ascending. Switch to descending' : 'Descending. Switch to ascending'}
        title={sort.dir === 'asc' ? 'Ascending' : 'Descending'}
        className="grid h-8 w-8 place-items-center rounded-ui border border-line bg-surface hover:bg-bg"
      >
        {sort.dir === 'asc' ? <ArrowUp size={16} aria-hidden="true" /> : <ArrowDown size={16} aria-hidden="true" />}
      </button>
    </div>
  )
}

export function ViewToggle({ view, onChange }: { view: 'grid' | 'list'; onChange: (v: 'grid' | 'list') => void }) {
  const btn = (v: 'grid' | 'list', label: string, icon: ReactNode) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={view === v}
      onClick={() => onChange(v)}
      className={`grid h-8 w-8 place-items-center ${view === v ? 'bg-brand/15 text-ink' : 'text-muted hover:bg-bg'}`}
    >
      {icon}
    </button>
  )
  return (
    <div className="flex overflow-hidden rounded-ui border border-line bg-surface" role="group" aria-label="View">
      {btn('grid', 'Grid view', <LayoutGrid size={16} aria-hidden="true" />)}
      {btn('list', 'List view', <List size={16} aria-hidden="true" />)}
    </div>
  )
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-ui border border-dashed border-line px-6 py-12 text-center">
      <span className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-brand/15 text-brand">{icon}</span>
      <h2 className="text-base font-semibold">{title}</h2>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  )
}

export function Breadcrumbs({ trail, rootLabel, rootTo }: { trail: { id: string; name: string; to: string }[]; rootLabel: string; rootTo: string }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-sm text-muted">
      <Link to={rootTo} className="rounded px-1 hover:text-ink hover:underline">{rootLabel}</Link>
      {trail.map((c, i) => (
        <span key={c.id} className="flex items-center gap-1">
          <span aria-hidden="true">/</span>
          {i === trail.length - 1 ? <span aria-current="page" className="px-1 font-medium text-ink">{c.name}</span> : <Link to={c.to} className="rounded px-1 hover:text-ink hover:underline">{c.name}</Link>}
        </span>
      ))}
    </nav>
  )
}
