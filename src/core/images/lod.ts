/**
 * Level of detail by the picture's width on screen (in pixels):
 *   dot   under 6    a single coloured dot (no colour is even looked up)
 *   flat  6 to 24    a flat rectangle in the picture's average colour
 *   thumb 24 to 200  the small version (about 256 px)
 *   full  over 200   the full picture
 * While the view is being moved nothing above `thumb` is drawn, and `full` returns about 150 ms after it stops.
 */
export type Level = 'dot' | 'flat' | 'thumb' | 'full'

export const LOD = { dotBelowPx: 6, flatBelowPx: 24, fullFromPx: 200, idleMs: 150, upgradesPerFrame: 3 } as const

export function levelFor(screenPx: number): Level {
  if (screenPx < LOD.dotBelowPx) return 'dot'
  if (screenPx < LOD.flatBelowPx) return 'flat'
  if (screenPx < LOD.fullFromPx) return 'thumb'
  return 'full'
}

/** The level to draw now: while moving, never more than the small version. */
export function whileMoving(moving: boolean, level: Level): Level {
  return moving && level === 'full' ? 'thumb' : level
}
