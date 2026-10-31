import type { BranchCurve, LineStyle, TopicStyle } from '@/core/model/types'
import { resolveLine } from '@/core/theme/resolve'
import { LineIcon } from '@/ui/icons'
import * as A from '../actions'
import { useScene, useTheme } from '../scene'
import { useEditor } from '../store'
import { Color, Row, field } from './panelKit'
import { Slider } from './Slider'

/** The choices for how a branch is drawn. "Tapered" is a curved branch that thins toward the topic. */
export const CURVE_CHOICES: { id: BranchCurve | 'tapered'; label: string }[] = [
  { id: 'auto', label: 'Automatic (map or theme)' },
  { id: 'curve', label: 'Curved' },
  { id: 'straight', label: 'Straight' },
  { id: 'elbow', label: 'Elbow' },
  { id: 'roundedElbow', label: 'Rounded elbow' },
  { id: 'tapered', label: 'Tapered' },
  { id: 'none', label: 'None (hide the branch)' },
]

/** What picking a curve choice changes on the topic's style. */
export function curvePatch(choice: BranchCurve | 'tapered'): Partial<TopicStyle> {
  if (choice === 'tapered') return { branchCurve: 'curve', taper: true }
  if (choice === 'auto') return { branchCurve: undefined, taper: undefined }
  return { branchCurve: choice, taper: false }
}

export const MAX_BRANCH_SLIDER = 20

/** Colour, thickness, curve, dash and arrow head of the branch leading to the selected topic. */
export function BranchControls() {
  const selected = useEditor((s) => s.selected)
  const topics = useEditor((s) => s.topics)
  const scope = useEditor((s) => s.branchScope)
  const theme = useTheme()
  const scene = useScene()
  const primary = selected[selected.length - 1]
  const topic = primary ? topics[primary] : undefined
  const box = primary ? scene.boxes.get(primary) : undefined

  if (!topic || !box || primary === scene.rootId) {
    return <p className="text-sm text-muted">Select a topic (not the central one) to style the branch that leads to it.</p>
  }
  const st = topic.style
  const line = resolveLine(theme, { depth: box.depth, branch: box.branch, style: st })
  const mode = A.branchMode()
  const set = (p: Partial<TopicStyle>) => A.commitStyle(p, mode)
  const curveValue = line.taper ? 'tapered' : (st.branchCurve ?? 'auto')

  return (
    <div className="space-y-2" role="group" aria-label="Branch">
      <div role="radiogroup" aria-label="Apply branch changes to" className="flex gap-1 text-xs">
        {(
          [
            ['this', 'This branch only'],
            ['branch', 'This branch and below'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="radio" aria-checked={scope === id} onClick={() => A.setBranchScope(id)} className={`flex-1 rounded-ui border px-2 py-1 ${scope === id ? 'border-brand bg-brand/15' : 'border-line hover:bg-bg'}`}>
            {label}
          </button>
        ))}
      </div>

      <Color
        label="Branch colour"
        value={line.color}
        onChange={(v) => set({ lineColor: v })}
        onClear={st.lineColor ? () => set({ lineColor: undefined }) : undefined}
        opacity={line.opacity}
        onOpacityPreview={(v) => A.previewStyle({ lineOpacity: v }, mode)}
        onOpacityCommit={(v) => set({ lineOpacity: v >= 1 ? undefined : v })}
      />

      <Slider label="Thickness" value={Math.min(MAX_BRANCH_SLIDER, Math.round(line.width * 2) / 2)} min={1} max={MAX_BRANCH_SLIDER} step={0.5} format={(v) => `${v} px`} onPreview={(v) => A.previewStyle({ lineWidth: v }, mode)} onCommit={(v) => set({ lineWidth: v })} />

      <Row label="Curve">
        <select aria-label="Branch curve" value={curveValue} onChange={(e) => set(curvePatch(e.target.value as BranchCurve | 'tapered'))} className={field}>
          {CURVE_CHOICES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </Row>

      <div className="flex items-center justify-between gap-2 text-sm">
        <span>Dash</span>
        <div className="flex gap-1.5" role="group" aria-label="Branch dash style">
          {(['solid', 'dashed', 'dotted'] as LineStyle[]).map((ls) => (
            <button key={ls} type="button" aria-pressed={line.style === ls} aria-label={`Branch: ${ls}`} title={ls} onClick={() => set({ lineStyle: ls === 'solid' ? undefined : ls })} className={`grid h-9 w-12 place-items-center rounded-ui border ${line.style === ls ? 'border-brand bg-brand/15' : 'border-line hover:bg-bg'}`}>
              <LineIcon style={ls} />
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={line.arrow} onChange={(e) => set({ lineArrow: e.target.checked ? true : undefined })} className="h-4 w-4 accent-[rgb(var(--c-brand))]" />
        Arrow head at the topic
      </label>
    </div>
  )
}
