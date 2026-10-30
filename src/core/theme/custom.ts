import type { MapSettings } from '../settings'
import { resolveTheme } from '../settings'
import { sanitizeTheme, THEME_FORMAT, LEVEL_KEYS, type Theme } from './model'

/** A new theme id that doesn't clash with `taken`. */
export function uniqueThemeId(taken: Iterable<string>): string {
  const used = new Set(taken)
  for (;;) {
    const id = `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    if (!used.has(id)) return id
  }
}

/**
 * A theme that draws exactly like this map does now: the chosen theme with the map's colour scheme or palette,
 * background, hand-drawn setting, branch thickness and taper built in.
 */
export function themeFromMap(settings: MapSettings, name: string, id: string): Theme {
  const r = resolveTheme(settings)
  const mainBase = r.levels.main.branch.thickness
  const scale = r.branchThickness !== null && mainBase > 0 ? r.branchThickness / mainBase : 1
  const levels = Object.fromEntries(
    LEVEL_KEYS.map((k) => {
      const l = r.levels[k]
      const t = Math.round(Math.min(20, Math.max(1, l.branch.thickness * scale)) * 100) / 100
      return [k, { ...l, branch: { ...l.branch, thickness: t, falloff: Math.round(l.branch.falloff * scale * 100) / 100, taper: r.taper ?? l.branch.taper } }]
    })
  ) as Theme['levels']
  return {
    version: THEME_FORMAT,
    id,
    name: name.trim().slice(0, 60) || 'My theme',
    dark: r.dark,
    bg: r.bg,
    pattern: r.pattern,
    text: r.text,
    palette: [...r.palette],
    font: r.font,
    handDrawn: r.handDrawn,
    levels,
  }
}

const EXPORT_KIND = 'wishtaa-theme'

/** A theme as a small JSON file. */
export function exportTheme(theme: Theme): string {
  return JSON.stringify({ kind: EXPORT_KIND, theme }, null, 2)
}

export class ThemeImportError extends Error {}

/** Reads a theme file (our export, or a bare theme). The theme gets a new id so it can't replace another one. */
export function importTheme(text: string, taken: Iterable<string> = []): Theme {
  if (text.length > 200_000) throw new ThemeImportError('That file is too large to be a theme.')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ThemeImportError('That is not a theme file.')
  }
  const body = typeof raw === 'object' && raw !== null && (raw as { kind?: unknown }).kind === EXPORT_KIND ? (raw as { theme: unknown }).theme : raw
  const theme = sanitizeTheme(body)
  if (!theme) throw new ThemeImportError('That file is not a usable theme.')
  return { ...theme, id: uniqueThemeId(taken) }
}

// ---- the user's own themes ----------------------------------------------------------------------------------------

/**
 * Where the user's custom themes live. Local browser storage now; Google Drive or our cloud can implement the same
 * interface later without any screen changing.
 */
export interface ThemeRepository {
  list(): Promise<Theme[]>
  save(theme: Theme): Promise<void>
  remove(id: string): Promise<void>
  /** Called after any change. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void
}

export const MAX_SAVED_THEMES = 100
export const THEMES_KEY = 'wishtaamaps:themes'

export class LocalThemeRepository implements ThemeRepository {
  private listeners = new Set<() => void>()
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = typeof localStorage === 'undefined' ? undefined : safe()) {}

  private read(): Theme[] {
    try {
      const raw = this.storage?.getItem(THEMES_KEY)
      const v: unknown = raw ? JSON.parse(raw) : []
      return Array.isArray(v) ? v.map(sanitizeTheme).filter((t): t is Theme => !!t).slice(0, MAX_SAVED_THEMES) : []
    } catch {
      return []
    }
  }

  private write(themes: Theme[]) {
    try {
      this.storage?.setItem(THEMES_KEY, JSON.stringify(themes))
    } catch {
      throw new Error('This browser could not store the theme.')
    }
    this.listeners.forEach((l) => l())
  }

  async list() {
    return this.read()
  }
  async save(theme: Theme) {
    const all = this.read()
    const i = all.findIndex((t) => t.id === theme.id)
    if (i >= 0) all[i] = theme
    else all.push(theme)
    this.write(all.slice(-MAX_SAVED_THEMES))
  }
  async remove(id: string) {
    this.write(this.read().filter((t) => t.id !== id))
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }
}

function safe(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    return localStorage
  } catch {
    return undefined
  }
}
