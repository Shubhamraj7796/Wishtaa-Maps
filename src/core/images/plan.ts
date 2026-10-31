import { fitWithin } from './process'

/** What a picture may be at most, whatever the person chooses. */
export const HARD_LIMITS = { maxBytes: 10 * 1024 * 1024, maxSide: 4000 } as const

/** "Compressed (readable)": pictures only need to be readable. */
export const COMPRESSED = { maxSide: 1280, quality: 0.8, minQuality: 0.78, textMinSide: 900 } as const
/** The advanced choice, behind "More options". */
export const HIGH = { maxSide: 2400, quality: 0.92 } as const

/** The question is only asked when compressing saves something worth the question. */
export const ASK_THRESHOLD = { fraction: 0.25, bytes: 30 * 1024 } as const

export type PictureChoice = 'compressed' | 'original' | 'high'
/** The saved preference: ask each time, always compress, or always keep the original. */
export type PicturesPref = 'ask' | 'compress' | 'original'

export const saved = (original: number, compressed: number) => Math.max(0, original - compressed)

/** True when compressing saves at least a quarter AND at least 30 KB. Small files and small savings are never worth a question. */
export function shouldAsk(originalBytes: number, compressedBytes: number): boolean {
  const s = saved(originalBytes, compressedBytes)
  return s >= ASK_THRESHOLD.bytes && originalBytes > 0 && s / originalBytes >= ASK_THRESHOLD.fraction
}

export interface Decision {
  /** Show the choice. */
  ask: boolean
  /** What to use when not asking (or the pre-selected choice when asking). */
  use: 'compressed' | 'original'
}

/**
 * What to do with a picture given the saved preference and the two sizes.
 *  - Ask each time: ask only when compression would help meaningfully; otherwise keep the picture as it is, silently.
 *  - Always compress: compress whenever that makes it smaller; never ask.
 *  - Always keep original: keep it; never ask.
 */
export function decide(pref: PicturesPref, originalBytes: number, compressedBytes: number | null): Decision {
  if (compressedBytes === null || pref === 'original') return { ask: false, use: 'original' }
  if (pref === 'compress') return { ask: false, use: compressedBytes < originalBytes ? 'compressed' : 'original' }
  return shouldAsk(originalBytes, compressedBytes) ? { ask: true, use: 'compressed' } : { ask: false, use: 'original' }
}

/** The size a picture is stored at when compressed: within 1280 px on its longest side, never enlarged. */
export function compressedSize(width: number, height: number, textHeavy: boolean): { width: number; height: number } {
  const fit = fitWithin(width, height, COMPRESSED.maxSide)
  if (!textHeavy) return fit
  // Readability guard: text is never shrunk below 900 px on its longer side (unless the picture is smaller to begin with).
  const floor = Math.min(Math.max(width, height), COMPRESSED.textMinSide)
  return Math.max(fit.width, fit.height) >= floor ? fit : fitWithin(width, height, floor)
}

/** Encoding quality: 0.8, and never under 0.78 for anything. */
export const qualityFor = (preset: 'compressed' | 'high' = 'compressed') => (preset === 'high' ? HIGH.quality : Math.max(COMPRESSED.minQuality, COMPRESSED.quality))

/** A reason the picture cannot be used at all (too many bytes or pixels), in plain words, or null. */
export function hardLimitProblem(bytes: number, width: number, height: number): string | null {
  if (bytes > HARD_LIMITS.maxBytes) return `That picture is ${(bytes / 1048576).toFixed(1)} MB. The limit is 10 MB. Choose Compressed to make it smaller, or pick a smaller file.`
  if (Math.max(width, height) > HARD_LIMITS.maxSide) return `That picture is ${Math.max(width, height)} px wide or tall. The limit for an original is ${HARD_LIMITS.maxSide} px. Choose Compressed, or crop it.`
  return null
}

export interface PixelStats {
  /** Few flat colours, like a screenshot or a diagram: PNG may beat WebP and JPEG. */
  flat: boolean
  /** Mostly background with sharp edges: small text that must stay readable. */
  textHeavy: boolean
  hasAlpha: boolean
}

/** Looks at (a sample of) the pixels to tell a screenshot with text from a photograph. */
export function looksTextHeavy(rgba: ArrayLike<number>, width: number, height: number): PixelStats {
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 40000)))
  const colours = new Map<number, number>()
  let n = 0
  let edges = 0
  let alpha = false
  const lum = (i: number) => 0.299 * (rgba[i] as number) + 0.587 * (rgba[i + 1] as number) + 0.114 * (rgba[i + 2] as number)
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4
      if ((rgba[i + 3] as number) < 250) alpha = true
      const key = (((rgba[i] as number) >> 4) << 8) | (((rgba[i + 1] as number) >> 4) << 4) | ((rgba[i + 2] as number) >> 4)
      colours.set(key, (colours.get(key) ?? 0) + 1)
      n++
      if (x + step < width && Math.abs(lum(i) - lum(i + step * 4)) > 48) edges++
    }
  }
  const top = Math.max(...colours.values())
  const bgShare = n ? top / n : 0
  const edgeShare = n ? edges / n : 0
  const flat = colours.size <= 64
  return { flat, textHeavy: bgShare > 0.4 && edgeShare > 0.015 && colours.size <= 200, hasAlpha: alpha }
}

export interface Candidate {
  type: string
  size: number
}

/** The smallest of the encodings that are allowed for this picture. PNG only competes for flat-colour pictures. */
export function pickSmallest<T extends Candidate>(candidates: T[], stats: Pick<PixelStats, 'flat'>): T | null {
  const allowed = candidates.filter((c) => c.type !== 'image/png' || stats.flat)
  const pool = allowed.length ? allowed : candidates
  return pool.reduce<T | null>((best, c) => (best === null || c.size < best.size ? c : best), null)
}
