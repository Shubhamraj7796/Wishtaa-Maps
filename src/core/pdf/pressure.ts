import type { Point } from '@/core/pdf/types'

/**
 * Stylus pressure. A pen stroke may carry one pressure (0 to 1) per point. The line is drawn thicker where the pen was pressed harder:
 * at half pressure (what a mouse or a pen without pressure reports) the line has exactly the width chosen on the bar.
 */
export const widthFactor = (pressure: number) => 0.35 + 1.3 * Math.min(1, Math.max(0, pressure))

/** The width of each segment of a stroke (one fewer than the points): the average of its two ends. */
export function segmentWidths(base: number, pressure: readonly number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < pressure.length; i++) out.push(base * widthFactor(((pressure[i - 1] as number) + (pressure[i] as number)) / 2))
  return out
}

/** A stroke's pressures are used only when there is one per point (anything else is ignored, so a damaged value never breaks a drawing). */
export const pressureOf = (points: readonly Point[] | undefined, pressure: readonly number[] | undefined): number[] | null =>
  points && pressure && pressure.length === points.length && points.length > 1 && pressure.every((p) => Number.isFinite(p)) ? [...pressure] : null

/** Whether a run of readings really varies. A mouse, and a pen that cannot sense pressure, report a steady 0.5 (or 0 or 1). */
export const variesPressure = (readings: readonly number[]) => readings.some((p) => Math.abs(p - 0.5) > 0.02) && new Set(readings.map((p) => Math.round(p * 20))).size > 1

/** Pressure kept small: two decimals. */
export const roundPressure = (readings: readonly number[]) => readings.map((p) => Math.round(Math.min(1, Math.max(0, p)) * 100) / 100)
