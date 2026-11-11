import { useMemo, useState } from 'react'
import { topicPath } from '@/core/model/tasks'
import type { TopicMap } from '@/core/model/tree'
import { Icon } from '@/ui/icons'
import { IconButton } from '@/ui/IconButton'
import { Popover } from '@/ui/Popover'
import { useEditor } from '../store'

const MAX_SHOWN = 40

/**
 * A small searchable list of the map's topics, shown as paths ("Central › Dose › Storage"). Used to choose the topic a task sits on and
 * the topic a filter looks under. `only` limits it to some topics (those that have tasks, for a filter); `none` adds a "No topic" choice.
 */
export function TopicPickerList({ topics, onPick, only, none, onNone }: { topics: TopicMap; onPick: (id: string) => void; only?: ReadonlySet<string>; none?: string; onNone?: () => void }) {
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const out: { id: string; path: string }[] = []
    for (const t of Object.values(topics)) {
      if (only && !only.has(t.id)) continue
      const path = topicPath(topics, t.id)
      if (needle && !path.toLowerCase().includes(needle)) continue
      out.push({ id: t.id, path })
      if (out.length >= 400) break
    }
    return out.sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path)).slice(0, MAX_SHOWN)
  }, [topics, q, only])
  return (
    <div className="w-[min(360px,90vw)]">
      <div className="flex items-center gap-2 border-b border-line px-2 py-1.5">
        <Icon name="search" size={16} className="shrink-0 text-muted" />
        <input data-autofocus aria-label="Search topics" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search topics" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </div>
      <ul className="max-h-[40vh] overflow-y-auto py-1">
        {none && onNone && (
          <li>
            <button type="button" role="menuitem" onClick={onNone} className="w-full rounded-ui px-3 py-2 text-left text-sm text-muted hover:bg-bg [@media(pointer:coarse)]:min-h-11">
              {none}
            </button>
          </li>
        )}
        {rows.map((r) => (
          <li key={r.id}>
            <button type="button" role="menuitem" data-topic-pick={r.id} onClick={() => onPick(r.id)} className="w-full rounded-ui px-3 py-2 text-left text-sm hover:bg-bg [@media(pointer:coarse)]:min-h-11">
              <span className="line-clamp-2 break-words">{r.path}</span>
            </button>
          </li>
        ))}
        {rows.length === 0 && <li className="px-3 py-2 text-sm text-muted">No topics found.</li>}
      </ul>
    </div>
  )
}

/** A button (the topic icon) that opens the list and tells which topic was chosen (null for "No topic"). */
export function TopicPickerButton({ value, onChange, label = 'Choose the topic', none = 'No topic', disabled = false }: { value: string | null; onChange: (id: string | null) => void; label?: string; none?: string; disabled?: boolean }) {
  const topics = useEditor((s) => s.topics)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const current = value && topics[value] ? topicPath(topics, value) : null
  return (
    <div className="flex min-w-0 items-center gap-1">
      <IconButton icon="subTopic" label={label} disabled={disabled} aria-haspopup="menu" aria-expanded={!!anchor} selected={!!anchor} onClick={(e) => setAnchor(anchor ? null : e.currentTarget)} />
      <span data-topic-path className="min-w-0 flex-1 truncate text-sm">{current ?? <span className="text-muted">{none}</span>}</span>
      {anchor && (
        <Popover anchor={anchor} label={label} onClose={() => setAnchor(null)}>
          <TopicPickerList
            topics={topics}
            none={none}
            onNone={() => {
              onChange(null)
              setAnchor(null)
            }}
            onPick={(id) => {
              onChange(id)
              setAnchor(null)
            }}
          />
        </Popover>
      )}
    </div>
  )
}
