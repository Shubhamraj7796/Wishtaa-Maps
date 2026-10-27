import { useEffect, useMemo, useRef, useState } from 'react'
import type { LaidOut, Scene } from '@/core/layout/types'
import type { Boundary, Callout, Relationship, Summary } from '@/core/model/objects'
import { buildIndex, descendantIds } from '@/core/model/tree'
import { DASH, accentFor, type ResolvedTheme } from '@/core/theme/resolve'
import { commitObjectText, editObject, patchObject, selectObject } from '../content'
import { useEditor } from '../store'
import {
  arrowEnds,
  arrowHeadPath,
  bendForPointer,
  boundaryGeometry,
  calloutGeometry,
  calloutSize,
  relationshipGeometry,
  summaryGeometry,
  summaryLabelSize,
  type Box,
} from './objects'

const DEFAULT_REL_COLOR = '#e11d48'

/** Small text box that edits a piece of text in place. */
function InlineEdit({ value, placeholder, multiline, onDone, className, style }: {
  value: string
  placeholder?: string
  multiline?: boolean
  onDone: (text: string | null) => void
  className?: string
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const done = useRef(false)
  const [v, setV] = useState(value)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const finish = (save: boolean) => {
    if (done.current) return
    done.current = true
    onDone(save ? v : null)
  }
  const common = {
    ref,
    value: v,
    placeholder,
    'aria-label': placeholder ?? 'Text',
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setV(e.target.value),
    onBlur: () => finish(true),
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onKeyDown: (e: React.KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Escape') finish(false)
      else if (e.key === 'Enter' && (!multiline || !e.shiftKey)) {
        e.preventDefault()
        finish(true)
      }
    },
    className: `bg-transparent text-center outline-none ${className ?? ''}`,
    style,
  }
  return multiline ? <textarea {...common} rows={2} className={`${common.className} resize-none`} /> : <input {...common} />
}

interface Props {
  scene: Scene
  theme: ResolvedTheme
  /** "back" draws boundaries behind the topics; "front" draws everything else on top. */
  layer: 'back' | 'front'
}

export function ObjectsLayer({ scene, theme, layer }: Props) {
  const objects = useEditor((s) => s.objects)
  const topics = useEditor((s) => s.topics)
  const selected = useEditor((s) => s.selectedObject)
  const editing = useEditor((s) => s.editingObject)
  const k = useEditor((s) => s.viewport.k)
  const kRef = useRef(k)
  kRef.current = k
  const idx = useMemo(() => buildIndex(topics), [topics])
  const [liveCallout, setLiveCallout] = useState<{ id: string; dx: number; dy: number } | null>(null)
  const [liveBend, setLiveBend] = useState<{ id: string; bend: number } | null>(null)
  const dragStart = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null)

  const box = (id: string): LaidOut | undefined => scene.boxes.get(id)
  const isSel = (kind: string, id: string) => selected?.kind === kind && selected.id === id
  const isEdit = (kind: string, id: string) => editing?.kind === kind && editing.id === id

  const stop = (e: React.PointerEvent) => e.stopPropagation()
  const pick = (kind: 'relationship' | 'callout' | 'boundary' | 'summary', id: string) => (e: React.PointerEvent) => {
    e.stopPropagation()
    if (!isSel(kind, id)) selectObject({ kind, id })
  }

  // ---- boundaries (behind the topics) ----
  if (layer === 'back') {
    return (
      <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden="true">
        {Object.values(objects.boundaries).map((b: Boundary) => {
          const members = new Set<string>()
          for (const id of b.topicIds) {
            members.add(id)
            descendantIds(idx, id).forEach((d) => members.add(d))
          }
          const boxes = [...members].map(box).filter((x): x is LaidOut => !!x)
          const g = boundaryGeometry(boxes, b.shape)
          if (!g) return null
          const color = b.color ?? accentFor(theme, boxes[0]?.branch ?? -1)
          const sel = isSel('boundary', b.id)
          const common = {
            fill: color,
            fillOpacity: sel ? 0.14 : 0.07,
            stroke: color,
            strokeWidth: sel ? 3 : 2,
            strokeDasharray: DASH[b.lineStyle],
            pointerEvents: 'all' as const,
            style: { cursor: 'pointer' },
            'data-obj': 'boundary',
            onPointerDown: pick('boundary', b.id),
            onDoubleClick: () => editObject({ kind: 'boundary', id: b.id }),
          }
          return g.shape === 'ellipse' ? (
            <ellipse key={b.id} cx={g.box.x + g.box.w / 2} cy={g.box.y + g.box.h / 2} rx={g.box.w / 2} ry={g.box.h / 2} {...common} />
          ) : (
            <rect key={b.id} x={g.box.x} y={g.box.y} width={g.box.w} height={g.box.h} rx={g.rx} {...common} />
          )
        })}
      </svg>
    )
  }

  // ---- everything else, on top ----
  const rels = Object.values(objects.relationships) as Relationship[]
  const summaries = Object.values(objects.summaries) as Summary[]
  const callouts = Object.values(objects.callouts) as Callout[]
  const boundaries = Object.values(objects.boundaries) as Boundary[]

  return (
    <>
      <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden="true">
        {rels.map((r) => {
          const a = box(r.from)
          const b = box(r.to)
          if (!a || !b) return null
          const bend = liveBend?.id === r.id ? liveBend.bend : r.bend
          const g = relationshipGeometry(a as Box, b as Box, bend)
          const color = r.color ?? DEFAULT_REL_COLOR
          const sel = isSel('relationship', r.id)
          const ends = arrowEnds(r.arrows)
          const width = (r.width ?? 2.4) + (sel ? 1 : 0)
          return (
            <g key={r.id} data-obj="relationship">
              <path d={g.d} fill="none" stroke="transparent" strokeWidth={16} pointerEvents="stroke" style={{ cursor: 'pointer' }} onPointerDown={pick('relationship', r.id)} onDoubleClick={() => editObject({ kind: 'relationship', id: r.id })} />
              <path d={g.d} fill="none" stroke={color} strokeWidth={width} strokeDasharray={DASH[r.lineStyle ?? 'solid']} strokeLinecap="round" />
              {ends.end && <path d={arrowHeadPath(g.end, g.endAngle + Math.PI, 11)} fill={color} />}
              {ends.start && <path d={arrowHeadPath(g.start, g.startAngle + Math.PI, 11)} fill={color} />}
              {sel && (
                <circle
                  cx={g.mid.x}
                  cy={g.mid.y}
                  r={7}
                  fill="rgb(var(--c-surface))"
                  stroke={color}
                  strokeWidth={2.5}
                  pointerEvents="all"
                  style={{ cursor: 'grab', touchAction: 'none' }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    e.currentTarget.setPointerCapture(e.pointerId)
                    setLiveBend({ id: r.id, bend })
                  }}
                  onPointerMove={(e) => {
                    if (!liveBend || liveBend.id !== r.id) return
                    const svg = e.currentTarget.ownerSVGElement
                    const m = svg?.getScreenCTM()
                    if (!m) return
                    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
                    setLiveBend({ id: r.id, bend: bendForPointer(a as Box, b as Box, { x: p.x, y: p.y }) })
                  }}
                  onPointerUp={(e) => {
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
                    if (liveBend?.id === r.id) patchObject('relationship', r.id, { bend: liveBend.bend })
                    setLiveBend(null)
                  }}
                />
              )}
            </g>
          )
        })}

        {summaries.map((s) => {
          const parent = box(s.parentId)
          const kids = s.topicIds.map(box).filter((x): x is LaidOut => !!x && topics[x.id]?.parentId === s.parentId)
          if (!parent || !kids.length) return null
          const g = summaryGeometry(kids as Box[], parent.flow, summaryLabelSize(s.text))
          if (!g) return null
          const color = accentFor(theme, kids[0]?.branch ?? -1)
          const sel = isSel('summary', s.id)
          return (
            <g key={s.id} data-obj="summary">
              <path d={g.d} fill="none" stroke="transparent" strokeWidth={16} pointerEvents="stroke" style={{ cursor: 'pointer' }} onPointerDown={pick('summary', s.id)} />
              <path d={g.d} fill="none" stroke={color} strokeWidth={sel ? 3.5 : 2.5} strokeLinecap="round" />
            </g>
          )
        })}

        {callouts.map((c) => {
          const t = box(c.topicId)
          if (!t) return null
          const live = liveCallout?.id === c.id ? liveCallout : c
          const g = calloutGeometry(t as Box, live.dx, live.dy, calloutSize(c.text))
          return <path key={c.id} d={g.tail} fill="#fef3c7" stroke="#f59e0b" strokeWidth={1.5} strokeLinejoin="round" />
        })}
      </svg>

      {/* relationship labels */}
      {rels.map((r) => {
        const a = box(r.from)
        const b = box(r.to)
        if (!a || !b) return null
        const bend = liveBend?.id === r.id ? liveBend.bend : r.bend
        const g = relationshipGeometry(a as Box, b as Box, bend)
        const edit = isEdit('relationship', r.id)
        if (!r.label && !edit) return null
        const color = r.color ?? DEFAULT_REL_COLOR
        return (
          <div
            key={`l-${r.id}`}
            data-obj="relationship"
            className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border bg-surface px-2 py-0.5 text-xs text-ink"
            style={{ left: g.mid.x, top: g.mid.y - 14, borderColor: color, cursor: 'pointer' }}
            onPointerDown={pick('relationship', r.id)}
            onDoubleClick={() => editObject({ kind: 'relationship', id: r.id })}
          >
            {edit ? (
              <InlineEdit value={r.label} placeholder="Label" onDone={(t) => (t === null ? editObject(null) : commitObjectText('relationship', r.id, t))} className="w-28" />
            ) : (
              r.label
            )}
          </div>
        )
      })}

      {/* boundary labels */}
      {boundaries.map((b) => {
        const members = new Set<string>()
        for (const id of b.topicIds) {
          members.add(id)
          descendantIds(idx, id).forEach((d) => members.add(d))
        }
        const boxes = [...members].map(box).filter((x): x is LaidOut => !!x)
        const g = boundaryGeometry(boxes, b.shape)
        const edit = isEdit('boundary', b.id)
        if (!g || (!b.label && !edit)) return null
        const color = b.color ?? accentFor(theme, boxes[0]?.branch ?? -1)
        return (
          <div
            key={`b-${b.id}`}
            data-obj="boundary"
            className="absolute rounded-md border bg-surface px-2 py-0.5 text-xs text-ink"
            style={{ left: g.box.x + 10, top: g.box.y - 12, borderColor: color }}
            onPointerDown={pick('boundary', b.id)}
          >
            {edit ? <InlineEdit value={b.label} placeholder="Boundary name" onDone={(t) => (t === null ? editObject(null) : patchAndClose('boundary', b.id, { label: t.slice(0, 60) }))} className="w-28" /> : b.label}
          </div>
        )
      })}

      {/* summary text boxes */}
      {summaries.map((s) => {
        const parent = box(s.parentId)
        const kids = s.topicIds.map(box).filter((x): x is LaidOut => !!x && topics[x.id]?.parentId === s.parentId)
        if (!parent || !kids.length) return null
        const g = summaryGeometry(kids as Box[], parent.flow, summaryLabelSize(s.text))
        if (!g) return null
        const color = accentFor(theme, kids[0]?.branch ?? -1)
        const edit = isEdit('summary', s.id)
        const sel = isSel('summary', s.id)
        return (
          <div
            key={`s-${s.id}`}
            data-obj="summary"
            className="absolute flex items-center justify-center rounded-lg border-2 bg-surface px-2 text-sm font-medium text-ink"
            style={{ left: g.label.x, top: g.label.y, width: g.label.w, height: g.label.h, borderColor: color, boxShadow: sel ? `0 0 0 3px ${color}55` : undefined, cursor: 'pointer' }}
            onPointerDown={pick('summary', s.id)}
            onDoubleClick={() => editObject({ kind: 'summary', id: s.id })}
          >
            {edit ? (
              <InlineEdit value={s.text} placeholder="Summary" onDone={(t) => (t === null ? editObject(null) : commitObjectText('summary', s.id, t))} className="w-full" />
            ) : (
              <span className="truncate">{s.text || 'Summary'}</span>
            )}
          </div>
        )
      })}

      {/* callout bubbles */}
      {callouts.map((c) => {
        const t = box(c.topicId)
        if (!t) return null
        const live = liveCallout?.id === c.id ? liveCallout : c
        const size = calloutSize(c.text)
        const g = calloutGeometry(t as Box, live.dx, live.dy, size)
        const edit = isEdit('callout', c.id)
        const sel = isSel('callout', c.id)
        return (
          <div
            key={`c-${c.id}`}
            data-obj="callout"
            className="absolute flex items-center justify-center rounded-xl border-[1.5px] px-2 text-center text-[13px] leading-[19px]"
            style={{
              left: g.box.x,
              top: g.box.y,
              width: g.box.w,
              minHeight: g.box.h,
              background: '#fef3c7',
              borderColor: '#f59e0b',
              color: '#1f2937',
              boxShadow: sel ? '0 0 0 3px #f59e0b66' : undefined,
              cursor: edit ? 'text' : 'grab',
              touchAction: 'none',
            }}
            onPointerDown={(e) => {
              if (edit) return stop(e)
              e.stopPropagation()
              if (!sel) selectObject({ kind: 'callout', id: c.id })
              e.currentTarget.setPointerCapture(e.pointerId)
              dragStart.current = { x: e.clientX, y: e.clientY, dx: c.dx, dy: c.dy }
            }}
            onPointerMove={(e) => {
              const d = dragStart.current
              if (!d) return
              setLiveCallout({ id: c.id, dx: Math.round(d.dx + (e.clientX - d.x) / kRef.current), dy: Math.round(d.dy + (e.clientY - d.y) / kRef.current) })
            }}
            onPointerUp={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
              if (dragStart.current && liveCallout?.id === c.id) patchObject('callout', c.id, { dx: liveCallout.dx, dy: liveCallout.dy })
              dragStart.current = null
              setLiveCallout(null)
            }}
            onDoubleClick={() => editObject({ kind: 'callout', id: c.id })}
          >
            {edit ? (
              <InlineEdit value={c.text} placeholder="Callout text" multiline onDone={(t) => (t === null ? editObject(null) : commitObjectText('callout', c.id, t))} className="w-full" />
            ) : (
              <span style={{ wordBreak: 'break-word' }}>{c.text || 'Double-click to write a note'}</span>
            )}
          </div>
        )
      })}
    </>
  )
}

function patchAndClose(kind: 'boundary', id: string, patch: Record<string, unknown>) {
  patchObject(kind, id, patch)
  editObject(null)
}
