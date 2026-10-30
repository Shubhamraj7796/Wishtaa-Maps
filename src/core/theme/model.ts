import { SHAPES, type BranchCurve, type LineStyle, type Shape } from '../model/types'

export type { BranchCurve }
import { isHex, readableText } from './color'

/**
 * The theme data model (format version 2).
 *
 * A theme is plain data (JSON): a canvas (background, pattern, text colour, fonts, default branch colours) and, for each
 * of four levels (central topic, main topics, sub topics, deeper topics), how topics look and how the branch leading to
 * them is drawn. A map picks a theme (`themeId`) and, separately, a colour scheme (`colorSchemeId`); main branches take
 * their colours from the scheme in order and sub-branches inherit their parent branch's colour.
 *
 * How a topic is finally drawn, strongest first:
 *   1. the topic's own overrides  (`TopicStyle`, stored on the topic; undefined or null means "inherit")
 *   2. the map's overrides        (palette / colour scheme, background, hand-drawn, branch thickness, taper)
 *   3. the theme's level          (`levels.central | main | sub | deeper`)
 *   4. built-in defaults
 */
export const THEME_FORMAT = 2

export type LevelKey = 'central' | 'main' | 'sub' | 'deeper'
export const LEVEL_KEYS: LevelKey[] = ['central', 'main', 'sub', 'deeper']

/** How a topic is filled: a solid block of the branch colour, a light tint with a coloured border, outline only, or text only. */
export type NodeMode = 'solid' | 'tint' | 'outline' | 'plain'
export const NODE_MODES: NodeMode[] = ['solid', 'tint', 'outline', 'plain']

export type Pattern = 'none' | 'dots' | 'grid' | 'lines' | 'cross'
export const PATTERNS: Pattern[] = ['none', 'dots', 'grid', 'lines', 'cross']

export const BRANCH_CURVES: BranchCurve[] = ['auto', 'curve', 'straight', 'elbow', 'roundedElbow', 'none']

export interface BranchStyle {
  curve: BranchCurve
  /** Thickness (px) of the branch leading to a topic of this level, at the parent end. */
  thickness: number
  /** Thick at the parent end, thinner toward the topic. */
  taper: boolean
  /** `deeper` only: how much thinner each further level gets (never below 1.5 px unless the thickness itself is lower). */
  falloff: number
  dash: LineStyle
}

export interface LevelStyle {
  shape: Shape
  /** Corner radius for rounded shapes (px); null = the shape's own. */
  cornerRadius: number | null
  fill: NodeMode
  /** The fill colour of a solid central topic; other levels take their branch colour. */
  fillColor: string | null
  borderWidth: number
  /** null = the theme's font. */
  fontFamily: string | null
  fontSize: number
  fontWeight: number
  /** null = chosen automatically so the text is readable on the fill. */
  textColor: string | null
  branch: BranchStyle
}

export interface Theme {
  version: 2
  id: string
  name: string
  /** Dark canvas: text on tinted/outlined topics is light. */
  dark: boolean
  bg: string
  pattern: Pattern
  /** Text colour on tinted, outlined and plain topics. */
  text: string
  /** The theme's own branch colours (its default colour scheme). */
  palette: string[]
  font: string
  handDrawn: boolean
  levels: Record<LevelKey, LevelStyle>
}

export const SANS = "Inter, system-ui, 'Segoe UI', sans-serif"

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, max = 80) => (typeof v === 'string' && v.length <= max ? v : null)
const num = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback)
const pick = <T extends string>(v: unknown, all: readonly T[], fallback: T): T => (all.includes(v as T) ? (v as T) : fallback)
const LINE_STYLES: LineStyle[] = ['solid', 'dashed', 'dotted']

export const MIN_BRANCH = 1
export const MAX_BRANCH = 20

function sanitizeBranch(raw: unknown, fallback: BranchStyle): BranchStyle {
  const b = isObj(raw) ? raw : {}
  return {
    curve: pick(b.curve, BRANCH_CURVES, fallback.curve),
    thickness: num(b.thickness, MIN_BRANCH, MAX_BRANCH, fallback.thickness),
    taper: typeof b.taper === 'boolean' ? b.taper : fallback.taper,
    falloff: num(b.falloff, 0, 5, fallback.falloff),
    dash: pick(b.dash, LINE_STYLES, fallback.dash),
  }
}

export const DEFAULT_BRANCH: BranchStyle = { curve: 'auto', thickness: 2.4, taper: false, falloff: 0.6, dash: 'solid' }

export function defaultLevel(key: LevelKey): LevelStyle {
  const central = key === 'central'
  return {
    shape: 'rounded',
    cornerRadius: null,
    fill: central ? 'solid' : key === 'main' ? 'solid' : 'tint',
    fillColor: central ? '#1f2937' : null,
    borderWidth: 2,
    fontFamily: null,
    fontSize: central ? 17 : 14,
    fontWeight: key === 'sub' || key === 'deeper' ? 500 : 600,
    textColor: central ? '#ffffff' : null,
    branch: { ...DEFAULT_BRANCH },
  }
}

function sanitizeLevel(raw: unknown, key: LevelKey, base: LevelStyle = defaultLevel(key)): LevelStyle {
  const l = isObj(raw) ? raw : {}
  return {
    shape: pick(l.shape, SHAPES, base.shape),
    cornerRadius: l.cornerRadius === null ? null : typeof l.cornerRadius === 'number' ? num(l.cornerRadius, 0, 60, 0) : base.cornerRadius,
    fill: pick(l.fill, NODE_MODES, base.fill),
    fillColor: l.fillColor === null ? null : isHex(l.fillColor) ? l.fillColor : base.fillColor,
    borderWidth: num(l.borderWidth, 0, 10, base.borderWidth),
    fontFamily: l.fontFamily === null ? null : (() => {
      const f = str(l.fontFamily, 200)
      return f && !/[;{}<>]/.test(f) ? f : base.fontFamily
    })(),
    fontSize: num(l.fontSize, 8, 72, base.fontSize),
    fontWeight: num(l.fontWeight, 100, 900, base.fontWeight),
    textColor: l.textColor === null ? null : isHex(l.textColor) ? l.textColor : base.textColor,
    branch: sanitizeBranch(l.branch, base.branch),
  }
}

// ---- the old format (version 1) -------------------------------------------------------------------------------------

/** Maps saved before the rework used this shape: three levels and one line width. */
interface ThemeV1 {
  id: string
  name: string
  dark: boolean
  bg: string
  pattern: Pattern
  text: string
  palette: string[]
  root: { fill: string; text: string; shape: Shape }
  l1: { mode: NodeMode; shape: Shape }
  l2: { mode: NodeMode; shape: Shape }
  lineWidth: number
  font: string
  handDrawn: boolean
}

/**
 * Converts a version 1 theme so it draws exactly as before: the old rules (a branch to depth d is
 * `max(1.5, lineWidth - 0.6 d)` thick, sub and deeper topics share one look) become per-level values.
 */
export function migrateV1Theme(v1: ThemeV1): Theme {
  const t = (depth: number) => Math.max(1.5, v1.lineWidth - 0.6 * depth)
  const branch = (thickness: number): BranchStyle => ({ ...DEFAULT_BRANCH, thickness })
  const level = (key: LevelKey, p: Partial<LevelStyle>): LevelStyle => ({ ...defaultLevel(key), ...p })
  return {
    version: 2,
    id: v1.id,
    name: v1.name,
    dark: v1.dark,
    bg: v1.bg,
    pattern: v1.pattern,
    text: v1.text,
    palette: v1.palette,
    font: v1.font,
    handDrawn: v1.handDrawn,
    levels: {
      central: level('central', { shape: v1.root.shape, fill: 'solid', fillColor: v1.root.fill, textColor: v1.root.text, branch: branch(Math.max(1.5, v1.lineWidth)) }),
      main: level('main', { shape: v1.l1.shape, fill: v1.l1.mode, branch: branch(t(1)) }),
      sub: level('sub', { shape: v1.l2.shape, fill: v1.l2.mode, branch: branch(t(2)) }),
      deeper: level('deeper', { shape: v1.l2.shape, fill: v1.l2.mode, branch: { ...branch(t(3)), falloff: 0.6 } }),
    },
  }
}

/**
 * Reads a theme from stored or imported data (either format version), so a corrupt or hostile file can't break
 * rendering. Returns null when it isn't usable as a theme.
 */
export function sanitizeTheme(raw: unknown): Theme | null {
  if (!isObj(raw)) return null
  const id = str(raw.id, 60)
  const name = str(raw.name, 60)
  const palette = Array.isArray(raw.palette) ? raw.palette.filter(isHex).slice(0, 12) : []
  if (!id || !name || !isHex(raw.bg) || !isHex(raw.text) || palette.length < 1) return null
  const font = str(raw.font, 200)
  const common = {
    id,
    name,
    dark: !!raw.dark,
    bg: raw.bg,
    pattern: pick(raw.pattern, PATTERNS, 'none'),
    text: raw.text,
    palette,
    font: font && !/[;{}<>]/.test(font) ? font : SANS,
    handDrawn: !!raw.handDrawn,
  }

  if (raw.version === THEME_FORMAT && isObj(raw.levels)) {
    const lv = raw.levels
    const levels = Object.fromEntries(LEVEL_KEYS.map((k) => [k, sanitizeLevel(lv[k], k)])) as Record<LevelKey, LevelStyle>
    if (!isHex(levels.central.fillColor)) levels.central.fillColor = palette[0] as string
    return { version: THEME_FORMAT, ...common, levels }
  }

  // Version 1 (no version field).
  const root = isObj(raw.root) ? raw.root : {}
  const l1 = isObj(raw.l1) ? raw.l1 : {}
  const l2 = isObj(raw.l2) ? raw.l2 : {}
  if (!isHex(root.fill) || !isHex(root.text)) return null
  return migrateV1Theme({
    ...common,
    root: { fill: root.fill, text: root.text, shape: pick(root.shape, SHAPES, 'rounded') },
    l1: { mode: pick(l1.mode, NODE_MODES, 'solid'), shape: pick(l1.shape, SHAPES, 'rounded') },
    l2: { mode: pick(l2.mode, NODE_MODES, 'tint'), shape: pick(l2.shape, SHAPES, 'rounded') },
    lineWidth: num(raw.lineWidth, 1, 10, 3),
  })
}

/** The colour of a solid central topic, and the text colour on it. */
export const centralFill = (t: Pick<Theme, 'levels'>): string => t.levels.central.fillColor ?? '#1f2937'
export const centralText = (t: Pick<Theme, 'levels'>): string => t.levels.central.textColor ?? readableText(centralFill(t))

/** Whether two themes draw the same (ignores the id and name). */
export function sameLook(a: Theme, b: Theme): boolean {
  const strip = (t: Theme) => JSON.stringify({ ...t, id: '', name: '' })
  return strip(a) === strip(b)
}
