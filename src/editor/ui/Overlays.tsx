import { useEffect, useMemo, useRef, useState } from 'react'
import { closeSearch, setHelp, setPalette, setQuery, stepMatch } from '../actions'
import { COMMANDS, displayKeys, type Cmd } from '../registry'
import { useEditor } from '../store'

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-line bg-bg px-1.5 py-0.5 font-mono text-[11px] text-muted">{children}</kbd>
  )
}

export function SearchBar() {
  const search = useEditor((s) => s.search)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (search.open) {
      ref.current?.focus()
      ref.current?.select()
    }
  }, [search.open])
  if (!search.open) return null
  return (
    <div
      role="search"
      className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2 rounded-ui border border-line bg-surface px-3 py-2 shadow-lg"
    >
      <input
        ref={ref}
        aria-label="Search topics and notes"
        placeholder="Search topics and notes…"
        value={search.query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') closeSearch()
          else if (e.key === 'Enter') stepMatch(e.shiftKey ? -1 : 1)
        }}
        className="w-56 bg-transparent text-sm outline-none"
      />
      <span className="min-w-14 text-right text-xs text-muted" aria-live="polite">
        {search.query ? (search.matches.length ? `${search.index + 1} / ${search.matches.length}` : 'No matches') : ''}
      </span>
      <button type="button" aria-label="Previous match" onClick={() => stepMatch(-1)} className="px-1 text-muted hover:text-ink">
        ↑
      </button>
      <button type="button" aria-label="Next match" onClick={() => stepMatch(1)} className="px-1 text-muted hover:text-ink">
        ↓
      </button>
      <button type="button" aria-label="Close search" onClick={closeSearch} className="px-1 text-muted hover:text-ink">
        ✕
      </button>
    </div>
  )
}

export function CommandPalette() {
  const open = useEditor((s) => s.paletteOpen)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setActive(0)
      requestAnimationFrame(() => ref.current?.focus())
    }
  }, [open])

  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    return COMMANDS.filter((c) => c.palette !== false && words.every((w) => c.label.toLowerCase().includes(w)))
  }, [q])

  if (!open) return null
  const run = (c: Cmd | undefined) => {
    setPalette(false)
    if (c) requestAnimationFrame(c.run)
  }
  return (
    <div className="absolute inset-0 z-30 flex items-start justify-center bg-black/30 pt-24" onPointerDown={() => setPalette(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-[min(520px,92vw)] overflow-hidden rounded-ui border border-line bg-surface shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <input
          ref={ref}
          aria-label="Type a command"
          placeholder="Type a command…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') setPalette(false)
            else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(a + 1, list.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter') run(list[active])
          }}
          className="w-full border-b border-line bg-transparent px-4 py-3 text-sm outline-none"
        />
        <ul role="listbox" className="max-h-80 overflow-auto py-1">
          {list.length === 0 && <li className="px-4 py-3 text-sm text-muted">No commands found</li>}
          {list.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(c)}
              className={`flex cursor-pointer items-center justify-between px-4 py-2 text-sm ${i === active ? 'bg-brand/15' : ''}`}
            >
              <span>{c.label}</span>
              {displayKeys(c) && <Kbd>{displayKeys(c)}</Kbd>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function ShortcutSheet() {
  const open = useEditor((s) => s.helpOpen)
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (open) ref.current?.focus()
  }, [open])
  if (!open) return null
  const groups = ['Edit', 'Navigate', 'View', 'Tools'] as const
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/30 p-4" onPointerDown={() => setHelp(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="max-h-full w-[min(760px,100%)] overflow-auto rounded-ui border border-line bg-surface p-5 shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && setHelp(false)}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Keyboard shortcuts</h2>
          <button ref={ref} type="button" onClick={() => setHelp(false)} className="rounded-ui border border-line px-2 py-1 text-sm">
            Close
          </button>
        </div>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {groups.map((g) => (
            <section key={g}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{g}</h3>
              <ul className="space-y-1">
                {COMMANDS.filter((c) => c.group === g && displayKeys(c)).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>{c.label}</span>
                    <span className="flex gap-1">
                      {(c.hint ? [c.hint] : (c.keys ?? []).slice(0, 2)).map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">
          Mouse: wheel to zoom · drag empty space to pan (Hand tool) · Shift+drag or Select tool to box-select · double-click
          to rename · drag a topic onto another to re-parent, or onto its top/bottom edge to reorder.
        </p>
      </div>
    </div>
  )
}
