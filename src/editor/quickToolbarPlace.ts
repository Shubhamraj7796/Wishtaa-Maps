export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Placement {
  left: number
  top: number
  /** True when the toolbar sits under the topic because there was no room above. */
  below: boolean
}

const MARGIN = 8
const GAP = 10

/**
 * Where the quick toolbar goes, in the same pixels as `target` and `area`: centred above the selected topic(s), flipped
 * below when there is no room above, and always kept inside the area. If neither side has room it sits at the top edge
 * (covering part of a very large selection is better than hiding the tools).
 */
export function placeToolbar(target: Rect, bar: { w: number; h: number }, area: { w: number; h: number }): Placement {
  const maxLeft = Math.max(MARGIN, area.w - bar.w - MARGIN)
  const left = Math.round(Math.min(maxLeft, Math.max(MARGIN, target.x + target.w / 2 - bar.w / 2)))
  const above = target.y - bar.h - GAP
  if (above >= MARGIN) return { left, top: Math.round(above), below: false }
  const under = target.y + target.h + GAP
  if (under + bar.h <= area.h - MARGIN) return { left, top: Math.round(under), below: true }
  return { left, top: MARGIN, below: false }
}

/** The smallest rectangle holding all the given rectangles (null for none). */
export function unionRect(rects: Rect[]): Rect | null {
  if (!rects.length) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const r of rects) {
    x0 = Math.min(x0, r.x)
    y0 = Math.min(y0, r.y)
    x1 = Math.max(x1, r.x + r.w)
    y1 = Math.max(y1, r.y + r.h)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
