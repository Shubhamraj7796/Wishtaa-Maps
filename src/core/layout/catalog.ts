export type LayoutFamily =
  | 'mindmap'
  | 'tree'
  | 'org'
  | 'timeline'
  | 'fishbone'
  | 'table'
  | 'circular'
  | 'bubble'
  | 'sector'
  | 'bracket'

export interface LayoutDef {
  id: string
  label: string
  group: string
  family: LayoutFamily
  variant: string
  /** Whether the "line style" option changes how this layout draws connectors. */
  usesConnectors: boolean
}

const def = (
  id: string,
  label: string,
  group: string,
  family: LayoutFamily,
  variant: string,
  usesConnectors = true
): LayoutDef => ({ id, label, group, family, variant, usesConnectors })

export const LAYOUTS: LayoutDef[] = [
  def('mindmap:both', 'Balanced (both sides)', 'Mind map', 'mindmap', 'both'),
  def('mindmap:right', 'Right only', 'Mind map', 'mindmap', 'right'),
  def('mindmap:left', 'Left only', 'Mind map', 'mindmap', 'left'),
  def('mindmap:down', 'Top-down', 'Mind map', 'mindmap', 'down'),
  def('mindmap:up', 'Bottom-up', 'Mind map', 'mindmap', 'up'),

  def('tree:right', 'Tree to the right', 'Tree map', 'tree', 'right'),
  def('tree:left', 'Tree to the left', 'Tree map', 'tree', 'left'),
  def('tree:down', 'Tree downwards', 'Tree map', 'tree', 'down'),
  def('tree:up', 'Tree upwards', 'Tree map', 'tree', 'up'),

  def('timeline:horizontal', 'Horizontal timeline', 'Timeline', 'timeline', 'horizontal', false),
  def('timeline:vertical', 'Vertical timeline', 'Timeline', 'timeline', 'vertical', false),

  def('org:down', 'Org chart (top-down)', 'Org chart', 'org', 'down'),
  def('org:right', 'Org chart (left-right)', 'Org chart', 'org', 'right'),
  def('org:compact', 'Org chart (compact)', 'Org chart', 'org', 'compact', false),

  def('fishbone:left', 'Fishbone (head left)', 'Fishbone', 'fishbone', 'left', false),
  def('fishbone:right', 'Fishbone (head right)', 'Fishbone', 'fishbone', 'right', false),

  def('table:rows', 'Tree table (columns by level)', 'Tree table', 'table', 'rows', false),
  def('table:columns', 'Tree table (rows by level)', 'Tree table', 'table', 'columns', false),

  def('circular', 'Circular map', 'Other', 'circular', 'circular', false),
  def('bubble', 'Bubble map', 'Other', 'bubble', 'bubble', false),
  def('sector', 'Sector map', 'Other', 'sector', 'sector', false),
  def('bracket:right', 'Bracket map (right)', 'Other', 'bracket', 'right', false),
  def('bracket:left', 'Bracket map (left)', 'Other', 'bracket', 'left', false),
]

export const DEFAULT_LAYOUT = 'mindmap:both'

const byId = new Map(LAYOUTS.map((l) => [l.id, l]))

export const isLayoutId = (id: unknown): id is string => typeof id === 'string' && byId.has(id)

export function layoutDef(id: string | undefined): LayoutDef {
  return byId.get(id ?? '') ?? (byId.get(DEFAULT_LAYOUT) as LayoutDef)
}

export const LAYOUT_GROUPS: string[] = [...new Set(LAYOUTS.map((l) => l.group))]
