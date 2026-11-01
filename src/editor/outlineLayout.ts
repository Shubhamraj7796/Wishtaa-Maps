/**
 * The maths of the Outline list. Only the rows near the screen are drawn (a map with 500 pictures has 500 tall rows), so every
 * row's height must be known without drawing it: a text row is a fixed height and a picture row adds the picture, whose size
 * comes from the picture's own proportions and the width of the list.
 */
export const ROW_H = 30
/** A picture in the outline is at most this wide on a desktop; on a narrow screen it takes the full width of the row. */
export const PICTURE_MAX_W = 320
export const PICTURE_MAX_H = 420
/** Below this list width (a phone) pictures use the whole width that is left. */
export const NARROW = 520
/** The room above and below a picture inside its row. */
export const PICTURE_GAP = 10

export interface PictureBox {
  w: number
  h: number
}

/** Size of the picture shown under a topic: keeps its proportions, within the room the row has. */
export function pictureBox(natural: { width: number; height: number }, listWidth: number, depth: number): PictureBox {
  const room = Math.max(120, listWidth - depth * 22 - 60)
  const wide = listWidth < NARROW ? room : Math.min(PICTURE_MAX_W, room)
  const ratio = natural.width > 0 && natural.height > 0 ? natural.height / natural.width : 0.75
  let w = wide
  let h = w * ratio
  if (h > PICTURE_MAX_H) {
    h = PICTURE_MAX_H
    w = h / ratio
  }
  return { w: Math.round(w), h: Math.round(h) }
}

export const rowHeight = (picture: PictureBox | null) => ROW_H + (picture ? picture.h + PICTURE_GAP : 0)

/** `out[i]` is where row i starts; `out[n]` is the total height. */
export function offsets(heights: readonly number[]): number[] {
  const out = new Array<number>(heights.length + 1)
  out[0] = 0
  for (let i = 0; i < heights.length; i++) out[i + 1] = (out[i] as number) + (heights[i] as number)
  return out
}

/** The first row that ends below `y` (binary search). */
export function rowAt(starts: readonly number[], y: number): number {
  let lo = 0
  let hi = starts.length - 2
  if (hi < 0) return 0
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((starts[mid + 1] as number) <= y) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** The rows to draw: those on screen plus `overscan` pixels either side. `end` is exclusive. */
export function windowFor(starts: readonly number[], top: number, height: number, overscan = 480): { start: number; end: number } {
  const n = starts.length - 1
  if (n <= 0) return { start: 0, end: 0 }
  const start = rowAt(starts, Math.max(0, top - overscan))
  const end = Math.min(n, rowAt(starts, top + height + overscan) + 1)
  return { start, end }
}

/** Where to scroll so row `i` is fully on screen, or null if it already is. */
export function scrollToShow(starts: readonly number[], i: number, top: number, height: number, margin = 8): number | null {
  const a = starts[i]
  const b = starts[i + 1]
  if (a === undefined || b === undefined) return null
  if (a - margin >= top && b + margin <= top + height) return null
  // A row taller than the screen shows its start. Otherwise it is put about a third of the way down, so what comes before is visible.
  return Math.max(0, b - a >= height ? a - margin : a - Math.round(height / 3))
}
