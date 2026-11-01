/** How much of the editor the PDF takes: its normal share, about 70%, or all of it. */
export type PanelSize = 'normal' | 'wide' | 'full'

const ORDER: readonly PanelSize[] = ['normal', 'wide', 'full']
export const nextSize = (s: PanelSize): PanelSize => ORDER[(ORDER.indexOf(s) + 1) % ORDER.length] as PanelSize

export const SIZE_LABEL: Record<PanelSize, string> = { normal: 'Normal', wide: 'Wide', full: 'Full screen' }

export const MIN_SIDE = 280
export const MIN_MAIN = 320
export const DEFAULT_SIDE = 460

/** The width of the side panel as a person set it, kept inside what the window allows. */
export function clampSide(width: number, available: number): number {
  return Math.round(Math.min(Math.max(MIN_SIDE, width), Math.max(MIN_SIDE, available - MIN_MAIN)))
}

const KEY_W = 'wishtaamaps:pdf-width'
const KEY_H = 'wishtaamaps:pdf-height'
const KEY_SIZE = 'wishtaamaps:pdf-size'

const readNumber = (k: string, d: number) => {
  try {
    const v = Number(localStorage.getItem(k))
    return Number.isFinite(v) && v > 0 ? v : d
  } catch {
    return d
  }
}
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* not remembered */
  }
}

export const loadSideWidth = () => readNumber(KEY_W, DEFAULT_SIDE)
export const saveSideWidth = (w: number) => write(KEY_W, String(Math.round(w)))
export const loadSheetHeight = () => readNumber(KEY_H, 360)
export const saveSheetHeight = (h: number) => write(KEY_H, String(Math.round(h)))

/** What size the panel starts in: full screen for a portrait touch screen, otherwise the size it was last left in (never full). */
export function startingSize(touch: boolean, portrait: boolean): PanelSize {
  if (touch && portrait) return 'full'
  try {
    const s = localStorage.getItem(KEY_SIZE)
    if (s === 'wide' || s === 'normal') return s
  } catch {
    /* default */
  }
  return 'normal'
}
export const rememberSize = (s: PanelSize) => {
  if (s !== 'full') write(KEY_SIZE, s)
}
