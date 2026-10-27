import { Suspense, useMemo, useState } from 'react'
import { LAYOUTS, LAYOUT_GROUPS, layoutDef } from '@/core/layout/catalog'
import { BRANCH_DIRS, type BranchDir } from '@/core/model/topic'
import { SHAPES, type Shape } from '@/core/model/types'
import { MAX_SPACING, MIN_SPACING } from '@/core/settings'
import { isHex, readableText } from '@/core/theme/color'
import { resolveLook, type ResolvedTheme } from '@/core/theme/resolve'
import { FONT_OPTIONS, PATTERNS, THEMES, type NodeMode, type Pattern, type Theme } from '@/core/theme/themes'
import { Icon, LayoutThumb, LineIcon, ShapeIcon, type IconName } from '@/ui/icons'
import * as A from '../actions'
import { DetailsPanelLazy } from './lazyPanels'
import { MarkPanel } from './MarkPanel'
import { getScene, useScene, useTheme } from '../scene'
import { useEditor, type PanelTab } from '../store'

const field = 'rounded-ui border border-line bg-surface px-2 py-1 text-sm'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="shrink-0">{label}</span>
      {children}
    </label>
  )
}

function Check({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm" title={hint}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-brand))]" />
      <span>{label}</span>
    </label>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 border-b border-line px-4 py-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  )
}

function Color({ label, value, onChange, onClear }: { label: string; value: string; onChange: (v: string) => void; onClear?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span>{label}</span>
      <span className="flex items-center gap-1.5">
        <input aria-label={label} type="color" value={isHex(value) ? value : '#ffffff'} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent p-0.5" />
        {onClear && (
          <button type="button" onClick={onClear} className="rounded px-1.5 text-xs text-muted hover:text-ink" title="Back to the theme's colour">
            Auto
          </button>
        )}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------

function LayoutTab() {
  const s = useEditor((st) => st.settings)
  const selected = useEditor((st) => st.selected)
  const topics = useEditor((st) => st.topics)
  const rootId = useEditor((st) => st.rootId)
  const primary = selected[selected.length - 1]
  const topic = primary ? topics[primary] : undefined
  const def = layoutDef(s.layout)
  const moved = Object.values(topics).some((t) => t.offset)
  const spacingLabel = s.spacing < 0.85 ? 'Compact' : s.spacing > 1.25 ? 'Relaxed' : 'Normal'
  return (
    <>
      <Section title="Layout">
        {LAYOUT_GROUPS.map((g) => (
          <div key={g}>
            <div className="mb-1 text-xs text-muted">{g}</div>
            <div className="flex flex-wrap gap-1.5">
              {LAYOUTS.filter((l) => l.group === g).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={s.layout === l.id}
                  aria-label={`${g}: ${l.label}`}
                  title={l.label}
                  onClick={() => A.setLayout(l.id)}
                  className={`flex w-[76px] flex-col items-center gap-1 rounded-ui border px-1 py-1.5 text-[10px] leading-tight ${s.layout === l.id ? 'border-brand bg-brand/15 font-medium' : 'border-line hover:bg-bg'}`}
                >
                  <LayoutThumb id={l.id} size={54} />
                  <span className="line-clamp-2 text-center">{l.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </Section>
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
      <Section title="This branch">
        {topic && primary !== rootId ? (
          <Row label={`Layout inside “${topic.text.slice(0, 14) || 'topic'}”`}>
            <select
              value={topic.branchDir ?? ''}
              onChange={(e) => A.setSelectedBranchDir((e.target.value || null) as BranchDir | null)}
              className={field}
            >
              <option value="">Same as map</option>
              {BRANCH_DIRS.map((d) => (
                <option key={d} value={d}>
                  {{ right: 'Right', left: 'Left', down: 'Down', up: 'Up', stack: 'Outline (stacked)' }[d]}
                </option>
              ))}
            </select>
          </Row>
        ) : (
          <p className="text-sm text-muted">Select a topic (not the central one) to give its branch its own direction.</p>
        )}
      </Section>
    </>
  )
}

// ---------------------------------------------------------------------------------------------

function ThemeCard({ theme, active, onPick, onDelete }: { theme: Theme; active: boolean; onPick: () => void; onDelete?: () => void }) {
  return (
    <div className="relative">
      <button
        type="button"
        aria-pressed={active}
        aria-label={`${theme.name} theme`}
        onClick={onPick}
        className={`block w-full overflow-hidden rounded-ui border text-left ${active ? 'border-brand ring-2 ring-brand/40' : 'border-line hover:border-muted'}`}
      >
        <div className="flex h-12 items-center gap-1 px-2" style={{ background: theme.bg }}>
          <span className="h-4 w-8 rounded" style={{ background: theme.root.fill }} />
          {theme.palette.slice(0, 5).map((c, i) => (
            <span key={i} className="h-3 w-3 rounded-full" style={{ background: c }} />
          ))}
        </div>
        <div className="truncate bg-surface px-2 py-1 text-xs">{theme.name}</div>
      </button>
      {onDelete && (
        <button
          type="button"
          aria-label={`Delete theme ${theme.name}`}
          onClick={onDelete}
          className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-surface/90 text-xs shadow"
        >
          ×
        </button>
      )}
    </div>
  )
}

function ThemeEditor({ base }: { base: ResolvedTheme }) {
  const customThemes = useEditor((s) => s.settings.customThemes)
  const customIds = useMemo(() => customThemes.map((t) => t.id), [customThemes])
  const [draft, setDraft] = useState<Theme | null>(null)
  const start = () => {
    const { rainbow: _rainbow, ...theme } = base
    void _rainbow
    setDraft({ ...theme, name: customIds.includes(base.id) ? base.name : `${base.name} (mine)` })
  }
  if (!draft) {
    return (
      <button type="button" onClick={start} className={`${field} w-full hover:bg-bg`}>
        Edit this theme…
      </button>
    )
  }
  const set = (patch: Partial<Theme>) => setDraft({ ...draft, ...patch })
  const isCustom = customIds.includes(draft.id)
  const modes: NodeMode[] = ['solid', 'tint', 'outline', 'plain']
  const shapeSelect = (value: Shape, onChange: (s: Shape) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value as Shape)} className={field}>
      {SHAPES.map((sh) => (
        <option key={sh} value={sh}>
          {sh}
        </option>
      ))}
    </select>
  )
  const modeSelect = (value: NodeMode, onChange: (m: NodeMode) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value as NodeMode)} className={field}>
      {modes.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </select>
  )
  return (
    <div className="space-y-2 rounded-ui border border-line p-3">
      <Row label="Name">
        <input value={draft.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} className={`${field} w-40`} />
      </Row>
      <Color label="Background" value={draft.bg} onChange={(v) => set({ bg: v })} />
      <Color label="Text" value={draft.text} onChange={(v) => set({ text: v })} />
      <Color label="Central topic" value={draft.root.fill} onChange={(v) => set({ root: { ...draft.root, fill: v, text: readableText(v) } })} />
      <div>
        <div className="mb-1 text-sm">Branch colours</div>
        <div className="flex flex-wrap gap-1.5">
          {draft.palette.map((c, i) => (
            <input
              key={i}
              type="color"
              aria-label={`Branch colour ${i + 1}`}
              value={c}
              onChange={(e) => set({ palette: draft.palette.map((p, j) => (j === i ? e.target.value : p)) })}
              className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent p-0.5"
            />
          ))}
        </div>
      </div>
      <Row label="Central shape">{shapeSelect(draft.root.shape, (shape) => set({ root: { ...draft.root, shape } }))}</Row>
      <Row label="Main topics">{modeSelect(draft.l1.mode, (m) => set({ l1: { ...draft.l1, mode: m } }))}</Row>
      <Row label="Main shape">{shapeSelect(draft.l1.shape, (shape) => set({ l1: { ...draft.l1, shape } }))}</Row>
      <Row label="Sub topics">{modeSelect(draft.l2.mode, (m) => set({ l2: { ...draft.l2, mode: m } }))}</Row>
      <Row label="Sub shape">{shapeSelect(draft.l2.shape, (shape) => set({ l2: { ...draft.l2, shape } }))}</Row>
      <Row label="Line thickness">
        <input type="number" min={1} max={10} step={0.5} value={draft.lineWidth} onChange={(e) => set({ lineWidth: Math.min(10, Math.max(1, Number(e.target.value) || 3)) })} className={`${field} w-20`} />
      </Row>
      <Row label="Font">
        <select value={draft.font} onChange={(e) => set({ font: e.target.value })} className={field}>
          {FONT_OPTIONS.map((f) => (
            <option key={f.label} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Pattern">
        <select value={draft.pattern} onChange={(e) => set({ pattern: e.target.value as Pattern })} className={field}>
          {PATTERNS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Row>
      <Check label="Dark canvas" checked={draft.dark} onChange={(v) => set({ dark: v })} />
      <Check label="Hand-drawn" checked={draft.handDrawn} onChange={(v) => set({ handDrawn: v })} />
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            A.saveCustomTheme(draft, true)
            setDraft(null)
          }}
          className="rounded-ui bg-brand px-3 py-1.5 text-sm font-medium text-brand-ink"
        >
          Save as new theme
        </button>
        {isCustom && (
          <button
            type="button"
            onClick={() => {
              A.saveCustomTheme(draft, false)
              setDraft(null)
            }}
            className={`${field} hover:bg-bg`}
          >
            Update “{draft.name}”
          </button>
        )}
        <button type="button" onClick={() => setDraft(null)} className={`${field} hover:bg-bg`}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function ThemeTab() {
  const s = useEditor((st) => st.settings)
  const theme = useTheme()
  return (
    <>
      <Section title="Theme gallery">
        <div className="grid grid-cols-2 gap-2">
          {THEMES.map((t) => (
            <ThemeCard key={t.id} theme={t} active={s.themeId === t.id} onPick={() => A.selectTheme(t.id)} />
          ))}
        </div>
        {s.customThemes.length > 0 && (
          <>
            <div className="pt-2 text-xs text-muted">My themes</div>
            <div className="grid grid-cols-2 gap-2">
              {s.customThemes.map((t) => (
                <ThemeCard key={t.id} theme={t} active={s.themeId === t.id} onPick={() => A.selectTheme(t.id)} onDelete={() => A.deleteCustomTheme(t.id)} />
              ))}
            </div>
          </>
        )}
      </Section>
      <Section title="Colours and style">
        <Check label="Rainbow branch colours" checked={s.rainbow} onChange={(v) => A.changeSetting('rainbow', v)} />
        <Row label="Hand-drawn style">
          <select
            value={s.handDrawn === null ? 'theme' : s.handDrawn ? 'on' : 'off'}
            onChange={(e) => A.changeSetting('handDrawn', e.target.value === 'theme' ? null : e.target.value === 'on')}
            className={field}
          >
            <option value="theme">Follow theme</option>
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </Row>
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span>Palette</span>
            {s.palette && (
              <button type="button" onClick={() => A.changeSetting('palette', null)} className="text-xs text-muted hover:text-ink">
                Use theme palette
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {theme.palette.map((c, i) => (
              <input
                key={i}
                type="color"
                aria-label={`Palette colour ${i + 1}`}
                value={c}
                onChange={(e) => A.changeSetting('palette', theme.palette.map((p, j) => (j === i ? e.target.value : p)))}
                className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent p-0.5"
              />
            ))}
          </div>
        </div>
      </Section>
      <Section title="Background">
        <Color
          label="Colour"
          value={theme.bg}
          onChange={(v) => A.changeSetting('background', { ...s.background, color: v })}
          onClear={s.background.color ? () => A.changeSetting('background', { ...s.background, color: null }) : undefined}
        />
        <Row label="Pattern">
          <select
            value={s.background.pattern ?? ''}
            onChange={(e) => A.changeSetting('background', { ...s.background, pattern: (e.target.value || null) as Pattern | null })}
            className={field}
          >
            <option value="">Theme default</option>
            {PATTERNS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Row>
      </Section>
      <Section title="Theme editor">
        <ThemeEditor base={theme} />
      </Section>
    </>
  )
}

// ---------------------------------------------------------------------------------------------

function StyleTab() {
  const selected = useEditor((st) => st.selected)
  const topics = useEditor((st) => st.topics)
  const styleBranch = useEditor((st) => st.styleBranch)
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
  const num = (v: string) => (v === '' ? undefined : Number(v))
  return (
    <>
      <Section title={count > 1 ? `Topic style · ${count} topics` : 'Topic style'}>
        <Check label="Apply to the whole branch" checked={styleBranch} onChange={(v) => useEditor.setState({ styleBranch: v })} />
        <div className="space-y-1">
          <div className="text-sm">Shape</div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Shape">
            <button type="button" aria-pressed={!st.shape} aria-label="Shape from the theme" title="Follow the theme" onClick={() => A.styleSelected({ shape: undefined })} className={`grid h-9 w-9 place-items-center rounded-ui border ${!st.shape ? 'border-brand bg-brand/15' : 'border-line hover:bg-bg'}`}>
              <Icon name="theme" size={16} />
            </button>
            {SHAPES.map((sh) => (
              <button key={sh} type="button" aria-pressed={st.shape === sh} aria-label={`Shape: ${sh}`} title={sh} onClick={() => A.styleSelected({ shape: sh })} className={`grid h-9 w-11 place-items-center rounded-ui border ${st.shape === sh ? 'border-brand bg-brand/15' : 'border-line hover:bg-bg'}`}>
                <ShapeIcon shape={sh} size={26} />
              </button>
            ))}
          </div>
        </div>
        <Color label="Fill" value={look.fill === 'transparent' ? theme.bg : look.fill} onChange={(v) => A.styleSelected({ fill: v })} onClear={st.fill ? () => A.styleSelected({ fill: undefined }) : undefined} />
        <Color label="Border" value={look.border} onChange={(v) => A.styleSelected({ border: v })} onClear={st.border ? () => A.styleSelected({ border: undefined }) : undefined} />
        <Row label="Border width">
          <input type="number" min={0} max={8} value={st.borderWidth ?? ''} placeholder={String(look.borderWidth)} onChange={(e) => A.styleSelected({ borderWidth: num(e.target.value) })} className={`${field} w-20`} />
        </Row>
      </Section>
      <Section title="Text">
        <Row label="Font">
          <select value={st.fontFamily ?? ''} onChange={(e) => A.styleSelected({ fontFamily: e.target.value || undefined })} className={field}>
            <option value="">Theme default</option>
            {FONT_OPTIONS.map((f) => (
              <option key={f.label} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Size">
          <input type="number" min={8} max={72} value={st.fontSize ?? ''} placeholder={String(look.fontSize)} onChange={(e) => A.styleSelected({ fontSize: num(e.target.value) })} className={`${field} w-20`} />
        </Row>
        <Color label="Text colour" value={look.text} onChange={(v) => A.styleSelected({ textColor: v })} onClear={st.textColor ? () => A.styleSelected({ textColor: undefined }) : undefined} />
        <div className="flex gap-2">
          <button type="button" aria-pressed={look.fontWeight >= 700} onClick={() => A.styleSelected({ fontWeight: look.fontWeight >= 700 ? undefined : 700 })} className={`${field} font-bold ${look.fontWeight >= 700 ? 'border-brand bg-brand/15' : ''}`}>
            B
          </button>
          <button type="button" aria-pressed={look.italic} onClick={() => A.styleSelected({ italic: look.italic ? undefined : true })} className={`${field} italic ${look.italic ? 'border-brand bg-brand/15' : ''}`}>
            I
          </button>
        </div>
      </Section>
      <Section title="Line to parent">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span>Style</span>
          <div className="flex gap-1.5" role="group" aria-label="Line style">
            {(['solid', 'dashed', 'dotted'] as const).map((ls) => (
              <button key={ls} type="button" aria-pressed={(st.lineStyle ?? 'solid') === ls} aria-label={`Line: ${ls}`} title={ls} onClick={() => A.styleSelected({ lineStyle: ls === 'solid' ? undefined : ls })} className={`grid h-9 w-12 place-items-center rounded-ui border ${(st.lineStyle ?? 'solid') === ls ? 'border-brand bg-brand/15' : 'border-line hover:bg-bg'}`}>
                <LineIcon style={ls} />
              </button>
            ))}
          </div>
        </div>
        <Row label="Thickness">
          <input type="number" min={1} max={10} step={0.5} value={st.lineWidth ?? ''} placeholder="auto" onChange={(e) => A.styleSelected({ lineWidth: num(e.target.value) })} className={`${field} w-20`} />
        </Row>
      </Section>
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
    </>
  )
}

// ---------------------------------------------------------------------------------------------

const TABS: { id: PanelTab; label: string; icon: IconName }[] = [
  { id: 'layout', label: 'Layout', icon: 'layout' },
  { id: 'theme', label: 'Theme and background', icon: 'theme' },
  { id: 'style', label: 'Topic style', icon: 'style' },
  { id: 'mark', label: 'Marks', icon: 'mark' },
  { id: 'clipart', label: 'Clipart', icon: 'clipart' },
  { id: 'details', label: 'Details: picture, tags, task, link, formula, table', icon: 'details' },
  { id: 'notes', label: 'Notes', icon: 'notes' },
]

export function FormatPanel() {
  const tab = useEditor((s) => s.panelTab)
  return (
    <aside
      aria-label="Format panel"
      className="absolute inset-y-0 right-0 z-30 flex w-[min(340px,100%)] shrink-0 flex-col border-l border-line bg-surface shadow-xl md:static md:z-auto md:w-80 md:shadow-none"
    >
      <div className="flex items-center border-b border-line" role="tablist" aria-label="Format sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-label={t.label}
            title={t.label}
            onClick={() => useEditor.setState({ panelTab: t.id })}
            className={`grid flex-1 place-items-center py-2.5 ${tab === t.id ? 'border-b-2 border-brand text-ink' : 'text-muted hover:text-ink'}`}
          >
            <Icon name={t.icon} size={19} />
          </button>
        ))}
        <button type="button" aria-label="Close format panel" onClick={() => A.togglePanel()} className="px-3 py-2 text-muted hover:text-ink">
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" role="tabpanel">
        <Suspense fallback={<p className="p-4 text-sm text-muted">Loading…</p>}>
          {tab === 'layout' ? <LayoutTab /> : tab === 'theme' ? <ThemeTab /> : tab === 'style' ? <StyleTab /> : tab === 'mark' ? <MarkPanel /> : <DetailsPanelLazy tab={tab} />}
        </Suspense>
      </div>
    </aside>
  )
}
