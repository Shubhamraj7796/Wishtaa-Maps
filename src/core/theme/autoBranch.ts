/**
 * Automatic branch thickness: a branch is as bold as the topic it leads to is big, so a map of 700 px wide topics gets
 * heavy branches and a small map stays modest. It is worked out from the map (topic sizes and depth), never from the zoom.
 * Every number lives here.
 */
export const AUTO_BRANCH = {
  /** Thickness per px of the larger side of the child topic (at depth 1). */
  k: 0.025,
  /** Level-1 branches stay between these (map px). */
  level1Min: 4,
  level1Max: 28,
  /** Each level down is this fraction as thick as the one above (25% thinner). */
  perLevel: 0.75,
  /** No branch is thinner than this (map px). */
  minThickness: 2,
  /** A branch that is tapered ends this fraction as thick as it starts, never under `minEnd`. */
  taperEnd: 0.3,
  minEnd: 0.8,
  /** The central topic's larger side that counts as "normal"; bigger centres give bolder lines, smaller ones lighter. */
  centralReference: 200,
  centralScaleMin: 0.8,
  centralScaleMax: 1.5,
  /** However far out the map is zoomed, a branch is drawn at least this wide on screen (px). */
  minOnScreen: 1.5,
} as const

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const r2 = (n: number) => Math.round(n * 100) / 100

/** Gentle scaling with the central topic: its size relative to the reference, softened with a square root. */
export function centralScale(centralSize: number): number {
  if (!Number.isFinite(centralSize) || centralSize <= 0) return 1
  return clamp(Math.sqrt(centralSize / AUTO_BRANCH.centralReference), AUTO_BRANCH.centralScaleMin, AUTO_BRANCH.centralScaleMax)
}

/** The factor for a depth: 1 at the first level, 25% thinner each level down. */
export const depthFactor = (depth: number) => Math.pow(AUTO_BRANCH.perLevel, Math.max(0, depth - 1))

/**
 * The automatic thickness of the branch leading to a topic `depth` levels from the centre (1 = a main topic).
 * `childSize` is the larger side of that topic, `centralSize` the larger side of the central topic.
 */
export function autoThickness(depth: number, childSize: number, centralSize: number): number {
  const d = Math.max(1, depth)
  const raw = AUTO_BRANCH.k * Math.max(0, childSize) * centralScale(centralSize) * depthFactor(d)
  const lo = d === 1 ? AUTO_BRANCH.level1Min : AUTO_BRANCH.minThickness
  const hi = Math.max(lo, AUTO_BRANCH.level1Max * depthFactor(d))
  return r2(clamp(raw, lo, hi))
}

/**
 * What is drawn at a zoom of `k`: widths are in map units (they scale with the map), but never less than `minOnScreen`
 * px on screen, so a zoomed-out map still shows its branches.
 */
export function onScreenWidths(width: number, endWidth: number, k: number): { width: number; endWidth: number } {
  const floor = k > 0 ? AUTO_BRANCH.minOnScreen / k : width
  const w = Math.max(width, floor)
  return { width: r2(w), endWidth: r2(Math.min(w, Math.max(endWidth, floor))) }
}
