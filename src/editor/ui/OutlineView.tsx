import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { addChild, addSibling, deleteTopics, moveTopic, reorder, setCollapsed, setText } from '@/core/model/commands'
import { buildIndex, childrenOf } from '@/core/model/tree'
import { computeNumbers } from '@/core/numbering'
import { Icon } from '@/ui/icons'
import { selectOnly } from '../actions'
import { mapDoc } from '../mapdoc'
import { useEditor } from '../store'
import { MarkBadge } from './MarkBadge'

interface Row {
  id: string
  depth: number
  hasKids: boolean
}

interface RowProps {
  row: Row
  text: string
  marks: string[]
  collapsed: boolean
  number: string
  selected: boolean
  register: (id: string, el: HTMLInputElement | null) => void
  onKey: (e: React.KeyboardEvent<HTMLInputElement>, row: Row) => void
}

const OutlineRow = memo(function OutlineRow({ row, text, marks, collapsed, number, selected, register, onKey }: RowProps) {
  return (
    <li role="treeitem" aria-level={row.depth + 1} aria-selected={selected} aria-expanded={row.hasKids ? !collapsed : undefined} className={`flex items-center gap-1 rounded-ui pr-2 ${selected ? 'bg-brand/10' : ''}`} style={{ paddingLeft: row.depth * 22 + 4 }}>
      <button
        type="button"
        aria-label={row.hasKids ? (collapsed ? 'Expand' : 'Collapse') : 'No sub topics'}
        disabled={!row.hasKids}
        onClick={() => setCollapsed(mapDoc, [row.id], !collapsed)}
        className="grid h-7 w-6 shrink-0 place-items-center rounded text-muted hover:bg-bg disabled:opacity-0"
      >
        <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={15} />
      </button>
      <span className="grid h-7 w-4 shrink-0 place-items-center" aria-hidden="true">
        <span className="h-1.5 w-1.5 rounded-full bg-muted" />
      </span>
      {marks.map((m, i) => (
        <MarkBadge key={`${m}-${i}`} mark={m} size={16} />
      ))}
      {number && <span className="shrink-0 text-sm text-muted">{number}</span>}
      <input
        key={`${row.id}:${text}`}
        ref={(el) => register(row.id, el)}
        defaultValue={text}
        aria-label={`Topic text, level ${row.depth + 1}`}
        onFocus={() => selectOnly(row.id)}
        onBlur={(e) => {
          if (e.currentTarget.value !== text && e.currentTarget.value.trim()) setText(mapDoc, row.id, e.currentTarget.value)
        }}
        onKeyDown={(e) => onKey(e, row)}
        className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none"
      />
    </li>
  )
})

/** The whole map as an editable indented list. Edits show up in the map immediately, and the other way round. */
export function OutlineView() {
  const topics = useEditor((s) => s.topics)
  const rootId = useEditor((s) => s.rootId)
  const selected = useEditor((s) => s.selected)
  const numbering = useEditor((s) => s.settings.numbering)
  const refs = useRef(new Map<string, HTMLInputElement>())
  const [pending, setPending] = useState<string | null>(null)

  const { rows } = useMemo(() => {
    const idx = buildIndex(topics)
    const out: Row[] = []
    const walk = (id: string, depth: number) => {
      const kids = childrenOf(idx, id)
      out.push({ id, depth, hasKids: kids.length > 0 })
      if (!topics[id]?.collapsed) kids.forEach((k) => walk(k.id, depth + 1))
    }
    if (topics[rootId]) walk(rootId, 0)
    for (const f of childrenOf(idx, null)) if (f.id !== rootId) walk(f.id, 0)
    return { rows: out }
  }, [topics, rootId])
  const numbers = useMemo(() => (numbering ? computeNumbers(topics, rootId) : new Map<string, string>()), [numbering, topics, rootId])
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  useEffect(() => {
    if (pending && refs.current.get(pending)) {
      const el = refs.current.get(pending)
      el?.focus()
      el?.select()
      setPending(null)
    }
  }, [pending, rows])

  const register = useMemo(
    () => (id: string, el: HTMLInputElement | null) => {
      if (el) refs.current.set(id, el)
      else refs.current.delete(id)
    },
    []
  )

  const commit = (e: React.KeyboardEvent<HTMLInputElement>, id: string) => {
    const v = e.currentTarget.value
    if (v.trim() && v !== topics[id]?.text) setText(mapDoc, id, v)
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, row: Row) => {
    const t = topics[row.id]
    if (!t) return
    const list = rowsRef.current
    const i = list.findIndex((r) => r.id === row.id)
    const idx = buildIndex(topics)
    const siblings = t.parentId && topics[t.parentId] ? childrenOf(idx, t.parentId) : []
    const pos = siblings.findIndex((s) => s.id === row.id)

    if (e.key === 'Enter') {
      e.preventDefault()
      commit(e, row.id)
      if (e.ctrlKey && row.hasKids) {
        setCollapsed(mapDoc, [row.id], !t.collapsed) // Ctrl+Enter folds or unfolds
        return
      }
      const id = row.id === rootId || !t.parentId ? addChild(mapDoc, row.id) : addSibling(mapDoc, row.id)
      if (id) setPending(id)
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      commit(e, row.id)
      const prev = siblings[pos - 1]
      if (prev && moveTopic(mapDoc, row.id, prev.id)) setPending(row.id)
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      commit(e, row.id)
      const parent = t.parentId ? topics[t.parentId] : undefined
      if (parent?.parentId) {
        const uncles = childrenOf(idx, parent.parentId)
        const at = uncles.findIndex((u) => u.id === parent.id)
        if (moveTopic(mapDoc, row.id, parent.parentId, at + 1)) setPending(row.id)
      }
    } else if (e.key === 'Backspace' && e.currentTarget.value === '' && row.id !== rootId && !row.hasKids) {
      e.preventDefault()
      deleteTopics(mapDoc, [row.id])
      const before = list[i - 1]
      if (before) setPending(before.id)
    } else if (e.key === 'ArrowUp' && !e.altKey) {
      e.preventDefault()
      commit(e, row.id)
      const target = list[i - 1]
      if (target) setPending(target.id)
    } else if (e.key === 'ArrowDown' && !e.altKey) {
      e.preventDefault()
      commit(e, row.id)
      const target = list[i + 1]
      if (target) setPending(target.id)
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey) {
      e.preventDefault()
      commit(e, row.id)
      if (reorder(mapDoc, row.id, e.key === 'ArrowUp' ? -1 : 1)) setPending(row.id)
    } else if (e.key === 'Escape') {
      e.currentTarget.blur()
    }
  }

  const sel = new Set(selected)
  return (
    <div className="absolute inset-0 overflow-y-auto bg-bg" role="region" aria-label="Outline view">
      <div className="mx-auto max-w-3xl px-4 py-5">
        <p className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span>Enter: new topic</span>
          <span>Tab / Shift+Tab: indent / outdent</span>
          <span>↑ ↓: move between topics</span>
          <span>Alt+↑ ↓: reorder</span>
          <span>Backspace on an empty topic: delete</span>
        </p>
        <ul role="tree" className="space-y-0.5 rounded-ui border border-line bg-surface p-2">
          {rows.map((row) => {
            const t = topics[row.id]
            if (!t) return null
            return (
              <OutlineRow
                key={row.id}
                row={row}
                text={t.text}
                marks={t.marks ?? []}
                collapsed={!!t.collapsed}
                number={numbers.get(row.id) ?? ''}
                selected={sel.has(row.id)}
                register={register}
                onKey={onKey}
              />
            )
          })}
        </ul>
      </div>
    </div>
  )
}
