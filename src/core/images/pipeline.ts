import { clampRect, fullRect, type Rect } from './crop'
import { jpegOrientation, stripMetadata } from './metadata'
import { compressedSize, HIGH, hardLimitProblem, looksTextHeavy, pickSmallest, qualityFor, type PixelStats } from './plan'
import { ImageError } from './process'

/** The few things the pipeline needs from a browser. Tests give it a fake; the app gives it canvases and createImageBitmap. */
export interface Decoded {
  width: number
  height: number
  close(): void
  raw: unknown
}
export interface Raster {
  width: number
  height: number
  /** RGBA pixels (a small sample is enough). */
  pixels(): { data: ArrayLike<number> }
  raw: unknown
}
export type Rotation = 0 | 90 | 180 | 270
export interface RenderOptions {
  /** The part to keep, in the coordinates of the picture AFTER rotating. */
  crop: Rect
  rotate: Rotation
  width: number
  height: number
}
export interface Codec {
  /** Decodes with the EXIF orientation applied. */
  decode(blob: Blob): Promise<Decoded>
  render(src: Decoded, o: RenderOptions): Promise<Raster>
  encode(r: Raster, type: string, quality: number): Promise<Blob | null>
  canEncode(type: string): Promise<boolean>
}

export interface Edit {
  /** In the coordinates of the rotated picture. Left out = the whole picture. */
  crop?: Rect
  rotate?: Rotation
}

export interface Candidate {
  blob: Blob
  width: number
  height: number
  type: string
}

export interface Analysis {
  /** The picture as it is (after cropping), or null when it cannot be used at all (see `originalProblem`). */
  original: Candidate | null
  originalProblem: string | null
  /** The readable, smaller version. */
  compressed: Candidate
  stats: PixelStats
  /** Size of the picture before cropping. */
  source: { width: number; height: number; bytes: number }
}

const rotatedSize = (w: number, h: number, r: Rotation) => (r === 90 || r === 270 ? { w: h, h: w } : { w, h })
const SAMPLE = 160

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

/** Encodes the allowed candidates and returns the smallest. */
async function encodeBest(codec: Codec, raster: Raster, stats: PixelStats, quality: number, types: string[]): Promise<Candidate> {
  const found: { blob: Blob; type: string; size: number }[] = []
  for (const type of types) {
    if (type === 'image/jpeg' && stats.hasAlpha) continue // JPEG would turn transparency black
    if (type === 'image/webp' && !(await codec.canEncode('image/webp'))) continue // Safari quietly returns PNG
    const blob = await codec.encode(raster, type, quality)
    if (blob && blob.type === type) found.push({ blob, type, size: blob.size })
  }
  const best = pickSmallest(found, stats)
  if (!best) throw new ImageError("Couldn't process that image in this browser.")
  return { blob: best.blob, width: raster.width, height: raster.height, type: best.type }
}

/**
 * Works out both versions of a picture: as it is (after the crop and rotation, EXIF removed, orientation fixed) and the
 * compressed readable one. Nothing is stored here.
 */
export async function analyze(source: Blob, edit: Edit, codec: Codec): Promise<Analysis> {
  let decoded: Decoded
  try {
    decoded = await codec.decode(source)
  } catch {
    throw new ImageError("Couldn't read that image. It may be damaged or in an unsupported format. If it is a HEIC photo, choose “Most compatible” in your camera settings.")
  }
  try {
    const rotate = edit.rotate ?? 0
    const rs = rotatedSize(decoded.width, decoded.height, rotate)
    const crop = clampRect(edit.crop ?? fullRect({ w: rs.w, h: rs.h }), { w: rs.w, h: rs.h })
    const whole = crop.x === 0 && crop.y === 0 && crop.w === rs.w && crop.h === rs.h && rotate === 0

    const sample = await codec.render(decoded, { crop, rotate, ...fitTo(crop.w, crop.h, SAMPLE) })
    const stats = looksTextHeavy(sample.pixels().data, sample.width, sample.height)

    // --- compressed ---
    const target = compressedSize(crop.w, crop.h, stats.textHeavy)
    const raster = await codec.render(decoded, { crop, rotate, width: target.width, height: target.height })
    const compressed = await encodeBest(codec, raster, stats, qualityFor('compressed'), ['image/webp', 'image/jpeg', 'image/png'])

    // --- original ---
    const bytes = await bytesOf(source)
    let original: Candidate | null = null
    let originalProblem: string | null = null
    const upright = jpegOrientation(bytes) === 1
    if (whole && upright) {
      // Untouched pixels: only the metadata (location, camera, time) goes.
      const clean = stripMetadata(bytes)
      original = { blob: new Blob([clean as BlobPart], { type: source.type }), width: decoded.width, height: decoded.height, type: source.type }
    } else if (Math.max(crop.w, crop.h) > 4000) {
      originalProblem = hardLimitProblem(0, crop.w, crop.h)
    } else {
      const full = await codec.render(decoded, { crop, rotate, width: crop.w, height: crop.h })
      original = await encodeBest(codec, full, stats, 0.95, ['image/png', 'image/webp', 'image/jpeg'])
    }
    if (original) originalProblem = hardLimitProblem(original.blob.size, original.width, original.height)
    if (originalProblem) original = null
    return { original, originalProblem, compressed, stats, source: { width: decoded.width, height: decoded.height, bytes: source.size } }
  } finally {
    decoded.close()
  }
}

function fitTo(w: number, h: number, max: number) {
  const f = Math.min(1, max / Math.max(w, h))
  return { width: Math.max(1, Math.round(w * f)), height: Math.max(1, Math.round(h * f)) }
}

/** The "High" choice behind "More options": up to 2400 px at about 0.92 quality. */
export async function analyzeHigh(source: Blob, edit: Edit, codec: Codec, stats: PixelStats): Promise<Candidate> {
  const decoded = await codec.decode(source)
  try {
    const rotate = edit.rotate ?? 0
    const rs = rotatedSize(decoded.width, decoded.height, rotate)
    const crop = clampRect(edit.crop ?? fullRect({ w: rs.w, h: rs.h }), { w: rs.w, h: rs.h })
    const size = fitTo(crop.w, crop.h, HIGH.maxSide)
    const raster = await codec.render(decoded, { crop, rotate, ...size })
    return await encodeBest(codec, raster, stats, qualityFor('high'), ['image/webp', 'image/jpeg', 'image/png'])
  } finally {
    decoded.close()
  }
}

/** The candidate for a choice. The hard limits are explained, not hidden, when the original cannot be used. */
export function pick(a: Analysis, choice: 'compressed' | 'original'): Candidate {
  if (choice === 'compressed') return a.compressed
  if (!a.original) throw new ImageError(a.originalProblem ?? 'That picture is too large to keep as it is. Choose Compressed.')
  return a.original
}
