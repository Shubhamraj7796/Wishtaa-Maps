import { BRANCH_DIRS, type BranchDir } from '@/core/model/topic'
import { isLargeText } from '@/core/theme/color'
import { resolveLook } from '@/core/theme/resolve'
import { FONT_OPTIONS } from '@/core/theme/themes'
import { Icon, LayoutThumb } from '@/ui/icons'
import * as A from '../actions'
import { BranchControls } from './BranchControls'
import { ChoiceDropdown } from './ChoiceDropdown'
import { Color, Row, Section, field } from './panelKit'
import { TopicSection } from './TopicStylePanel'
import { getScene, useScene, useTheme } from '../scene'
import { useEditor } from '../store'

// ---------------------------------------------------------------------------------------------

export function StyleTab() {
  const selected = useEditor((st) => st.selected)
  const topics = useEditor((st) => st.topics)
  const painter = useEditor((st) => st.painter)
  const copied = useEditor((st) => st.copiedFormat)
  const theme = useTheme()
  const scene = useScene()
  const primary = selected[selected.length - 1]
  const topic = primary ? topics[primary] : undefined
  const box = primary ? scene.boxes.get(primary) : undefined

  if (!topic || !box) {
    return (
      <Section title="Topic style">
        <p className="text-sm text-muted">Select a topic to change its shape, colours, font and line.</p>
      </Section>
    )
  }
  const st = topic.style
  const look = resolveLook(theme, { depth: box.depth, branch: box.branch, isRoot: primary === scene.rootId, style: st, layoutShape: getScene().layoutShape })
  const count = selected.length
  const hasRoot = selected.includes(scene.rootId)
  const num = (v: string) => (v === '' ? undefined : Number(v))
  return (
    <>
      <TopicSection style={st} look={look} count={count} />
      <Section title="Text">
        <Row label="Font">
          <select aria-label="Font" value={st.fontFamily ?? ''} onChange={(e) => A.styleSelected({ fontFamily: e.target.value || undefined })} className={field}>
            <option value="">Theme default</option>
            {FONT_OPTIONS.map((f) => (
              <option key={f.label} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Size">
          <span className="flex items-center gap-1">
            <button type="button" aria-label="Smaller text" title="Smaller text" onClick={() => A.nudgeFontSize(-2)} className={`${field} px-2 text-xs`}>
              A−
            </button>
            <input type="number" aria-label="Font size" min={8} max={72} value={st.fontSize ?? ''} placeholder={String(look.fontSize)} onChange={(e) => A.styleSelected({ fontSize: num(e.target.value) })} className={`${field} w-16`} />
            <button type="button" aria-label="Bigger text" title="Bigger text" onClick={() => A.nudgeFontSize(2)} className={`${field} px-2 text-sm`}>
              A+
            </button>
          </span>
        </Row>
        <Color
          label="Text colour"
          value={look.text}
          onChange={(v) => A.styleSelected({ textColor: v })}
          onClear={st.textColor ? () => A.styleSelected({ textColor: undefined }) : undefined}
          contrastAgainst={{ color: look.fill === 'transparent' ? theme.bg : look.fill, large: isLargeText(look.fontSize, look.fontWeight), what: 'on this topic’s fill' }}
        />
        <Color label="Highlight" value={look.highlight ?? 'transparent'} onChange={(v) => A.styleSelected({ highlight: v })} onNone={st.highlight ? () => A.styleSelected({ highlight: undefined }) : undefined} />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Text style">
          <button type="button" aria-pressed={look.fontWeight >= 700} aria-label="Bold" title="Bold" onClick={() => A.styleSelected({ fontWeight: look.fontWeight >= 700 ? undefined : 700 })} className={`${field} font-bold ${look.fontWeight >= 700 ? 'border-brand bg-brand/15' : ''}`}>
            B
          </button>
          <button type="button" aria-pressed={look.italic} aria-label="Italic" title="Italic" onClick={() => A.styleSelected({ italic: look.italic ? undefined : true })} className={`${field} italic ${look.italic ? 'border-brand bg-brand/15' : ''}`}>
            I
          </button>
          <button type="button" aria-pressed={look.underline} aria-label="Underline" title="Underline" onClick={() => A.styleSelected({ underline: look.underline ? undefined : true })} className={`${field} underline ${look.underline ? 'border-brand bg-brand/15' : ''}`}>
            U
          </button>
          <button type="button" aria-pressed={look.strike} aria-label="Strikethrough" title="Strikethrough" onClick={() => A.styleSelected({ strike: look.strike ? undefined : true })} className={`${field} line-through ${look.strike ? 'border-brand bg-brand/15' : ''}`}>
            S
          </button>
        </div>
        <div className="flex gap-1.5" role="radiogroup" aria-label="Text alignment">
          {(['left', 'center', 'right'] as const).map((al) => (
            <button key={al} type="button" role="radio" aria-checked={look.align === al} aria-label={`Align ${al}`} title={`Align ${al}`} onClick={() => A.styleSelected({ align: al === 'center' ? undefined : al })} className={`${field} flex-1 ${look.align === al ? 'border-brand bg-brand/15' : ''}`}>
              {al === 'left' ? '⇤' : al === 'center' ? '↔' : '⇥'}
            </button>
          ))}
        </div>
      </Section>
      {!hasRoot && (
        <Section title="Branch to parent">
          <BranchControls />
        </Section>
      )}
      <Section title="Format painter">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={A.copyFormat} aria-label="Copy format" title="Copy format (Ctrl+Alt+C)" className={`${field} flex items-center gap-1.5 hover:bg-bg`}>
            <Icon name="copy" size={15} /> Copy
          </button>
          <button type="button" onClick={A.pasteFormat} disabled={!copied} aria-label="Paste format" title="Paste format (Ctrl+Alt+V)" className={`${field} flex items-center gap-1.5 hover:bg-bg disabled:opacity-40`}>
            <Icon name="format" size={15} /> Paste
          </button>
          <button type="button" aria-pressed={!!painter} onClick={A.togglePainter} aria-label="Format painter" title="Format painter" className={`${field} flex items-center gap-1.5 ${painter ? 'border-brand bg-brand/15' : 'hover:bg-bg'}`}>
            <Icon name="painter" size={15} /> Painter
          </button>
          <button type="button" onClick={A.resetStyleSelected} aria-label="Reset style" title="Reset style" className={`${field} flex items-center gap-1.5 hover:bg-bg`}>
            <Icon name="reset" size={15} /> Reset
          </button>
        </div>
      </Section>
      {!hasRoot && (
        <Section title="Layout of this branch">
          <BranchLayoutRow />
        </Section>
      )}
    </>
  )
}

const BRANCH_LABEL: Record<BranchDir, string> = { right: 'Right', left: 'Left', down: 'Down', up: 'Up', stack: 'Outline (stacked)' }
const BRANCH_THUMB: Record<BranchDir, string> = { right: 'mindmap:right', left: 'mindmap:left', down: 'mindmap:down', up: 'mindmap:up', stack: 'tree:right' }

/** Per-branch direction (the layouts a single branch can have inside the map), as the same dropdown the map layout uses. */
export function BranchLayoutRow() {
  const selected = useEditor((st) => st.selected)
  const topics = useEditor((st) => st.topics)
  const rootId = useEditor((st) => st.rootId)
  const ids = selected.filter((id) => id !== rootId && topics[id])
  const dirs = new Set(ids.map((id) => topics[id]?.branchDir ?? ''))
  const value = dirs.size === 1 ? ([...dirs][0] as string) || 'same' : 'mixed'
  const items = [
    { id: 'same', label: 'Same as map', thumb: <Icon name="map" size={30} className="text-muted" /> },
    ...BRANCH_DIRS.map((d) => ({ id: d, label: BRANCH_LABEL[d], thumb: <LayoutThumb id={BRANCH_THUMB[d]} size={30} /> })),
    ...(value === 'mixed' ? [{ id: 'mixed', label: 'Mixed', thumb: <Icon name="details" size={30} className="text-muted" /> }] : []),
  ]
  if (!ids.length) return <p className="text-sm text-muted">Select a topic (not the central one) to give its branch its own layout.</p>
  return (
    <ChoiceDropdown
      label="Layout"
      testId="branch-layout-row"
      value={value}
      groups={[{ items }]}
      columns={3}
      onPick={(id) => {
        if (id === 'mixed') return
        A.setSelectedBranchDir(id === 'same' ? null : (id as BranchDir))
      }}
    />
  )
}
