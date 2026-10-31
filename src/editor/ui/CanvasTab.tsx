import { LAYOUTS, LAYOUT_GROUPS, layoutDef } from '@/core/layout/catalog'
import { MAX_SPACING, MIN_SPACING } from '@/core/settings'
import { LayoutThumb } from '@/ui/icons'
import * as A from '../actions'
import { useEditor } from '../store'
import { ChoiceDropdown, type ChoiceGroup } from './ChoiceDropdown'
import { Check, Row, Section, field } from './panelKit'
import { ThemeTab } from './ThemePanel'

/** Every layout the engine has, grouped under headings (a group with nothing in it is simply not listed). */
export const layoutGroups = (size = 36): ChoiceGroup[] =>
  LAYOUT_GROUPS.map((g) => ({
    heading: g,
    items: LAYOUTS.filter((l) => l.group === g).map((l) => ({ id: l.id, label: l.label, thumb: <LayoutThumb id={l.id} size={size} /> })),
  })).filter((g) => g.items.length > 0)

/** The map's layout as one compact row that opens a grouped list. Applying a layout is one undo step. */
export function LayoutRow() {
  const layout = useEditor((s) => s.settings.layout)
  return <ChoiceDropdown label="Layout" testId="layout-row" value={layout} groups={layoutGroups()} onPick={(id) => A.setLayout(id)} />
}

/**
 * The Canvas section: what applies to the whole map. Layout, theme and theme colour are one compact row each (a small picture
 * of the current choice) that open a list or gallery, so the panel stays short.
 */
export function CanvasTab() {
  const s = useEditor((st) => st.settings)
  const topics = useEditor((st) => st.topics)
  const def = layoutDef(s.layout)
  const moved = Object.values(topics).some((t) => t.offset)
  const spacingLabel = s.spacing < 0.85 ? 'Compact' : s.spacing > 1.25 ? 'Relaxed' : 'Normal'
  return (
    <>
      <Section title="Layout">
        <LayoutRow />
      </Section>
      <ThemeTab compact />
      <Section title="Spacing and lines">
        <Row label={`Topic spacing · ${spacingLabel}`}>
          <input
            type="range"
            aria-label="Topic spacing"
            min={MIN_SPACING}
            max={MAX_SPACING}
            step={0.1}
            value={s.spacing}
            onChange={(e) => A.changeSetting('spacing', Number(e.target.value))}
            className="w-32 accent-[rgb(var(--c-brand))]"
          />
        </Row>
        <Row label="Line style">
          <select
            value={s.connector}
            disabled={!def.usesConnectors}
            onChange={(e) => A.changeSetting('connector', e.target.value as typeof s.connector)}
            className={field}
            title={def.usesConnectors ? undefined : 'This layout draws its own lines'}
          >
            <option value="auto">Automatic</option>
            <option value="curve">Curved</option>
            <option value="elbow">Elbow</option>
            <option value="straight">Straight</option>
          </select>
        </Row>
        <Check label="Branch free positioning (drag a branch to leave it where you drop it)" checked={s.freePositioning} onChange={(v) => A.changeSetting('freePositioning', v)} />
        {s.freePositioning && moved && (
          <button type="button" onClick={A.resetBranchPositions} className={`${field} w-full hover:bg-bg`}>
            Reset moved branches
          </button>
        )}
        <Check label="Align with sibling topic (same width)" checked={s.alignSiblings} onChange={(v) => A.changeSetting('alignSiblings', v)} />
        <Check label="Topic overlap (pack tightly)" checked={s.overlap} onChange={(v) => A.changeSetting('overlap', v)} />
      </Section>
    </>
  )
}
