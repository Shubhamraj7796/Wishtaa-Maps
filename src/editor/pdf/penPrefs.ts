/**
 * How the pen behaves, kept on this device (not in the map): stylus pressure, straight-angle correction, palm rejection and "stylus only".
 * Read at the moment a stroke starts, so a change applies to the next stroke.
 */
export interface PenPrefs {
  /** A stylus that reports pressure makes the line thicker when pressed harder. */
  pressure: boolean
  /** Hold the pen still at the end of a stroke and a nearly straight stroke becomes a straight line (and a hooked end an arrow). */
  snapLines: boolean
  /** The same for a nearly closed stroke: it becomes a clean rectangle, circle or ellipse. */
  snapShapes: boolean
  /** A hand resting on the screen does not draw: not after a pen has been used, not while it is down, and not a very large touch. */
  palm: boolean
  /** Only a stylus (or a mouse) draws; a finger always pans and zooms. */
  stylusOnly: boolean
}

export const DEFAULT_PEN: PenPrefs = { pressure: true, snapLines: true, snapShapes: true, palm: true, stylusOnly: false }

const KEY = 'wishtaamaps:pen-prefs'

export function sanitizePen(raw: Partial<Record<keyof PenPrefs, unknown>> | null | undefined): PenPrefs {
  const on = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
  return {
    pressure: on(raw?.pressure, DEFAULT_PEN.pressure),
    snapLines: on(raw?.snapLines, DEFAULT_PEN.snapLines),
    snapShapes: on(raw?.snapShapes, DEFAULT_PEN.snapShapes),
    palm: on(raw?.palm, DEFAULT_PEN.palm),
    stylusOnly: on(raw?.stylusOnly, DEFAULT_PEN.stylusOnly),
  }
}

export function loadPen(): PenPrefs {
  try {
    return sanitizePen(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
  } catch {
    return DEFAULT_PEN
  }
}

let current: PenPrefs | null = null
const listeners = new Set<() => void>()

/** The settings now (read once from this device, then kept in memory). */
export function getPen(): PenPrefs {
  return (current ??= loadPen())
}

export function setPen(change: Partial<PenPrefs>) {
  current = sanitizePen({ ...getPen(), ...change })
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* not remembered */
  }
  listeners.forEach((l) => l())
}

/** Back to the starting settings. */
export function resetPen() {
  current = DEFAULT_PEN
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing to forget */
  }
  listeners.forEach((l) => l())
}

export const subscribePen = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))
/** For tests: forget what was read, so the next read comes from storage. */
export const forgetPen = () => {
  current = null
}
