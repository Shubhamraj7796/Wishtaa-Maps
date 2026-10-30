import { LOCAL, type MapDoc } from '../model/doc'
import { MAX_CUSTOM_THEMES, type MapSettings } from '../settings'
import { isBuiltinTheme, type Theme } from './themes'

/** Map-wide appearance tweaks. Picking a theme starts fresh from that theme, so these are cleared. */
export const MAP_OVERRIDE_KEYS = ['palette', 'colorSchemeId', 'branchThickness', 'taper', 'background', 'handDrawn'] as const

const hasOverrides = (style: object | undefined) => !!style && Object.keys(style).length > 0

/**
 * Applies a theme to the map as ONE undo step. A theme that isn't built in is stored inside the map file (so the map
 * keeps its own theme wherever it goes). Map-wide tweaks are cleared; topics keep their own overrides unless
 * `resetOverrides` is set ("Apply theme and reset overrides").
 */
export function applyTheme(doc: MapDoc, theme: Theme, opts: { resetOverrides?: boolean } = {}) {
  doc.ydoc.transact(() => {
    if (!isBuiltinTheme(theme.id)) {
      const cur = Array.isArray(doc.settings.get('customThemes')) ? (doc.settings.get('customThemes') as Theme[]) : []
      doc.settings.set('customThemes', [...cur.filter((t) => t.id !== theme.id), theme].slice(-MAX_CUSTOM_THEMES))
    }
    doc.settings.set('themeId', theme.id)
    for (const k of MAP_OVERRIDE_KEYS) doc.settings.delete(k)
    if (opts.resetOverrides) {
      doc.topics.forEach((t, id) => {
        if (hasOverrides(t.style)) doc.topics.set(id, { ...t, style: {} })
      })
    }
  }, LOCAL)
}

/** Sets the colour scheme (or, with null, goes back to the theme's own colours). Colours only: shapes don't change. One undo step. */
export function applyColorScheme(doc: MapDoc, schemeId: string | null) {
  doc.ydoc.transact(() => {
    if (schemeId) doc.settings.set('colorSchemeId', schemeId)
    else doc.settings.delete('colorSchemeId')
    doc.settings.delete('palette')
  }, LOCAL)
}

/** What the canvas shows while the pointer rests on a gallery item. Nothing is saved and there is no undo step. */
export interface ThemePreview {
  /** A theme (built in, or the full theme for one from the user's library). */
  theme?: Theme
  /** A colour scheme id, or null for the theme's own colours. */
  schemeId?: string | null
  /** Branch thickness in px, or null for the theme's (shown live while the slider is dragged). */
  branchThickness?: number | null
}

/** The settings to draw with while previewing: what applying it would give, without changing the map. */
export function previewSettings(s: MapSettings, p: ThemePreview): MapSettings {
  let out = s
  if (p.theme) {
    const t = p.theme
    out = {
      ...out,
      themeId: t.id,
      customThemes: isBuiltinTheme(t.id) ? out.customThemes : [...out.customThemes.filter((x) => x.id !== t.id), t],
      palette: null,
      colorSchemeId: null,
      branchThickness: null,
      taper: null,
      background: { color: null, pattern: null },
      handDrawn: null,
    }
  }
  if (p.schemeId !== undefined) out = { ...out, colorSchemeId: p.schemeId, palette: null }
  if (p.branchThickness !== undefined) out = { ...out, branchThickness: p.branchThickness }
  return out
}
