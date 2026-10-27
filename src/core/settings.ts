import type { MapDoc } from './model/doc'
import { LOCAL } from './model/doc'
import { SHAPES, type Shape } from './model/types'
import { DEFAULT_LAYOUT, isLayoutId } from './layout/catalog'
import type { ConnectorChoice } from './layout/types'
import { isHex } from './theme/color'
import type { ResolvedTheme } from './theme/resolve'
import { DEFAULT_THEME_ID, PATTERNS, findTheme, type NodeMode, type Pattern, type Theme } from './theme/themes'

/** Map-wide settings, stored in the document so they save, sync and undo like everything else. */
export interface MapSettings {
  layout: string
  connector: ConnectorChoice
  spacing: number
  overlap: boolean
  alignSiblings: boolean
  freePositioning: boolean
  themeId: string
  rainbow: boolean
  /** Forces the hand-drawn look on top of any theme (null = follow the theme). */
  handDrawn: boolean | null
  background: { color: string | null; pattern: Pattern | null }
  /** Custom branch colours (null = the theme's own). */
  palette: string[] | null
  customThemes: Theme[]
  /** Number branches 1, 1.1, 1.1.1 ... */
  numbering: boolean
  /** Colour chosen for each tag name (tags without one get a colour from the palette). */
  tagColors: Record<string, string>
}

export const MIN_SPACING = 0.6
export const MAX_SPACING = 1.8
export const MAX_CUSTOM_THEMES = 20

export const DEFAULT_SETTINGS: MapSettings = {
  layout: DEFAULT_LAYOUT,
  connector: 'auto',
  spacing: 1,
  overlap: false,
  alignSiblings: false,
  freePositioning: false,
  themeId: DEFAULT_THEME_ID,
  rainbow: true,
  handDrawn: null,
  background: { color: null, pattern: null },
  palette: null,
  customThemes: [],
  numbering: false,
  tagColors: {},
}

const MODES: NodeMode[] = ['solid', 'tint', 'outline', 'plain']
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, max = 80) => (typeof v === 'string' && v.length <= max ? v : null)

function shape(v: unknown, fallback: Shape): Shape {
  return SHAPES.includes(v as Shape) ? (v as Shape) : fallback
}
function mode(v: unknown, fallback: NodeMode): NodeMode {
  return MODES.includes(v as NodeMode) ? (v as NodeMode) : fallback
}

/** Validates a theme coming from saved data, so a corrupt or hostile file can't break rendering. */
export function sanitizeTheme(raw: unknown): Theme | null {
  if (!isObj(raw)) return null
  const id = str(raw.id, 60)
  const name = str(raw.name, 60)
  const palette = Array.isArray(raw.palette) ? raw.palette.filter(isHex).slice(0, 12) : []
  const root = isObj(raw.root) ? raw.root : {}
  const l1 = isObj(raw.l1) ? raw.l1 : {}
  const l2 = isObj(raw.l2) ? raw.l2 : {}
  if (!id || !name || !isHex(raw.bg) || !isHex(raw.text) || palette.length < 1 || !isHex(root.fill) || !isHex(root.text)) return null
  const lineWidth = typeof raw.lineWidth === 'number' ? Math.min(10, Math.max(1, raw.lineWidth)) : 3
  const font = str(raw.font, 200)
  return {
    id,
    name,
    dark: !!raw.dark,
    bg: raw.bg,
    pattern: PATTERNS.includes(raw.pattern as Pattern) ? (raw.pattern as Pattern) : 'none',
    text: raw.text,
    palette,
    root: { fill: root.fill, text: root.text, shape: shape(root.shape, 'rounded') },
    l1: { mode: mode(l1.mode, 'solid'), shape: shape(l1.shape, 'rounded') },
    l2: { mode: mode(l2.mode, 'tint'), shape: shape(l2.shape, 'rounded') },
    lineWidth,
    font: font && !/[;{}<>]/.test(font) ? font : "Inter, system-ui, 'Segoe UI', sans-serif",
    handDrawn: !!raw.handDrawn,
  }
}

function sanitizeTagColors(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!isObj(raw)) return out
  for (const [k, v] of Object.entries(raw).slice(0, 200)) if (k.length <= 30 && isHex(v)) out[k] = v
  return out
}

/** Colour of a tag: the one the user picked, otherwise a stable one from the palette. */
export function tagColor(name: string, settings: Pick<MapSettings, 'tagColors'>, palette: readonly string[]): string {
  const chosen = settings.tagColors[name]
  if (chosen) return chosen
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return palette.length ? (palette[Math.abs(h) % palette.length] as string) : '#0f766e'
}

/** Reads settings from the stored values, falling back to defaults for anything missing or invalid. */
export function readSettings(raw: Record<string, unknown>): MapSettings {
  const d = DEFAULT_SETTINGS
  const bg = isObj(raw.background) ? raw.background : {}
  const customThemes = Array.isArray(raw.customThemes)
    ? raw.customThemes.map(sanitizeTheme).filter((t): t is Theme => !!t).slice(0, MAX_CUSTOM_THEMES)
    : []
  const palette = Array.isArray(raw.palette) ? raw.palette.filter(isHex).slice(0, 12) : []
  return {
    layout: isLayoutId(raw.layout) ? raw.layout : d.layout,
    connector: raw.connector === 'curve' || raw.connector === 'elbow' || raw.connector === 'straight' ? raw.connector : 'auto',
    spacing: typeof raw.spacing === 'number' ? Math.min(MAX_SPACING, Math.max(MIN_SPACING, raw.spacing)) : d.spacing,
    overlap: raw.overlap === true,
    alignSiblings: raw.alignSiblings === true,
    freePositioning: raw.freePositioning === true,
    themeId: typeof raw.themeId === 'string' ? raw.themeId : d.themeId,
    rainbow: raw.rainbow !== false,
    handDrawn: typeof raw.handDrawn === 'boolean' ? raw.handDrawn : null,
    background: {
      color: isHex(bg.color) ? bg.color : null,
      pattern: PATTERNS.includes(bg.pattern as Pattern) ? (bg.pattern as Pattern) : null,
    },
    palette: palette.length ? palette : null,
    customThemes,
    numbering: raw.numbering === true,
    tagColors: sanitizeTagColors(raw.tagColors),
  }
}

export function snapshotSettings(doc: MapDoc): MapSettings {
  const raw: Record<string, unknown> = {}
  doc.settings.forEach((v, k) => {
    raw[k] = v
  })
  return readSettings(raw)
}

/** Changes one setting. One undo step. */
export function setSetting<K extends keyof MapSettings>(doc: MapDoc, key: K, value: MapSettings[K]) {
  doc.ydoc.transact(() => doc.settings.set(key, value), LOCAL)
}

/** The theme to draw with: the chosen theme with the map's overrides (palette, background, hand-drawn) applied. */
export function resolveTheme(s: MapSettings): ResolvedTheme {
  const base = findTheme(s.themeId, s.customThemes)
  return {
    ...base,
    palette: s.palette && s.palette.length ? s.palette : base.palette,
    bg: s.background.color ?? base.bg,
    pattern: s.background.pattern ?? base.pattern,
    handDrawn: s.handDrawn ?? base.handDrawn,
    rainbow: s.rainbow,
  }
}
