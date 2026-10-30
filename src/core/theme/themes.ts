import builtin from './themes.json'
import { PATTERNS, sanitizeTheme, type NodeMode, type Pattern, type Theme } from './model'

export { PATTERNS }
export type { NodeMode, Pattern, Theme }

const SANS = "Inter, system-ui, 'Segoe UI', sans-serif"
const SERIF = "Georgia, 'Times New Roman', serif"
const ROUND = "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif"
const HAND = "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', 'Chalkboard SE', cursive"
const MONO = "ui-monospace, 'Cascadia Code', Consolas, monospace"

export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Sans-serif', value: SANS },
  { label: 'Serif', value: SERIF },
  { label: 'Rounded', value: ROUND },
  { label: 'Monospace', value: MONO },
  { label: 'Handwriting', value: HAND },
]

/**
 * The built-in themes. They are data (`themes.json`), checked on load like any theme from a file, so adding a theme
 * means adding an entry there: no code changes.
 */
export const THEMES: Theme[] = (builtin as unknown[]).map(sanitizeTheme).filter((t): t is Theme => !!t)

export const DEFAULT_THEME_ID = 'wishtaa'

export function findTheme(id: string, custom: Theme[] = []): Theme {
  return custom.find((t) => t.id === id) ?? THEMES.find((t) => t.id === id) ?? (THEMES[0] as Theme)
}

export const isBuiltinTheme = (id: string) => THEMES.some((t) => t.id === id)
