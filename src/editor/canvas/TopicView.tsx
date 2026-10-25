import { memo, useEffect, useRef, useState } from 'react'
import { PALETTE, type LaidOut } from '@/core/layout/mindmap'
import { cancelEdit, cmdAddChild, commitEdit } from '../actions'

export interface TopicViewProps {
  box: LaidOut
  text: string
  isRoot: boolean
  selected: boolean
  editing: boolean
  match: boolean
  current: boolean
  hidden: number
}

export function branchColor(branch: number): string {
  return branch < 0 ? '#1f2937' : (PALETTE[branch % PALETTE.length] ?? '#1f2937')
}

function Editor({ id, text }: { id: string; text: string }) {
  const [v, setV] = useState(text)
  const done = useRef(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const finish = (save: boolean) => {
    if (done.current) return
    done.current = true
    if (save) commitEdit(id, v)
    else cancelEdit()
  }
  return (
    <input
      ref={ref}
      aria-label="Topic text"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(true)
        else if (e.key === 'Escape') finish(false)
        else if (e.key === 'Tab') {
          e.preventDefault()
          finish(true)
          cmdAddChild()
        }
      }}
      className="h-full w-full bg-transparent text-center outline-none"
      style={{ font: 'inherit', color: 'inherit' }}
    />
  )
}

export const TopicView = memo(function TopicView(p: TopicViewProps) {
  const { box, isRoot } = p
  const color = branchColor(box.branch)
  const filled = isRoot || box.depth <= 1
  const style: React.CSSProperties = {
    left: box.x,
    top: box.y,
    width: box.w,
    height: box.h,
    borderColor: isRoot ? '#1f2937' : color,
    background: isRoot ? '#1f2937' : box.depth === 1 || box.depth === 0 ? color : `${color}1f`,
    color: filled ? '#fff' : undefined,
    fontSize: isRoot ? 17 : 14,
    fontWeight: isRoot ? 600 : box.depth === 1 ? 600 : 500,
  }
  const ring = p.current
    ? '0 0 0 3px #f59e0b'
    : p.selected
      ? '0 0 0 3px rgb(var(--c-brand)), 0 0 0 5px rgb(var(--c-surface))'
      : p.match
        ? '0 0 0 2px #f59e0b'
        : undefined
  return (
    <div
      data-topic={box.id}
      role="treeitem"
      aria-selected={p.selected}
      aria-label={p.text || 'Empty topic'}
      className="absolute flex select-none items-center justify-center rounded-xl border-2 px-3 leading-none"
      style={{ ...style, boxShadow: ring }}
    >
      {p.editing ? <Editor id={box.id} text={p.text} /> : <span className="truncate">{p.text || ' '}</span>}
      {p.hidden > 0 && (
        <button
          type="button"
          data-badge={box.id}
          aria-label={`Show ${p.hidden} hidden topics`}
          className="absolute top-1/2 -translate-y-1/2 rounded-full border border-line bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink shadow-sm"
          style={box.side === 'left' ? { left: -12 } : { right: -12 }}
        >
          {p.hidden}
        </button>
      )}
    </div>
  )
})
