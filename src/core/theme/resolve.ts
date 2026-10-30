import type { BranchCurve, LineStyle, Shape, TopicStyle } from '../model/types'
import { mix, readableText } from './color'
import { centralFill, centralText, type LevelKey, type NodeMode, type Theme } from './model'

/**
 * A theme plus the map's overrides, ready to draw with. Resolution order for everything drawn, strongest first:
 * the topic's own overrides, then these map overrides, then the theme's level, then built-in defaults.
 */
export type ResolvedTheme = Theme & {
  /** Each main branch gets its own colour from the palette (otherwise one colour for all). */
  rainbow: boolean
  /** The colour scheme chosen for the map (null = the theme's own colours). */
  schemeId: string | null
  /** Map-wide branch thickness (px, at the main branches); null = the theme's. Other levels keep their proportions. */
  branchThickness: number | null
  /** Map-wide taper switch; null = the theme's. */
  taper: boolean | null
}

export type Level = LevelKey

export const levelOf = (depth: number, isRoot: boolean): Level => (isRoot ? 'central' : depth <= 1 ? 'main' : depth === 2 ? 'sub' : 'deeper')

export function shapeFor(theme: Theme, level: Level): Shape {
  return theme.levels[level].shape
}

/** Branch colour: rainbow gives each top-level branch its own, otherwise one accent for all. */
export function accentFor(theme: Pick<ResolvedTheme, 'palette' | 'rainbow'>, branch: number): string {
  const p = theme.palette
  if (!p.length) return '#0f766e'
  return theme.rainbow && branch >= 0 ? (p[branch % p.length] as string) : (p[0] as string)
}

/** Stored styles may use null for "inherit"; this makes them undefined so one rule applies. Same object when there is no null. */
export function inheritNulls(style: TopicStyle | undefined): TopicStyle {
  if (!style) return {}
  let clean: Record<string, unknown> | null = null
  for (const [k, v] of Object.entries(style)) {
    if (v === null) {
      clean ??= { ...style }
      delete clean[k]
    }
  }
  return (clean ?? style) as TopicStyle
}

export interface Look {
  fill: string
  border: string
  borderWidth: number
  text: string
  shape: Shape
  fontSize: number
  fontWeight: number
  italic: boolean
  fontFamily: string
  handDrawn: boolean
}

export interface LookArgs {
  depth: number
  branch: number
  isRoot: boolean
  style?: TopicStyle
  /** Shape suggested by the layout (e.g. bubbles); beaten only by the topic's own shape. */
  layoutShape?: Shape | null
}

function paint(mode: NodeMode, color: string, theme: Theme): { fill: string; border: string; text: string } {
  switch (mode) {
    case 'solid':
      return { fill: color, border: color, text: readableText(color) }
    case 'tint':
      return { fill: mix(color, theme.bg, 0.16), border: color, text: theme.text }
    default:
      return { fill: 'transparent', border: color, text: theme.text }
  }
}

export function resolveLook(theme: ResolvedTheme, a: LookArgs): Look {
  const level = levelOf(a.depth, a.isRoot)
  const L = theme.levels[level]
  const s = inheritNulls(a.style)
  const color = level === 'central' ? centralFill(theme) : accentFor(theme, a.branch)
  const base = paint(L.fill, color, theme)
  if (level === 'central') base.text = centralText(theme)
  else if (L.textColor) base.text = L.textColor

  const shape = s.shape ?? a.layoutShape ?? L.shape
  const fill = s.fill ?? base.fill
  const border = s.border ?? base.border
  // A custom fill keeps its text readable unless the text colour was chosen too.
  const text = s.textColor ?? (s.fill ? readableText(s.fill) : base.text)
  return {
    fill,
    border,
    borderWidth: s.borderWidth ?? L.borderWidth,
    text,
    shape,
    fontSize: s.fontSize ?? L.fontSize,
    fontWeight: s.fontWeight ?? L.fontWeight,
    italic: !!s.italic,
    fontFamily: s.fontFamily ?? L.fontFamily ?? theme.font,
    handDrawn: theme.handDrawn,
  }
}

export interface Line {
  color: string
  /** Thickness at the parent end. */
  width: number
  /** Thickness at the topic end (smaller than `width` when tapered). */
  endWidth: number
  style: LineStyle
  taper: boolean
  curve: BranchCurve
}

export const MIN_LINE = 1
export const MAX_LINE = 40
/** A tapered branch ends this fraction as thick as it starts (never under 0.8 px). */
export const TAPER_END = 0.3

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Thickness of the branch to a topic at `depth` (1 = main) before any topic override. `scale` is the map's thickness
 * override as a ratio; it scales the level's thickness and falloff before the floor applies, so a theme built from a map
 * (with the scale baked in) draws exactly like the map.
 */
export function themeBranchWidth(theme: Theme, depth: number, scale = 1): number {
  const key = levelOf(depth, depth === 0)
  const b = theme.levels[key].branch
  const t = b.thickness * scale
  if (key !== 'deeper') return t
  return Math.max(Math.min(1.5, t), t - b.falloff * scale * (depth - 3))
}

/** The branch leading to a topic: colour from its branch, thickness, taper, curve and dash from topic, map or theme. */
export function resolveLine(theme: ResolvedTheme, a: { depth: number; branch: number; style?: TopicStyle }): Line {
  const level = theme.levels[levelOf(a.depth, a.depth === 0)]
  const s = inheritNulls(a.style)
  const mainBase = theme.levels.main.branch.thickness
  const scale = theme.branchThickness !== null && mainBase > 0 ? theme.branchThickness / mainBase : 1
  const width = Math.min(MAX_LINE, Math.max(MIN_LINE, r2(s.lineWidth ?? themeBranchWidth(theme, a.depth, scale))))
  const taper = s.taper ?? theme.taper ?? level.branch.taper
  return {
    color: s.lineColor ?? accentFor(theme, a.branch),
    width,
    endWidth: taper ? r2(Math.max(0.8, width * TAPER_END)) : width,
    style: s.lineStyle ?? level.branch.dash,
    taper,
    curve: s.branchCurve ?? level.branch.curve,
  }
}

export const DASH: Record<LineStyle, string | undefined> = { solid: undefined, dashed: '9 6', dotted: '2 6' }

/** A theme as it draws with no map overrides (gallery previews, and themes not yet applied to a map). */
export function asResolved(theme: Theme, over: Partial<Pick<ResolvedTheme, 'palette' | 'rainbow'>> = {}): ResolvedTheme {
  return { ...theme, palette: over.palette ?? theme.palette, rainbow: over.rainbow ?? true, schemeId: null, branchThickness: null, taper: null }
}
