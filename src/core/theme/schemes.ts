/**
 * Colour schemes: ordered palettes for branches. Main branches take colours in order (wrapping around) and sub-branches
 * inherit their parent branch's colour. A scheme changes colours only, never shapes.
 */
export interface ColorScheme {
  id: string
  name: string
  group: 'Colourful' | 'Soft' | 'One colour' | 'Accessible'
  colors: string[]
}

export const COLOR_SCHEMES: ColorScheme[] = [
  { id: 'rainbow', name: 'Rainbow', group: 'Colourful', colors: ['#e11d48', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#c026d3'] },
  { id: 'warm', name: 'Warm', group: 'Colourful', colors: ['#b91c1c', '#c2410c', '#b45309', '#a16207', '#be123c', '#9a3412', '#d97706', '#9f1239'] },
  { id: 'cool', name: 'Cool', group: 'Colourful', colors: ['#1d4ed8', '#0e7490', '#0f766e', '#4338ca', '#0369a1', '#047857', '#6d28d9', '#155e75'] },
  { id: 'sunset', name: 'Sunset', group: 'Colourful', colors: ['#c2410c', '#be123c', '#a21caf', '#7e22ce', '#b45309', '#9d174d', '#6d28d9', '#9a3412'] },
  { id: 'ocean', name: 'Ocean', group: 'Colourful', colors: ['#0369a1', '#0e7490', '#1d4ed8', '#0f766e', '#155e75', '#1e40af', '#0284c7', '#047857'] },
  { id: 'pastel', name: 'Pastel', group: 'Soft', colors: ['#f9a8d4', '#fdba74', '#fde68a', '#bbf7d0', '#a5f3fc', '#bfdbfe', '#c4b5fd', '#f5d0fe'] },
  { id: 'candy', name: 'Candy', group: 'Soft', colors: ['#f472b6', '#a78bfa', '#38bdf8', '#fbbf24', '#4ade80', '#fb7185', '#c084fc', '#2dd4bf'] },
  { id: 'earthy', name: 'Earthy', group: 'Soft', colors: ['#92400e', '#4d7c0f', '#854d0e', '#166534', '#9a3412', '#3f6212', '#78350f', '#115e59'] },
  { id: 'mono-blue', name: 'Blues', group: 'One colour', colors: ['#1e3a8a', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#0369a1', '#0284c7', '#38bdf8'] },
  { id: 'mono-green', name: 'Greens', group: 'One colour', colors: ['#14532d', '#166534', '#15803d', '#16a34a', '#22c55e', '#047857', '#059669', '#34d399'] },
  { id: 'mono-purple', name: 'Purples', group: 'One colour', colors: ['#4c1d95', '#5b21b6', '#6d28d9', '#7c3aed', '#8b5cf6', '#6b21a8', '#9333ea', '#a78bfa'] },
  { id: 'mono-red', name: 'Reds', group: 'One colour', colors: ['#7f1d1d', '#991b1b', '#b91c1c', '#dc2626', '#ef4444', '#9f1239', '#be123c', '#f87171'] },
  { id: 'mono-grey', name: 'Greys', group: 'One colour', colors: ['#111827', '#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af', '#52525b', '#71717a'] },
  // Okabe-Ito: distinguishable with the common kinds of colour blindness.
  { id: 'cb-okabe', name: 'Colour-blind safe', group: 'Accessible', colors: ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#e69f00', '#56b4e9', '#f0e442', '#000000'] },
  // Paul Tol "bright".
  { id: 'cb-tol', name: 'Colour-blind safe 2', group: 'Accessible', colors: ['#4477aa', '#ee6677', '#228833', '#ccbb44', '#66ccee', '#aa3377', '#bbbbbb', '#332288'] },
]

export const findScheme = (id: string | null | undefined): ColorScheme | null => (id ? COLOR_SCHEMES.find((s) => s.id === id) ?? null : null)
