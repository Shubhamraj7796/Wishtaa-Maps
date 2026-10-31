import type { PanelTab, SelectionKind } from '../store'

/** How long the pointer must rest on the right edge before the panel opens, and how long after leaving before it closes. */
export const HOVER_OPEN_MS = 150
export const HOVER_CLOSE_MS = 400
/** Rapid selection changes (a box drag, arrow keys) settle for this long before the panel reacts. */
export const SELECTION_SETTLE_MS = 120
/** The strip along the right edge that wakes the panel. */
export const HOT_ZONE_PX = 16
export const PANEL_WIDTH = 320

export interface SelectionFacts {
  selectedObject: unknown
  imageSelected: string | null
  selected: string[]
}

/** What the person has selected, as far as the panel is concerned. */
export function selectionKind(s: SelectionFacts): SelectionKind {
  if (s.selectedObject) return 'object'
  if (s.imageSelected && s.selected.length === 1 && s.selected[0] === s.imageSelected) return 'picture'
  if (s.selected.length === 0) return 'none'
  return s.selected.length === 1 ? 'topic' : 'topics'
}

/** The section that suits each kind of selection. */
export const TAB_FOR_KIND: Record<SelectionKind, PanelTab> = {
  none: 'canvas',
  topic: 'style',
  topics: 'style',
  picture: 'picture',
  object: 'object',
}

export const SECTION_NAME: Record<PanelTab, string> = {
  canvas: 'Canvas',
  style: 'Style',
  picture: 'Picture format',
  object: 'Object style',
  mark: 'Marks',
  clipart: 'Clipart',
  details: 'Details',
  notes: 'Notes',
}

export type PanelMode = 'auto' | 'always' | 'manual'

export interface OpenInput {
  mode: PanelMode
  pinned: boolean
  open: boolean
  kind: SelectionKind
  /** True when something inside the panel is open or focused, or a drag / resize is going on. */
  busy: boolean
  /** The pointer is over the panel. */
  hovered: boolean
  opener: 'selection' | 'hover' | 'handle' | null
}

/**
 * What the panel should do after the selection settles.
 *  - Auto: a selection opens it; clearing the selection closes it again (unless pinned, opened by hand, busy or under the pointer).
 *  - Always: it stays open. Manual: the selection never opens or closes it.
 */
export function afterSelection(i: OpenInput): 'open' | 'close' | 'stay' {
  if (i.mode === 'manual') return 'stay'
  if (i.mode === 'always' || i.pinned) return i.open ? 'stay' : i.kind !== 'none' || i.mode === 'always' ? 'open' : 'stay'
  if (i.kind !== 'none') return i.open ? 'stay' : 'open'
  if (!i.open) return 'stay'
  if (i.opener === 'handle' || i.busy || i.hovered) return 'stay'
  return 'close'
}

/** Whether leaving the panel with the pointer should close it: only a panel the pointer itself opened, and nothing keeping it. */
export function closesOnLeave(i: Pick<OpenInput, 'mode' | 'pinned' | 'open' | 'busy' | 'opener'>): boolean {
  return i.mode !== 'always' && !i.pinned && i.open && i.opener === 'hover' && !i.busy
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * How far to pan the canvas to the left so a topic is not hidden under the panel, in screen px (0 when it is already clear).
 * Never pans so far that the topic's own left edge would leave the screen.
 */
export function panToReveal(topic: Rect, area: { w: number; h: number }, panelWidth: number, margin = 24): number {
  const clearRight = area.w - panelWidth - margin
  const covered = topic.x + topic.w - clearRight
  if (covered <= 0) return 0
  if (topic.x + topic.w <= area.w - panelWidth) return 0 // fully left of the panel
  const room = Math.max(0, topic.x - margin) // how far it can move before its left edge hits the screen edge
  return Math.min(covered, room)
}
