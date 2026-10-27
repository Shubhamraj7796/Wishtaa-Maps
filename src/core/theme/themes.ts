import type { Shape } from '../model/types'
import { readableText } from './color'
import { PALETTE } from './palette'

export type NodeMode = 'solid' | 'tint' | 'outline' | 'plain'
export type Pattern = 'none' | 'dots' | 'grid' | 'lines' | 'cross'
export const PATTERNS: Pattern[] = ['none', 'dots', 'grid', 'lines', 'cross']

export interface Theme {
  id: string
  name: string
  /** Dark canvas: text on tinted/outlined topics is light. */
  dark: boolean
  bg: string
  pattern: Pattern
  /** Text colour on tinted, outlined and plain topics. */
  text: string
  /** Branch colours (rainbow). The first is used when rainbow is off. */
  palette: string[]
  root: { fill: string; text: string; shape: Shape }
  l1: { mode: NodeMode; shape: Shape }
  l2: { mode: NodeMode; shape: Shape }
  lineWidth: number
  font: string
  handDrawn: boolean
}

const SANS = "Inter, system-ui, 'Segoe UI', sans-serif"
const SERIF = "Georgia, 'Times New Roman', serif"
const ROUND = "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif"
const HAND = "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', 'Chalkboard SE', cursive"
const MONO = "ui-monospace, 'Cascadia Code', Consolas, monospace"

interface Spec {
  id: string
  name: string
  bg: string
  palette: string[]
  root: string
  l1?: [NodeMode, Shape]
  l2?: [NodeMode, Shape]
  rootShape?: Shape
  pattern?: Pattern
  dark?: boolean
  text?: string
  font?: string
  line?: number
  hand?: boolean
}

function theme(s: Spec): Theme {
  const dark = !!s.dark
  return {
    id: s.id,
    name: s.name,
    dark,
    bg: s.bg,
    pattern: s.pattern ?? 'dots',
    text: s.text ?? (dark ? '#e5e7eb' : '#1f2937'),
    palette: s.palette,
    root: { fill: s.root, text: readableText(s.root), shape: s.rootShape ?? 'rounded' },
    l1: { mode: s.l1?.[0] ?? 'solid', shape: s.l1?.[1] ?? 'rounded' },
    l2: { mode: s.l2?.[0] ?? 'tint', shape: s.l2?.[1] ?? 'rounded' },
    lineWidth: s.line ?? 3,
    font: s.font ?? SANS,
    handDrawn: !!s.hand,
  }
}

export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Sans-serif', value: SANS },
  { label: 'Serif', value: SERIF },
  { label: 'Rounded', value: ROUND },
  { label: 'Monospace', value: MONO },
  { label: 'Handwriting', value: HAND },
]

export const THEMES: Theme[] = [
  theme({ id: 'wishtaa', name: 'Wishtaa Classic', bg: '#f7f8fa', palette: PALETTE, root: '#1f2937' }),
  theme({ id: 'ocean', name: 'Ocean', bg: '#f0f9ff', root: '#0c4a6e', l1: ['solid', 'pill'], l2: ['outline', 'pill'], palette: ['#0369a1', '#0e7490', '#1d4ed8', '#0f766e', '#155e75', '#1e40af', '#0284c7', '#047857'] }),
  theme({ id: 'forest', name: 'Forest', bg: '#f4f8f1', root: '#14532d', palette: ['#166534', '#4d7c0f', '#854d0e', '#15803d', '#3f6212', '#92400e', '#14532d', '#365314'] }),
  theme({ id: 'sunset', name: 'Sunset', bg: '#fff7ed', root: '#7c2d12', l1: ['solid', 'pill'], palette: ['#c2410c', '#be123c', '#b45309', '#9d174d', '#a21caf', '#9a3412', '#be185d', '#c026d3'] }),
  theme({ id: 'lavender', name: 'Lavender', bg: '#faf5ff', root: '#4c1d95', l2: ['outline', 'rounded'], palette: ['#6d28d9', '#7e22ce', '#a21caf', '#4338ca', '#86198f', '#5b21b6', '#6b21a8', '#4f46e5'] }),
  theme({ id: 'slate', name: 'Slate', bg: '#f1f5f9', root: '#0f172a', l1: ['solid', 'rect'], l2: ['plain', 'underline'], rootShape: 'rect', palette: ['#334155', '#1d4ed8', '#0f766e', '#475569', '#1e40af', '#115e59', '#0f172a', '#3730a3'] }),
  theme({ id: 'mono', name: 'Mono', bg: '#ffffff', root: '#000000', l1: ['outline', 'rect'], l2: ['plain', 'underline'], rootShape: 'rect', pattern: 'none', font: MONO, line: 2, palette: ['#111827', '#374151', '#4b5563', '#1f2937', '#6b7280', '#111827', '#374151', '#4b5563'] }),
  theme({ id: 'paper', name: 'Paper', bg: '#fbf7ef', root: '#44403c', l1: ['tint', 'rounded'], l2: ['plain', 'underline'], pattern: 'none', font: SERIF, palette: ['#9a3412', '#1e40af', '#166534', '#86198f', '#854d0e', '#0f766e', '#9f1239', '#3730a3'] }),
  theme({ id: 'midnight', name: 'Midnight', dark: true, bg: '#0f172a', root: '#1e293b', pattern: 'dots', palette: ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#2dd4bf', '#fb923c', '#f87171'] }),
  theme({ id: 'neon', name: 'Neon Night', dark: true, bg: '#0a0a14', root: '#27272a', l1: ['outline', 'pill'], l2: ['plain', 'underline'], pattern: 'grid', palette: ['#22d3ee', '#a3e635', '#f0abfc', '#fde047', '#fb7185', '#38bdf8', '#4ade80', '#c084fc'] }),
  theme({ id: 'coral', name: 'Coral Reef', bg: '#fff5f5', root: '#881337', l1: ['solid', 'pill'], palette: ['#be123c', '#0e7490', '#c2410c', '#0f766e', '#9f1239', '#155e75', '#b91c1c', '#047857'] }),
  theme({ id: 'mint', name: 'Mint', bg: '#f0fdf9', root: '#134e4a', l1: ['tint', 'rounded'], l2: ['plain', 'underline'], palette: ['#0f766e', '#15803d', '#0e7490', '#047857', '#115e59', '#166534', '#155e75', '#065f46'] }),
  theme({ id: 'berry', name: 'Berry', bg: '#fdf2f8', root: '#831843', palette: ['#be185d', '#7e22ce', '#9d174d', '#a21caf', '#6b21a8', '#be123c', '#86198f', '#9f1239'] }),
  theme({ id: 'sand', name: 'Sand', bg: '#faf6ec', root: '#713f12', pattern: 'none', palette: ['#a16207', '#b45309', '#92400e', '#854d0e', '#713f12', '#9a3412', '#78350f', '#a8501b'] }),
  theme({ id: 'arctic', name: 'Arctic', bg: '#f8fbff', root: '#1e3a8a', l1: ['tint', 'pill'], l2: ['outline', 'pill'], palette: ['#0e7490', '#1d4ed8', '#4338ca', '#0369a1', '#155e75', '#1e40af', '#3730a3', '#0c4a6e'] }),
  theme({ id: 'terra', name: 'Terra', bg: '#fdf4ee', root: '#7c2d12', l1: ['solid', 'rect'], rootShape: 'rect', l2: ['tint', 'rect'], palette: ['#9a3412', '#a16207', '#7c2d12', '#854d0e', '#b45309', '#92400e', '#78350f', '#c2410c'] }),
  theme({ id: 'candy', name: 'Candy', bg: '#fff1f8', root: '#9d174d', l1: ['solid', 'pill'], l2: ['tint', 'pill'], font: ROUND, palette: ['#db2777', '#7c3aed', '#0891b2', '#d97706', '#16a34a', '#e11d48', '#9333ea', '#0d9488'] }),
  theme({ id: 'graphite', name: 'Graphite', dark: true, bg: '#18181b', root: '#3f3f46', palette: ['#a1a1aa', '#93c5fd', '#86efac', '#fcd34d', '#fda4af', '#c4b5fd', '#67e8f9', '#fdba74'] }),
  theme({ id: 'sky', name: 'Sky', bg: '#eff6ff', root: '#1e40af', rootShape: 'ellipse', l1: ['solid', 'ellipse'], l2: ['tint', 'pill'], palette: ['#2563eb', '#0284c7', '#4f46e5', '#0891b2', '#1d4ed8', '#0369a1', '#4338ca', '#0e7490'] }),
  theme({ id: 'citrus', name: 'Citrus', bg: '#fefce8', root: '#365314', palette: ['#a16207', '#4d7c0f', '#c2410c', '#15803d', '#854d0e', '#3f6212', '#9a3412', '#166534'] }),
  theme({ id: 'plum', name: 'Plum', dark: true, bg: '#1e1028', root: '#581c87', l1: ['solid', 'pill'], palette: ['#e879f9', '#a78bfa', '#f9a8d4', '#c4b5fd', '#f0abfc', '#d8b4fe', '#fda4af', '#93c5fd'] }),
  theme({ id: 'meadow', name: 'Meadow', bg: '#f7fee7', root: '#3f6212', l1: ['tint', 'rounded'], l2: ['plain', 'underline'], palette: ['#4d7c0f', '#15803d', '#a16207', '#0f766e', '#3f6212', '#166534', '#854d0e', '#047857'] }),
  theme({ id: 'ember', name: 'Ember', dark: true, bg: '#1c1210', root: '#7c2d12', palette: ['#fb923c', '#f87171', '#fbbf24', '#fb7185', '#fdba74', '#fca5a5', '#fcd34d', '#f97316'] }),
  theme({ id: 'blueprint', name: 'Blueprint', dark: true, bg: '#0b3a6b', root: '#082f55', pattern: 'grid', l1: ['outline', 'rect'], l2: ['plain', 'underline'], rootShape: 'rect', font: MONO, text: '#e0f2fe', palette: ['#e0f2fe', '#7dd3fc', '#bae6fd', '#fde68a', '#a5f3fc', '#fecdd3', '#bbf7d0', '#ddd6fe'] }),
  theme({ id: 'notebook', name: 'Notebook (hand-drawn)', bg: '#fffef8', root: '#1e3a8a', pattern: 'lines', hand: true, font: HAND, l1: ['tint', 'rounded'], l2: ['plain', 'underline'], palette: ['#1d4ed8', '#b91c1c', '#15803d', '#7e22ce', '#b45309', '#0e7490', '#be185d', '#4d7c0f'] }),
  theme({ id: 'whiteboard', name: 'Whiteboard (hand-drawn)', bg: '#ffffff', root: '#111827', pattern: 'none', hand: true, font: HAND, l1: ['outline', 'rounded'], l2: ['plain', 'underline'], palette: ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#db2777', '#65a30d'] }),
]

export const DEFAULT_THEME_ID = 'wishtaa'

export function findTheme(id: string, custom: Theme[] = []): Theme {
  return custom.find((t) => t.id === id) ?? THEMES.find((t) => t.id === id) ?? (THEMES[0] as Theme)
}
