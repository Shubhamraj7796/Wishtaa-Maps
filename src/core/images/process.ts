export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_STORED_DIMENSION = 1600
export const WEBP_QUALITY = 0.85

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/avif'])

export class ImageError extends Error {}

/** Returns a friendly message if the file can't be used, otherwise null. */
export function validateImageFile(file: { type: string; size: number }): string | null {
  if (file.type === 'image/svg+xml') return "SVG images aren't supported yet. Please use a PNG, JPEG or WebP file."
  if (!file.type.startsWith('image/') || !ALLOWED.has(file.type)) {
    return 'Only image files (PNG, JPEG, WebP, GIF) can be added to a topic.'
  }
  if (file.size > MAX_IMAGE_BYTES) return 'That image is larger than 10 MB. Please choose a smaller one.'
  if (file.size === 0) return 'That image file is empty.'
  return null
}

/** Fits a size inside `max` on its longest side without ever scaling up. */
export function fitWithin(width: number, height: number, max = MAX_STORED_DIMENSION): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= max || longest <= 0) return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) }
  const f = max / longest
  return { width: Math.max(1, Math.round(width * f)), height: Math.max(1, Math.round(height * f)) }
}

/** Encoding to use when the browser can't produce WebP: JPEG stays JPEG, everything else keeps transparency as PNG. */
export function fallbackType(sourceType: string): 'image/jpeg' | 'image/png' {
  return sourceType === 'image/jpeg' ? 'image/jpeg' : 'image/png'
}

export interface ProcessedImage {
  blob: Blob
  width: number
  height: number
  type: string
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/** Validates, downsizes to 1600px and re-encodes as WebP (JPEG/PNG fallback). */
export async function processImageFile(file: Blob): Promise<ProcessedImage> {
  const problem = validateImageFile(file)
  if (problem) throw new ImageError(problem)

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new ImageError("Couldn't read that image. It may be damaged or in an unsupported format.")
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ImageError("Couldn't process that image in this browser.")
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  let blob = await toBlob(canvas, 'image/webp', WEBP_QUALITY)
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, fallbackType(file.type), WEBP_QUALITY)
  if (!blob) throw new ImageError("Couldn't process that image in this browser.")
  return { blob, width, height, type: blob.type }
}

/**
 * Reduces a picture so its longest side is `max` px, keeping its format (a GIF becomes a PNG) and aspect ratio.
 * Used only for very large imported pictures; everything else keeps its original bytes.
 */
export async function downscaleImage(blob: Blob, max: number): Promise<ProcessedImage> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    throw new ImageError("Couldn't read that image. It may be damaged or in an unsupported format.")
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, max)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ImageError("Couldn't process that image in this browser.")
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const type = blob.type === 'image/jpeg' || blob.type === 'image/webp' ? blob.type : 'image/png'
  const out = await toBlob(canvas, type, 0.92)
  if (!out) throw new ImageError("Couldn't process that image in this browser.")
  return { blob: out, width, height, type: out.type || type }
}
