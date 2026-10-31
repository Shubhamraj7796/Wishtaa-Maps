import { useState } from 'react'
import type { ArrowEnds, BoundaryShape } from '@/core/model/objects'
import type { LineStyle } from '@/core/model/types'
import { isHex } from '@/core/theme/color'
import { ArrowEndsIcon, LineIcon, ShapeIcon } from '@/ui/icons'
import { patchObject } from '../content'
import { useEditor } from '../store'
import { ColorPicker } from './ColorPicker'
import { Section, field } from './panelKit'
import { Slider } from './Slider'

const pick = (on: boolean) => `grid h-9 min-w-10 place-items-center rounded-ui border px-1 ${on ? 'border-brand bg-brand/15' : 'border-line hover:bg-bg'}`

/** A text field that saves when you leave it (one undo step), not on every key. */
function TextField({ label, value, onCommit, multiline = false, max }: { label: string; value: string; onCommit: (v: string) => void; multiline?: boolean; max: number }) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? value
  const done = () => {
    if (draft !== null && draft !== value) onCommit(draft.slice(0, max))
    setDraft(null)
  }
  return (
    <label className="block space-y-1 text-sm">
      <span>{label}</span>
      {multiline ? (
        <textarea value={shown} rows={3} maxLength={max} onChange={(e) => setDraft(e.target.value)} onBlur={done} className={`${field} w-full`} />
      ) : (
        <input value={shown} maxLength={max} onChange={(e) => setDraft(e.target.value)} onBlur={done} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className={`${field} w-full`} />
      )}
    </label>
  )
}

function Dashes({ value, onPick }: { value: LineStyle; onPick: (l: LineStyle) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span>Dash</span>
      <div className="flex gap-1.5" role="group" aria-label="Line style">
        {(['solid', 'dashed', 'dotted'] as LineStyle[]).map((l) => (
          <button key={l} type="button" aria-pressed={value === l} aria-label={`Line: ${l}`} title={l} onClick={() => onPick(l)} className={pick(value === l)}>
            <LineIcon style={l} />
          </button>
        ))}
      </div>
    </div>
  )
}

/** The selected relationship line, callout, boundary or summary: its own style, in the panel. */
export function ObjectStyle() {
  const ref = useEditor((s) => s.selectedObject)
  const objects = useEditor((s) => s.objects)
  if (!ref) {
    return (
      <Section title="Object style">
        <p className="text-sm text-muted">Select a relationship line, callout, boundary or summary to change how it looks.</p>
      </Section>
    )
  }

  if (ref.kind === 'relationship') {
    const r = objects.relationships[ref.id]
    if (!r) return null
    const set = (patch: Record<string, unknown>) => patchObject('relationship', r.id, patch)
    return (
      <Section title="Relationship line">
        <TextField label="Label" value={r.label} max={80} onCommit={(v) => set({ label: v })} />
        <div className="flex items-center justify-between gap-2 text-sm">
          <span>Colour</span>
          <ColorPicker variant="swatch" label="Line colour" value={isHex(r.color) ? r.color : '#e11d48'} onChange={(v) => set({ color: v })} onClear={r.color ? () => set({ color: undefined }) : undefined} />
        </div>
        <Slider label="Thickness" value={r.width ?? 2.4} min={1} max={12} step={0.5} format={(v) => `${v} px`} onCommit={(v) => set({ width: v })} />
        <Slider label="Curve" value={r.bend} min={-200} max={200} step={10} format={(v) => (v === 0 ? 'straight' : String(v))} onCommit={(v) => set({ bend: v })} />
        <Dashes value={r.lineStyle ?? 'solid'} onPick={(l) => set({ lineStyle: l })} />
        <div className="flex items-center justify-between gap-2 text-sm">
          <span>Arrows</span>
          <div className="flex gap-1.5" role="group" aria-label="Arrow heads">
            {(['end', 'both', 'start', 'none'] as ArrowEnds[]).map((a) => (
              <button key={a} type="button" aria-pressed={r.arrows === a} aria-label={`Arrows: ${a === 'end' ? 'at the end' : a === 'start' ? 'at the start' : a}`} title={`Arrows: ${a}`} onClick={() => set({ arrows: a })} className={pick(r.arrows === a)}>
                <ArrowEndsIcon ends={a} />
              </button>
            ))}
          </div>
        </div>
      </Section>
    )
  }

  if (ref.kind === 'boundary') {
    const b = objects.boundaries[ref.id]
    if (!b) return null
    const set = (patch: Record<string, unknown>) => patchObject('boundary', b.id, patch)
    return (
      <Section title="Boundary">
        <TextField label="Label" value={b.label} max={80} onCommit={(v) => set({ label: v })} />
        <div className="flex items-center justify-between gap-2 text-sm">
          <span>Colour</span>
          <ColorPicker variant="swatch" label="Boundary colour" value={isHex(b.color) ? b.color : '#0f766e'} onChange={(v) => set({ color: v })} onClear={b.color ? () => set({ color: undefined }) : undefined} />
        </div>
        <Dashes value={b.lineStyle} onPick={(l) => set({ lineStyle: l })} />
        <div className="flex items-center justify-between gap-2 text-sm">
          <span>Shape</span>
          <div className="flex gap-1.5" role="group" aria-label="Boundary shape">
            {(['rounded', 'rect', 'ellipse'] as BoundaryShape[]).map((sh) => (
              <button key={sh} type="button" aria-pressed={b.shape === sh} aria-label={`Shape: ${sh}`} title={sh} onClick={() => set({ shape: sh })} className={pick(b.shape === sh)}>
                <ShapeIcon shape={sh} size={26} />
              </button>
            ))}
          </div>
        </div>
      </Section>
    )
  }

  if (ref.kind === 'callout') {
    const c = objects.callouts[ref.id]
    if (!c) return null
    return (
      <Section title="Callout">
        <TextField label="Text" value={c.text} max={400} multiline onCommit={(v) => patchObject('callout', c.id, { text: v })} />
      </Section>
    )
  }

  const sm = objects.summaries[ref.id]
  if (!sm) return null
  return (
    <Section title="Summary">
      <TextField label="Text" value={sm.text} max={400} multiline onCommit={(v) => patchObject('summary', sm.id, { text: v })} />
    </Section>
  )
}
