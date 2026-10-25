export type Corner = 'nw' | 'ne' | 'sw' | 'se'

export const MIN_SIZE = 40
export const MAX_WIDTH = 1200
export const MAX_HEIGHT = 2400
/** Display width given to a freshly added image. */
export const DEFAULT_WIDTH = 280

export interface Size {
  width: number
  height: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Scales a size down so it is at most `maxWidth` wide, never up. */
export function originalSize(naturalWidth: number, naturalHeight: number): Size {
  const f = Math.min(1, MAX_WIDTH / Math.max(1, naturalWidth))
  return {
    width: Math.max(MIN_SIZE, Math.round(naturalWidth * f)),
    height: Math.max(MIN_SIZE, Math.round(naturalHeight * f)),
  }
}

/** Size used when an image is first added to a topic. */
export function defaultDisplaySize(naturalWidth: number, naturalHeight: number, maxWidth = DEFAULT_WIDTH): Size {
  const f = Math.min(1, maxWidth / Math.max(1, naturalWidth))
  return {
    width: Math.max(MIN_SIZE, Math.round(naturalWidth * f)),
    height: Math.max(MIN_SIZE, Math.round(naturalHeight * f)),
  }
}

export interface ResizeInput extends Size {
  /** Pointer movement since the drag started, in image (world) pixels. */
  dx: number
  dy: number
  corner: Corner
  /** Keep the aspect ratio (default behaviour; Shift = free). */
  lockAspect: boolean
}

/**
 * New size after dragging a corner. The corner opposite the dragged one stays put,
 * so dragging away from the image grows it whichever corner you hold.
 */
export function resizeImage({ width, height, dx, dy, corner, lockAspect }: ResizeInput): Size {
  const sx = corner === 'ne' || corner === 'se' ? 1 : -1
  const sy = corner === 'sw' || corner === 'se' ? 1 : -1
  const fx = (width + sx * dx) / width
  const fy = (height + sy * dy) / height

  if (!lockAspect) {
    return {
      width: Math.round(clamp(width * fx, MIN_SIZE, MAX_WIDTH)),
      height: Math.round(clamp(height * fy, MIN_SIZE, MAX_HEIGHT)),
    }
  }
  // Follow whichever axis the pointer moved furthest along.
  let f = Math.abs(fx - 1) >= Math.abs(fy - 1) ? fx : fy
  const fMin = Math.max(MIN_SIZE / width, MIN_SIZE / height)
  const fMax = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height)
  f = Math.min(Math.max(f, fMin), Math.max(fMin, fMax))
  return { width: Math.max(MIN_SIZE, Math.round(width * f)), height: Math.max(MIN_SIZE, Math.round(height * f)) }
}

/** Keyboard resize: change the width by `delta` px, keeping the aspect ratio. */
export function nudgeSize(width: number, height: number, delta: number): Size {
  return resizeImage({ width, height, dx: delta, dy: 0, corner: 'se', lockAspect: true })
}

/** Where the live-resize frame sits relative to the original image box (opposite corner stays fixed). */
export function liveOffset(corner: Corner, original: Size, live: Size): { left: number; top: number } {
  return {
    left: corner === 'nw' || corner === 'sw' ? original.width - live.width : 0,
    top: corner === 'nw' || corner === 'ne' ? original.height - live.height : 0,
  }
}
