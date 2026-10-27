import type { LineStyle, Shape, TopicStyle } from '../model/types'
import { mix, readableText } from './color'
import type { NodeMode, Theme } from './themes'

/** A theme plus the map's rainbow switch, ready to draw with. */
export type ResolvedTheme = Theme & { rainbow: boolean }

export type Level = 'root' | 'l1' | 'l2'

export const levelOf = (depth: number, isRoot: boolean): Level => (isRoot ? 'root' : depth <= 1 ? 'l1' : 'l2')

export function shapeFor(theme: Theme, level: Level): Shape {
  return level === 'root' ? theme.root.shape : theme[level].shape
}

/** Branch colour: rainbow gives each top-level branch its own, otherwise one accent for all. */
export function accentFor(theme: ResolvedTheme, branch: number): string {
  const p = theme.palette
  if (!p.length) return '#0f766e'
  return theme.rainbow && branch >= 0 ? (p[branch % p.length] as string) : (p[0] as string)
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
    case 'outline':
      return { fill: 'transparent', border: color, text: theme.text }
    default:
      return { fill: 'transparent', border: color, text: theme.text }
  }
}

export function resolveLook(theme: ResolvedTheme, a: LookArgs): Look {
  const level = levelOf(a.depth, a.isRoot)
  const s = a.style ?? {}
  let base: { fill: string; border: string; text: string }
  let shape: Shape
  if (level === 'root') {
    base = { fill: theme.root.fill, border: theme.root.fill, text: theme.root.text }
    shape = theme.root.shape
  } else {
    const color = accentFor(theme, a.branch)
    base = paint(theme[level].mode, color, theme)
    shape = theme[level].shape
  }
  if (a.layoutShape) shape = a.layoutShape
  shape = s.shape ?? shape

  const fill = s.fill ?? base.fill
  const border = s.border ?? base.border
  // A custom fill keeps its text readable unless the text colour was chosen too.
  const text = s.textColor ?? (s.fill ? readableText(s.fill) : base.text)
  const mode = level === 'root' ? 'solid' : theme[level].mode
  return {
    fill,
    border,
    borderWidth: s.borderWidth ?? (mode === 'plain' || shape === 'underline' ? 2 : 2),
    text,
    shape,
    fontSize: s.fontSize ?? (level === 'root' ? 17 : 14),
    fontWeight: s.fontWeight ?? (level === 'l2' ? 500 : 600),
    italic: !!s.italic,
    fontFamily: s.fontFamily ?? theme.font,
    handDrawn: theme.handDrawn,
  }
}

export interface Line {
  color: string
  width: number
  style: LineStyle
}

/** Connector leading to a topic: colour from its branch, width and style from the topic or theme. */
export function resolveLine(theme: ResolvedTheme, a: { depth: number; branch: number; style?: TopicStyle }): Line {
  return {
    color: accentFor(theme, a.branch),
    width: a.style?.lineWidth ?? Math.max(1.5, theme.lineWidth - a.depth * 0.6),
    style: a.style?.lineStyle ?? 'solid',
  }
}

export const DASH: Record<LineStyle, string | undefined> = { solid: undefined, dashed: '9 6', dotted: '2 6' }
