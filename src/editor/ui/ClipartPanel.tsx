import { useMemo, useState } from 'react'
import { DynamicIcon, iconNames, type IconName as LucideName } from 'lucide-react/dynamic'
import { Icon } from '@/ui/icons'
import { toggleMarkSelected } from '../content'
import { useEditor } from '../store'
import { CLIPART_CATEGORIES, CLIPART_COLORS, searchIconNames } from './clipartData'

/** Searchable clipart: every icon in the open-source Lucide set (about 2,000), plus curated categories. */
export default function ClipartPanel() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>(Object.keys(CLIPART_CATEGORIES)[0] as string)
  const [color, setColor] = useState<string>(CLIPART_COLORS[0] as string)
  const selected = useEditor((s) => s.selected)
  const topics = useEditor((s) => s.topics)
  const primary = selected[selected.length - 1]
  const marks = new Set(primary ? (topics[primary]?.marks ?? []) : [])

  const names = useMemo(() => {
    const q = query.trim()
    return q ? searchIconNames(iconNames as readonly string[], q) : (CLIPART_CATEGORIES[category] ?? [])
  }, [query, category])

  const markFor = (n: string) => `c:${n}${color === CLIPART_COLORS[0] ? '' : `:${color}`}`

  return (
    <div className="px-4 py-3">
      <label className="flex items-center gap-2 rounded-ui border border-line px-2 py-1.5">
        <Icon name="search" size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clipart…"
          aria-label="Search clipart"
          className="w-full bg-transparent text-sm outline-none"
        />
        {query && (
          <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>
            <Icon name="close" size={14} />
          </button>
        )}
      </label>
      {!query && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Clipart categories">
          {Object.keys(CLIPART_CATEGORIES).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={`rounded-full border px-2.5 py-1 text-xs ${category === c ? 'border-brand bg-brand/15 font-medium' : 'border-line hover:bg-bg'}`}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-1.5" role="group" aria-label="Clipart colour">
        {CLIPART_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Colour ${c}`}
            aria-pressed={color === c}
            onClick={() => setColor(c)}
            className={`h-5 w-5 rounded-full border-2 ${color === c ? 'border-brand ring-2 ring-brand/40' : 'border-surface'}`}
            style={{ background: c }}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {names.map((n) => (
          <button
            key={n}
            type="button"
            title={n.replace(/-/g, ' ')}
            aria-label={`Add ${n.replace(/-/g, ' ')}`}
            aria-pressed={marks.has(markFor(n))}
            onClick={() => toggleMarkSelected(markFor(n))}
            className={`grid h-11 place-items-center rounded-ui border transition-transform hover:scale-105 ${marks.has(markFor(n)) ? 'border-brand bg-brand/15' : 'border-transparent hover:bg-bg'}`}
          >
            <DynamicIcon name={n as LucideName} size={24} color={color} strokeWidth={2} fallback={() => <span className="h-6 w-6" />} />
          </button>
        ))}
      </div>
      {names.length === 0 && <p className="mt-3 text-sm text-muted">No clipart matches “{query}”.</p>}
      {selected.length === 0 && <p className="mt-3 text-xs text-muted">Select a topic first, then click a clipart to add it.</p>}
    </div>
  )
}
