/** How many pictures one map may hold. All the numbers live here. */
export const PICTURE_LIMITS = {
  softCount: 400,
  softBytes: 250 * 1024 * 1024,
  hardCount: 2000,
  hardBytes: 1024 * 1024 * 1024,
  /** Draw the small version below this on-screen width (px), or while the map is being moved. */
  thumbBelowPx: 200,
  thumbSide: 256,
  /** Decoded pictures kept in memory (bytes), by kind of device. */
  memoryDesktop: 150 * 1024 * 1024,
  memoryTouch: 60 * 1024 * 1024,
  /** At most this many pictures are read and decoded at the same moment. */
  concurrentLoads: 4,
} as const

export type LimitState = 'ok' | 'soft' | 'hard'

/** Where a map stands against the limits, and what to tell the person. */
export function limitState(count: number, bytes: number): { state: LimitState; message: string | null } {
  const mb = (bytes / 1048576).toFixed(0)
  if (count >= PICTURE_LIMITS.hardCount || bytes >= PICTURE_LIMITS.hardBytes) {
    return { state: 'hard', message: `This map has ${count} pictures (${mb} MB), which is the most one map can hold (${PICTURE_LIMITS.hardCount} pictures or ${PICTURE_LIMITS.hardBytes / 1048576 / 1024} GB). Use Optimize pictures, or remove some, before adding more.` }
  }
  if (count >= PICTURE_LIMITS.softCount || bytes >= PICTURE_LIMITS.softBytes) {
    return { state: 'soft', message: `This map has ${count} pictures (${mb} MB). It still works, but it will get slower. Optimize pictures can make them smaller.` }
  }
  return { state: 'ok', message: null }
}
