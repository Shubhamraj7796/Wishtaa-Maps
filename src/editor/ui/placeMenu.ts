export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export interface MenuPlacement {
  left: number
  top: number
  /** The menu scrolls inside this height; it is never taller than the room it was given. */
  maxHeight: number
  /** True when it opens above its button. */
  above: boolean
}

/** Windows narrower than this, and touch screens, get a sheet along the bottom instead of a dropdown. */
export const SHEET_BELOW = 640

/**
 * Where a dropdown goes so that it is always completely inside the window: below its button when it fits, otherwise above when there is
 * more room there, shifted sideways at the edges; when neither side fits all of it, it takes the roomier side and scrolls inside.
 * `size` is the menu's natural size (its content), `view` the window.
 */
export function placeMenu(anchor: Box, size: { width: number; height: number }, view: { width: number; height: number }, opts: { margin?: number; gap?: number } = {}): MenuPlacement {
  const margin = opts.margin ?? 8
  const gap = opts.gap ?? 4
  const width = Math.min(size.width, view.width - margin * 2)
  const left = Math.max(margin, Math.min(anchor.left, view.width - margin - width))
  const roomBelow = view.height - margin - (anchor.top + anchor.height + gap)
  const roomAbove = anchor.top - gap - margin
  const above = size.height > roomBelow && roomAbove > roomBelow
  const room = Math.max(80, above ? roomAbove : roomBelow)
  const maxHeight = Math.min(size.height, room, view.height - margin * 2)
  const top = above ? anchor.top - gap - maxHeight : anchor.top + anchor.height + gap
  return { left, top: Math.max(margin, top), maxHeight, above }
}
