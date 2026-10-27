import type { ArrowEnds, BoundaryShape } from '@/core/model/objects'
import type { LineStyle } from '@/core/model/types'
import { isHex } from '@/core/theme/color'
import { ArrowEndsIcon, Icon, LineIcon, ShapeIcon } from '@/ui/icons'
import { deleteSelectedObject, editObject, patchObject, selectObject } from '../content'
import { useEditor } from '../store'

const btn = 'grid h-9 min-w-9 place-items-center rounded-ui border px-1.5 transition-colors'
const on = 'border-brand bg-brand/15'
const off = 'border-transparent hover:bg-bg'

function Sep() {
  return <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
}

/** Floating tools for the selected relationship, callout, boundary or summary. */
export function ObjectBar() {
  const ref = useEditor((s) => s.selectedObject)
  const objects = useEditor((s) => s.objects)
  if (!ref) return null

  const common = (
    <>
      <button type="button" aria-label="Edit the text" title="Edit the text" onClick={() => editObject(ref)} className={`${btn} ${off}`}>
        <Icon name="edit" size={17} />
      </button>
      <button type="button" aria-label="Delete" title="Delete (Delete key)" onClick={() => deleteSelectedObject()} className={`${btn} ${off} text-bad`}>
        <Icon name="trash" size={17} />
      </button>
      <button type="button" aria-label="Done" title="Done (Esc)" onClick={() => selectObject(null)} className={`${btn} ${off}`}>
        <Icon name="close" size={17} />
      </button>
    </>
  )

  let tools: React.ReactNode = null
  if (ref.kind === 'relationship') {
    const r = objects.relationships[ref.id]
    if (!r) return null
    tools = (
      <>
        <div className="flex gap-0.5" role="group" aria-label="Arrow heads">
          {(['end', 'both', 'start', 'none'] as ArrowEnds[]).map((a) => (
            <button key={a} type="button" aria-pressed={r.arrows === a} aria-label={`Arrows: ${a === 'end' ? 'at the end' : a === 'start' ? 'at the start' : a}`} title={`Arrows: ${a}`} onClick={() => patchObject('relationship', r.id, { arrows: a })} className={`${btn} ${r.arrows === a ? on : off}`}>
              <ArrowEndsIcon ends={a} />
            </button>
          ))}
        </div>
        <Sep />
        <div className="flex gap-0.5" role="group" aria-label="Line style">
          {(['solid', 'dashed', 'dotted'] as LineStyle[]).map((l) => (
            <button key={l} type="button" aria-pressed={(r.lineStyle ?? 'solid') === l} aria-label={`Line: ${l}`} title={l} onClick={() => patchObject('relationship', r.id, { lineStyle: l })} className={`${btn} ${(r.lineStyle ?? 'solid') === l ? on : off}`}>
              <LineIcon style={l} />
            </button>
          ))}
        </div>
        <Sep />
        <div className="flex gap-0.5" role="group" aria-label="Line thickness">
          {[1.5, 2.4, 4].map((w) => (
            <button key={w} type="button" aria-pressed={(r.width ?? 2.4) === w} aria-label={`Thickness ${w}`} title={`Thickness ${w}`} onClick={() => patchObject('relationship', r.id, { width: w })} className={`${btn} ${(r.width ?? 2.4) === w ? on : off}`}>
              <span className="block w-5 rounded-full bg-current" style={{ height: w }} />
            </button>
          ))}
        </div>
        <Sep />
        <input type="color" aria-label="Line colour" title="Line colour" value={isHex(r.color) ? r.color : '#e11d48'} onChange={(e) => patchObject('relationship', r.id, { color: e.target.value })} className="h-8 w-9 cursor-pointer rounded border border-line bg-transparent p-0.5" />
        <Sep />
      </>
    )
  } else if (ref.kind === 'boundary') {
    const b = objects.boundaries[ref.id]
    if (!b) return null
    tools = (
      <>
        <div className="flex gap-0.5" role="group" aria-label="Boundary shape">
          {(['rounded', 'rect', 'ellipse'] as BoundaryShape[]).map((s) => (
            <button key={s} type="button" aria-pressed={b.shape === s} aria-label={`Shape: ${s}`} title={s} onClick={() => patchObject('boundary', b.id, { shape: s })} className={`${btn} ${b.shape === s ? on : off}`}>
              <ShapeIcon shape={s} size={26} />
            </button>
          ))}
        </div>
        <Sep />
        <div className="flex gap-0.5" role="group" aria-label="Line style">
          {(['solid', 'dashed', 'dotted'] as LineStyle[]).map((l) => (
            <button key={l} type="button" aria-pressed={b.lineStyle === l} aria-label={`Line: ${l}`} title={l} onClick={() => patchObject('boundary', b.id, { lineStyle: l })} className={`${btn} ${b.lineStyle === l ? on : off}`}>
              <LineIcon style={l} />
            </button>
          ))}
        </div>
        <Sep />
        <input type="color" aria-label="Boundary colour" title="Boundary colour" value={isHex(b.color) ? b.color : '#0f766e'} onChange={(e) => patchObject('boundary', b.id, { color: e.target.value })} className="h-8 w-9 cursor-pointer rounded border border-line bg-transparent p-0.5" />
        <Sep />
      </>
    )
  } else if (ref.kind === 'callout') {
    if (!objects.callouts[ref.id]) return null
  } else if (!objects.summaries[ref.id]) return null

  const names = { relationship: 'Relationship', callout: 'Callout', boundary: 'Boundary', summary: 'Summary' }
  return (
    <div role="toolbar" aria-label={`${names[ref.kind]} tools`} className="absolute left-1/2 top-3 z-20 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center overflow-x-auto rounded-ui border border-line bg-surface px-1.5 py-1 shadow-lg" onPointerDown={(e) => e.stopPropagation()}>
      <span className="mr-1 flex items-center gap-1 px-1.5 text-xs text-muted">
        <Icon name={ref.kind === 'relationship' ? 'relationship' : ref.kind === 'callout' ? 'callout' : ref.kind === 'boundary' ? 'boundary' : 'summary'} size={16} />
        <span className="hidden sm:inline">{names[ref.kind]}</span>
      </span>
      <Sep />
      {tools}
      {common}
    </div>
  )
}
