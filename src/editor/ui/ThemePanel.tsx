import { useEffect, useMemo, useRef, useState } from 'react'
import { SHAPES, type Shape } from '@/core/model/types'
import { exportTheme, importTheme, themeFromMap, ThemeImportError, uniqueThemeId } from '@/core/theme/custom'
import { MAX_BRANCH, MIN_BRANCH, NODE_MODES, type NodeMode, type Theme } from '@/core/theme/model'
import { COLOR_SCHEMES } from '@/core/theme/schemes'
import { FONT_OPTIONS, PATTERNS, THEMES, isBuiltinTheme, type Pattern } from '@/core/theme/themes'
import * as A from '../actions'
import { showNotice } from '../notice'
import { useTheme } from '../scene'
import { useEditor } from '../store'
import { themeRepository, useSavedThemes } from '../themeLibrary'
import { Check, Color, Row, Section, field } from './panelKit'
import { PopoverRow } from './PopoverRow'
import { LazyThemeThumb, ThemeThumb } from './ThemeThumb'

type GalleryTab = 'light' | 'dark' | 'custom'

/** Shows a theme on the canvas while the pointer or keyboard focus rests on it. A short delay avoids flicker when sweeping across the gallery. */
function useHoverPreview() {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return (make: () => Parameters<typeof A.setThemePreview>[0]) => ({
    onPointerEnter: () => {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => A.setThemePreview(make()), 60)
    },
    onPointerLeave: () => {
      clearTimeout(timer.current)
      A.setThemePreview(null)
    },
    onFocus: () => A.setThemePreview(make()),
    onBlur: () => {
      clearTimeout(timer.current)
      A.setThemePreview(null)
    },
  })
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL?.(url), 1000)
}

const small = 'rounded-ui border border-line px-2 py-1 text-xs hover:bg-bg'

function ThemeCard({ theme, active, onApply, preview, children }: { theme: Theme; active: boolean; onApply: () => void; preview: ReturnType<ReturnType<typeof useHoverPreview>>; children?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <button
        type="button"
        aria-pressed={active}
        aria-label={`${theme.name} theme${theme.dark ? ' (dark)' : ''}`}
        onClick={onApply}
        {...preview}
        className={`block w-full overflow-hidden rounded-ui border text-left ${active ? 'border-brand ring-2 ring-brand/40' : 'border-line hover:border-muted'}`}
      >
        <LazyThemeThumb theme={theme} />
        <div className="truncate bg-surface px-2 py-1 text-xs font-medium">{theme.name}</div>
      </button>
      {children}
    </div>
  )
}

function SchemeButton({ name, colors, active, onApply, preview }: { name: string; colors: string[]; active: boolean; onApply: () => void; preview: ReturnType<ReturnType<typeof useHoverPreview>> }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`${name} colour scheme`}
      title={name}
      onClick={onApply}
      {...preview}
      className={`flex flex-col gap-1 rounded-ui border p-1.5 text-left ${active ? 'border-brand ring-2 ring-brand/40' : 'border-line hover:border-muted'}`}
    >
      <span className="flex gap-0.5">
        {colors.slice(0, 8).map((c, i) => (
          <span key={i} className="h-3.5 flex-1 first:rounded-l last:rounded-r" style={{ background: c }} />
        ))}
      </span>
      <span className="truncate text-[11px]">{name}</span>
    </button>
  )
}

// ---- custom themes -----------------------------------------------------------------------------------------------

function ThemeEditor({ onDone }: { onDone: () => void }) {
  const settings = useEditor((s) => s.settings)
  const saved = useSavedThemes()
  const base = useTheme()
  const taken = useMemo(() => [...saved.map((t) => t.id), ...settings.customThemes.map((t) => t.id), ...THEMES.map((t) => t.id)], [saved, settings.customThemes])
  const [draft, setDraft] = useState<Theme>(() => themeFromMap(settings, `${base.name} (mine)`, uniqueThemeId(taken)))
  const set = (patch: Partial<Theme>) => setDraft({ ...draft, ...patch })
  const level = (k: keyof Theme['levels'], patch: Partial<Theme['levels'][typeof k]>) => setDraft({ ...draft, levels: { ...draft.levels, [k]: { ...draft.levels[k], ...patch } } })
  const shapeSelect = (value: Shape, onChange: (s: Shape) => void, label: string) => (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as Shape)} className={field}>
      {SHAPES.map((sh) => (
        <option key={sh} value={sh}>
          {sh === 'doubleCircle' ? 'double circle' : sh}
        </option>
      ))}
    </select>
  )
  const modeSelect = (value: NodeMode, onChange: (m: NodeMode) => void, label: string) => (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as NodeMode)} className={field}>
      {NODE_MODES.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </select>
  )
  const save = async () => {
    const theme: Theme = { ...draft, name: draft.name.trim() || 'My theme' }
    await themeRepository.save(theme)
    A.applyThemeData(theme)
    showNotice(`Saved “${theme.name}” to My themes.`)
    onDone()
  }
  return (
    <div className="space-y-2 rounded-ui border border-line p-3">
      <Row label="Name">
        <input value={draft.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} className={`${field} w-40`} />
      </Row>
      <Color label="Background" value={draft.bg} onChange={(v) => set({ bg: v })} />
      <Color label="Text" value={draft.text} onChange={(v) => set({ text: v })} />
      <Color label="Central topic" value={draft.levels.central.fillColor ?? '#1f2937'} onChange={(v) => level('central', { fillColor: v, textColor: null })} />
      <div>
        <div className="mb-1 text-sm">Branch colours</div>
        <div className="flex flex-wrap gap-1.5">
          {draft.palette.map((c, i) => (
            <input key={i} type="color" aria-label={`Branch colour ${i + 1}`} value={c} onChange={(e) => set({ palette: draft.palette.map((p, j) => (j === i ? e.target.value : p)) })} className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent p-0.5" />
          ))}
        </div>
      </div>
      <Row label="Central shape">{shapeSelect(draft.levels.central.shape, (shape) => level('central', { shape }), 'Central shape')}</Row>
      <Row label="Main topics">{modeSelect(draft.levels.main.fill, (fill) => level('main', { fill }), 'Main topic fill')}</Row>
      <Row label="Main shape">{shapeSelect(draft.levels.main.shape, (shape) => level('main', { shape }), 'Main shape')}</Row>
      <Row label="Sub topics">{modeSelect(draft.levels.sub.fill, (fill) => level('sub', { fill }), 'Sub topic fill')}</Row>
      <Row label="Sub shape">{shapeSelect(draft.levels.sub.shape, (shape) => level('sub', { shape }), 'Sub shape')}</Row>
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
        <button type="button" onClick={() => void save()} className="rounded-ui bg-brand px-3 py-1.5 text-sm font-medium text-brand-ink">
          Save as new theme
        </button>
        <button type="button" onClick={onDone} className={`${field} hover:bg-bg`}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function CustomTab({ apply, previewFor, activeId }: { apply: (t: Theme) => void; previewFor: ReturnType<typeof useHoverPreview>; activeId: string }) {
  const settings = useEditor((s) => s.settings)
  const theme = useTheme()
  const saved = useSavedThemes()
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const taken = useMemo(() => [...saved.map((t) => t.id), ...settings.customThemes.map((t) => t.id)], [saved, settings.customThemes])
  const inMapOnly = settings.customThemes.filter((t) => !saved.some((s) => s.id === t.id))

  const saveCurrent = async () => {
    const t = themeFromMap(settings, name.trim() || `${theme.name} (mine)`, uniqueThemeId(taken))
    await themeRepository.save(t)
    A.applyThemeData(t)
    setName('')
    showNotice(`Saved “${t.name}” to My themes.`)
  }
  const duplicate = async (t: Theme) => {
    await themeRepository.save({ ...t, id: uniqueThemeId(taken), name: `${t.name} copy`.slice(0, 60) })
  }
  const onImport = async (file: File | undefined) => {
    if (!file) return
    try {
      const t = importTheme(await file.text(), taken)
      await themeRepository.save(t)
      showNotice(`Imported “${t.name}” into My themes.`)
    } catch (e) {
      showNotice(e instanceof ThemeImportError ? e.message : 'That file could not be imported.')
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5 rounded-ui border border-line p-2.5">
        <div className="text-sm font-medium">Save this map's look as a theme</div>
        <div className="flex gap-1.5">
          <input aria-label="Theme name" value={name} maxLength={40} placeholder={`${theme.name} (mine)`} onChange={(e) => setName(e.target.value)} className={`${field} min-w-0 flex-1`} />
          <button type="button" onClick={() => void saveCurrent()} className="rounded-ui bg-brand px-3 py-1 text-sm font-medium text-brand-ink">
            Save
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={small} onClick={() => setEditing(!editing)} aria-expanded={editing}>
            Customise…
          </button>
          <button type="button" className={small} onClick={() => fileRef.current?.click()}>
            Import theme…
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" aria-label="Import theme file" className="hidden" onChange={(e) => void onImport(e.target.files?.[0]).then(() => (e.target.value = ''))} />
        </div>
      </div>
      {editing && <ThemeEditor onDone={() => setEditing(false)} />}

      <div>
        <div className="mb-1 text-xs text-muted">My themes</div>
        {saved.length === 0 ? (
          <p className="text-sm text-muted">Nothing saved yet. Save this map's look above, and it will be here for every map in this browser.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {saved.map((t) => (
              <ThemeCard key={t.id} theme={t} active={activeId === t.id} onApply={() => apply(t)} preview={previewFor(() => ({ theme: t }))}>
                {renaming?.id === t.id ? (
                  <input
                    aria-label={`New name for ${t.name}`}
                    autoFocus
                    value={renaming.name}
                    maxLength={40}
                    onChange={(e) => setRenaming({ id: t.id, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        void themeRepository.save({ ...t, name: renaming.name.trim() || t.name })
                        setRenaming(null)
                      } else if (e.key === 'Escape') setRenaming(null)
                    }}
                    onBlur={() => setRenaming(null)}
                    className={`${field} w-full`}
                  />
                ) : (
                  <div className="flex flex-wrap gap-1">
                    <button type="button" className={small} aria-label={`Rename ${t.name}`} onClick={() => setRenaming({ id: t.id, name: t.name })}>
                      Rename
                    </button>
                    <button type="button" className={small} aria-label={`Duplicate ${t.name}`} onClick={() => void duplicate(t)}>
                      Duplicate
                    </button>
                    <button type="button" className={small} aria-label={`Export ${t.name}`} onClick={() => download(`${t.name.replace(/[^\w -]+/g, '') || 'theme'}.wishtaa-theme.json`, exportTheme(t))}>
                      Export
                    </button>
                    <button type="button" className={`${small} text-bad`} aria-label={`Delete ${t.name}`} onClick={() => void themeRepository.remove(t.id)}>
                      Delete
                    </button>
                  </div>
                )}
              </ThemeCard>
            ))}
          </div>
        )}
      </div>

      {inMapOnly.length > 0 && (
        <div>
          <div className="mb-1 text-xs text-muted">Only in this map</div>
          <div className="grid grid-cols-2 gap-2">
            {inMapOnly.map((t) => (
              <ThemeCard key={t.id} theme={t} active={activeId === t.id} onApply={() => apply(t)} preview={previewFor(() => ({ theme: t }))}>
                <div className="flex flex-wrap gap-1">
                  <button type="button" className={small} aria-label={`Add ${t.name} to My themes`} onClick={() => void themeRepository.save(t)}>
                    Keep in My themes
                  </button>
                  <button type="button" className={`${small} text-bad`} aria-label={`Remove ${t.name} from this map`} onClick={() => A.removeMapTheme(t.id)}>
                    Remove
                  </button>
                </div>
              </ThemeCard>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---- the tab -----------------------------------------------------------------------------------------------------

export function ThemeTab({ compact = false }: { compact?: boolean } = {}) {
  const s = useEditor((st) => st.settings)
  const theme = useTheme()
  const active = s.themeId
  const [tab, setTab] = useState<GalleryTab>(() => (isBuiltinTheme(active) ? (THEMES.find((t) => t.id === active)?.dark ? 'dark' : 'light') : 'custom'))
  const [resetOverrides, setResetOverrides] = useState(false)
  const preview = useHoverPreview()
  const hasThickness = s.branchThickness !== null
  const [drag, setDrag] = useState<number | null>(null)
  const thickness = drag ?? s.branchThickness ?? theme.levels.main.branch.thickness

  const apply = (t: Theme) => (isBuiltinTheme(t.id) ? A.selectTheme(t.id, { resetOverrides }) : A.applyThemeData(t, { resetOverrides }))
  const list = THEMES.filter((t) => (tab === 'dark' ? t.dark : !t.dark))
  const commitThickness = () => {
    if (drag === null) return
    A.setBranchThickness(drag)
    setDrag(null)
  }
  const themeName = (s.customThemes.find((t) => t.id === active) ?? THEMES.find((t) => t.id === active))?.name ?? 'Theme'
  const schemeName = s.palette ? 'Custom colours' : COLOR_SCHEMES.find((c) => c.id === s.colorSchemeId)?.name ?? "Theme's own"
  const galleryBody = (after?: () => void) => (
    <>
      <div role="tablist" aria-label="Theme groups" className="flex gap-1">
          {(['light', 'dark', 'custom'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`flex-1 rounded-ui border px-2 py-1 text-sm capitalize ${tab === t ? 'border-brand bg-brand/15' : 'border-line hover:bg-bg'}`}>
              {t}
            </button>
          ))}
        </div>
        {tab !== 'custom' ? (
          <div role="tabpanel" aria-label={`${tab} themes`} className="grid grid-cols-2 gap-2">
            {list.map((t) => (
              <ThemeCard key={t.id} theme={t} active={active === t.id} onApply={() => { apply(t); after?.() }} preview={preview(() => ({ theme: t }))} />
            ))}
          </div>
        ) : (
          <div role="tabpanel" aria-label="Custom themes">
            <CustomTab apply={apply} previewFor={preview} activeId={active} />
          </div>
        )}
        <Check label="Also reset the style overrides I set on topics" checked={resetOverrides} onChange={setResetOverrides} hint="Applying a theme normally keeps the colours, shapes and fonts you set on individual topics" />
        <p className="text-xs text-muted">Applying a theme is one undo step. It also clears map-wide colour, background and branch tweaks.</p>
    </>
  )
  const schemeBody = (after?: () => void) => (
    <>
      <div className="grid grid-cols-2 gap-1.5">
          <SchemeButton name="Theme's own" colors={theme.schemeId || s.palette ? findOwn(s.themeId, s) : theme.palette} active={!s.colorSchemeId && !s.palette} onApply={() => { A.setColorScheme(null); after?.() }} preview={preview(() => ({ schemeId: null }))} />
          {COLOR_SCHEMES.map((c) => (
            <SchemeButton key={c.id} name={c.name} colors={c.colors} active={s.colorSchemeId === c.id} onApply={() => { A.setColorScheme(c.id); after?.() }} preview={preview(() => ({ schemeId: c.id }))} />
          ))}
        </div>
        <p className="text-xs text-muted">Main branches take these colours in order; sub-branches keep their parent's colour. Shapes don't change.</p>
    </>
  )

  const taperValue = s.taper === null ? 'theme' : s.taper ? 'on' : 'off'

  return (
    <>
      {compact ? (
        <Section title="Theme">
          <PopoverRow
            label="Theme"
            testId="theme-row"
            wide
            thumb={
              <span className="block w-16 overflow-hidden rounded border border-line">
                <ThemeThumb theme={theme} label="Current theme" />
              </span>
            }
            value={themeName}
          >
            {(close) => <div className="space-y-2">{galleryBody(close)}</div>}
          </PopoverRow>
          <PopoverRow
            label="Theme colour"
            testId="theme-colour-row"
            thumb={
              <span className="flex gap-0.5" aria-hidden="true">
                {theme.palette.slice(0, 5).map((c, i) => (
                  <span key={i} className="h-3 w-3 rounded-full border border-black/10" style={{ background: c }} />
                ))}
              </span>
            }
            value={schemeName}
          >
            {(close) => <div className="space-y-2">{schemeBody(close)}</div>}
          </PopoverRow>
        </Section>
      ) : (
        <>
          <Section title="Theme gallery">
            {galleryBody()}
          </Section>

          <Section title="Colour scheme">
            {schemeBody()}
          </Section>
        </>
      )}

      <Section title="Branches">
        <Check
          label="Automatic thickness"
          checked={!hasThickness}
          onChange={(v) => A.setBranchThickness(v ? null : Math.round(theme.levels.main.branch.thickness * 2) / 2)}
          hint="Bold near the centre and thinner outwards, worked out from how big each topic is"
        />
        <Row label={hasThickness || drag !== null ? `Thickness: ${Math.round(thickness * 10) / 10} px` : 'Thickness: automatic'}>
          <input
            type="range"
            aria-label="Branch thickness"
            min={MIN_BRANCH}
            max={MAX_BRANCH}
            step={0.5}
            value={thickness}
            onChange={(e) => {
              const v = Number(e.target.value)
              setDrag(v)
              A.setThemePreview({ branchThickness: v })
            }}
            onPointerUp={commitThickness}
            onKeyUp={commitThickness}
            onBlur={commitThickness}
            className="w-36 accent-[rgb(var(--c-brand))]"
          />
        </Row>
        <button type="button" onClick={() => A.resetBranchesToAuto('map')} className="text-xs text-muted hover:text-ink">
          Reset all branches to automatic
        </button>
        <Row label="Taper (thick to thin)">
          <select aria-label="Taper" value={taperValue} onChange={(e) => A.changeSetting('taper', e.target.value === 'theme' ? null : e.target.value === 'on')} className={field}>
            <option value="theme">Automatic (tapered)</option>
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </Row>
      </Section>

      <Section title="Colours and style">
        <Check label="Rainbow branch colours" checked={s.rainbow} onChange={(v) => A.changeSetting('rainbow', v)} />
        <Row label="Hand-drawn style">
          <select value={s.handDrawn === null ? 'theme' : s.handDrawn ? 'on' : 'off'} onChange={(e) => A.changeSetting('handDrawn', e.target.value === 'theme' ? null : e.target.value === 'on')} className={field}>
            <option value="theme">Follow theme</option>
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </Row>
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span>Custom branch colours</span>
            {s.palette && (
              <button type="button" onClick={() => A.changeSetting('palette', null)} className="text-xs text-muted hover:text-ink">
                Back to the scheme
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {theme.palette.map((c, i) => (
              <input key={i} type="color" aria-label={`Palette colour ${i + 1}`} value={c} onChange={(e) => A.changeSetting('palette', theme.palette.map((p, j) => (j === i ? e.target.value : p)))} className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent p-0.5" />
            ))}
          </div>
        </div>
      </Section>
      <Section title="Background">
        <Color label="Colour" value={theme.bg} onChange={(v) => A.changeSetting('background', { ...s.background, color: v })} onClear={s.background.color ? () => A.changeSetting('background', { ...s.background, color: null }) : undefined} />
        <Row label="Pattern">
          <select value={s.background.pattern ?? ''} onChange={(e) => A.changeSetting('background', { ...s.background, pattern: (e.target.value || null) as Pattern | null })} className={field}>
            <option value="">Theme default</option>
            {PATTERNS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Row>
      </Section>
    </>
  )
}

/** The theme's own palette, for the "Theme's own" button, whatever scheme is chosen. */
function findOwn(themeId: string, s: { customThemes: Theme[] }): string[] {
  return (s.customThemes.find((t) => t.id === themeId) ?? THEMES.find((t) => t.id === themeId) ?? (THEMES[0] as Theme)).palette
}

