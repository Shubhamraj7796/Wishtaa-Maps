import { contrast } from './theme/color'

/**
 * Marks are small badges shown before a topic's text. Each is stored as a short string:
 *   p:12 priority · g:50 progress · e:😀 emoji · u:blue portrait · s:gold star · f:red flag
 *   a:up arrow · y:check symbol · c:rocket[:#rrggbb] clipart (icon name from the open-source icon set)
 */
export type MarkKind = 'priority' | 'progress' | 'emoji' | 'portrait' | 'star' | 'flag' | 'arrow' | 'symbol' | 'clipart'

export interface ParsedMark {
  kind: MarkKind
  value: string
}

const PREFIX: Record<string, MarkKind> = {
  p: 'priority',
  g: 'progress',
  e: 'emoji',
  u: 'portrait',
  s: 'star',
  f: 'flag',
  a: 'arrow',
  y: 'symbol',
  c: 'clipart',
}
const LETTER: Record<MarkKind, string> = Object.fromEntries(Object.entries(PREFIX).map(([k, v]) => [v, k])) as Record<MarkKind, string>

export const PRIORITY_COUNT = 30
export const PROGRESS_STEPS = [0, 25, 50, 75, 100] as const

export const COLOR_NAMES = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const
export type ColorName = (typeof COLOR_NAMES)[number]
export const MARK_COLORS: Record<ColorName, string> = {
  red: '#dc2626',
  orange: '#ea580c',
  yellow: '#ca8a04',
  green: '#16a34a',
  blue: '#2563eb',
  purple: '#7c3aed',
}

export const EMOJIS = [
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🙂', '😉', '😊', '😍', '🤩', '😎', '🤔', '😐', '😴',
  '😢', '😭', '😡', '😱', '🥳', '🤯', '👍', '👎', '👏', '🙌', '🙏', '💪', '👀', '🔥', '⭐', '💡',
  '❤️', '💔', '✅', '❌', '⚠️', '❓', '❗', '🎯', '🚀', '🏆', '🎉', '📌', '📎', '🔔', '⏰', '💰',
]

export const PORTRAIT_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const

export const ARROWS = ['up', 'down', 'left', 'right', 'upleft', 'upright', 'downleft', 'downright', 'leftright', 'updown'] as const
export type ArrowName = (typeof ARROWS)[number]

/** Symbol ids; the editor maps each to an icon. */
export const SYMBOLS = [
  'check', 'cross', 'alert', 'help', 'info', 'heart', 'thumbsUp', 'thumbsDown', 'bookmark', 'bell',
  'calendar', 'clock', 'phone', 'mail', 'lock', 'unlock', 'lightbulb', 'trophy', 'target', 'zap',
  'flame', 'gift', 'key', 'pin', 'users', 'user', 'home', 'globe', 'search', 'settings',
  'dollar', 'chart', 'book', 'camera', 'music', 'link', 'flag', 'star', 'rocket', 'shield',
] as const
export type SymbolName = (typeof SYMBOLS)[number]

export function makeMark(kind: MarkKind, value: string | number): string {
  return `${LETTER[kind]}:${value}`
}

export function parseMark(mark: unknown): ParsedMark | null {
  if (typeof mark !== 'string' || mark.length < 3 || mark[1] !== ':') return null
  const kind = PREFIX[mark[0] as string]
  const value = mark.slice(2)
  if (!kind || value.length > 60) return null
  switch (kind) {
    case 'priority': {
      const n = Number(value)
      return Number.isInteger(n) && n >= 1 && n <= PRIORITY_COUNT ? { kind, value } : null
    }
    case 'progress':
      return (PROGRESS_STEPS as readonly number[]).includes(Number(value)) ? { kind, value } : null
    case 'emoji':
      return EMOJIS.includes(value) ? { kind, value } : null
    case 'portrait':
    case 'star':
    case 'flag':
      return (COLOR_NAMES as readonly string[]).includes(value) ? { kind, value } : null
    case 'arrow':
      return (ARROWS as readonly string[]).includes(value) ? { kind, value } : null
    case 'symbol':
      return (SYMBOLS as readonly string[]).includes(value) ? { kind, value } : null
    case 'clipart':
      return /^[a-z0-9-]{1,40}(:#[0-9a-fA-F]{6})?$/.test(value) ? { kind, value } : null
  }
}

/** Only one priority and one progress mark per topic; clicking an existing mark removes it. */
export function toggleMark(marks: readonly string[], mark: string): string[] {
  const parsed = parseMark(mark)
  if (!parsed) return [...marks]
  if (marks.includes(mark)) return marks.filter((m) => m !== mark)
  const exclusive = parsed.kind === 'priority' || parsed.kind === 'progress'
  const kept = exclusive ? marks.filter((m) => parseMark(m)?.kind !== parsed.kind) : [...marks]
  return [...kept, mark]
}

/** Colour of a priority badge: 30 distinct hues, all dark enough for white numbers. */
export function priorityColor(n: number): string {
  const hue = ((n - 1) * 47) % 360
  let light = n <= 10 ? 44 : n <= 20 ? 38 : 32
  let color = hslToHex(hue, 70, light)
  while (contrast('#ffffff', color) < 4.5 && light > 10) {
    light -= 2
    color = hslToHex(hue, 70, light)
  }
  return color
}

function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/** Number of valid marks (used to reserve width in the layout). */
export function countMarks(marks: readonly string[] | undefined): number {
  return (marks ?? []).reduce((n, m) => n + (parseMark(m) ? 1 : 0), 0)
}
