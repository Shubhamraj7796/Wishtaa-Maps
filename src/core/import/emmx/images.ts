export const MAX_IMPORT_IMAGE_BYTES = 10 * 1024 * 1024
/** Imported pictures keep their original bytes unless the longest side is above this. */
export const MAX_IMPORT_DIMENSION = 4000
/** Refuse pictures that would need a huge amount of memory to decode. */
export const MAX_IMPORT_PIXELS = 100_000_000

export type ImageKind = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

export type Detected =
  | { ok: true; type: ImageKind; width: number; height: number }
  | { ok: false; reason: 'svg' | 'unknown' | 'corrupt' }

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v)
const ascii = (b: Uint8Array, at: number, len: number) => String.fromCharCode(...b.subarray(at, at + len))
const u16be = (b: Uint8Array, at: number) => ((b[at] ?? 0) << 8) | (b[at + 1] ?? 0)
const u16le = (b: Uint8Array, at: number) => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8)
const u32be = (b: Uint8Array, at: number) => (((b[at] ?? 0) * 0x1000000) + (((b[at + 1] ?? 0) << 16) | ((b[at + 2] ?? 0) << 8) | (b[at + 3] ?? 0)))

function looksLikeSvgOrXml(b: Uint8Array): boolean {
  // Text that starts like an SVG or XML document (after a byte-order mark and spaces).
  let i = 0
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) i = 3
  while (i < b.length && i < 64 && (b[i] === 0x20 || b[i] === 0x0a || b[i] === 0x0d || b[i] === 0x09)) i++
  const head = ascii(b, i, 256).toLowerCase()
  return head.startsWith('<svg') || head.startsWith('<?xml') || head.startsWith('<!doctype svg') || head.includes('<svg')
}

function pngSize(b: Uint8Array) {
  if (b.length < 24 || ascii(b, 12, 4) !== 'IHDR') return null
  return { width: u32be(b, 16), height: u32be(b, 20) }
}

function gifSize(b: Uint8Array) {
  if (b.length < 10) return null
  return { width: u16le(b, 6), height: u16le(b, 8) }
}

function jpegSize(b: Uint8Array) {
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++
      continue
    }
    const marker = b[i + 1] as number
    if (marker === 0xff) {
      i++
      continue
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    const len = u16be(b, i + 2)
    if (len < 2) return null
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof) return { height: u16be(b, i + 5), width: u16be(b, i + 7) }
    i += 2 + len
  }
  return null
}

function webpSize(b: Uint8Array) {
  if (b.length < 30) return null
  const kind = ascii(b, 12, 4)
  if (kind === 'VP8 ') return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff }
  if (kind === 'VP8L') {
    if (b[20] !== 0x2f) return null
    const bits = (b[21] ?? 0) | ((b[22] ?? 0) << 8) | ((b[23] ?? 0) << 16) | ((b[24] ?? 0) * 0x1000000)
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  if (kind === 'VP8X') {
    const w = ((b[24] ?? 0) | ((b[25] ?? 0) << 8) | ((b[26] ?? 0) << 16)) + 1
    const h = ((b[27] ?? 0) | ((b[28] ?? 0) << 8) | ((b[29] ?? 0) << 16)) + 1
    return { width: w, height: h }
  }
  return null
}

/**
 * Works out what a picture really is from its first bytes (never from a file name) and reads its pixel size.
 * SVG and anything unrecognised is rejected.
 */
export function detectImage(bytes: Uint8Array): Detected {
  let type: ImageKind | null = null
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) type = 'image/png'
  else if (startsWith(bytes, [0xff, 0xd8, 0xff])) type = 'image/jpeg'
  else if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') type = 'image/gif'
  else if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') type = 'image/webp'
  if (!type) return { ok: false, reason: looksLikeSvgOrXml(bytes) ? 'svg' : 'unknown' }
  const size = type === 'image/png' ? pngSize(bytes) : type === 'image/jpeg' ? jpegSize(bytes) : type === 'image/gif' ? gifSize(bytes) : webpSize(bytes)
  if (!size || size.width < 1 || size.height < 1) return { ok: false, reason: 'corrupt' }
  return { ok: true, type, width: size.width, height: size.height }
}

/** SHA-256 of the bytes as hex, used to recognise the same picture used twice. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

const MIN_DISPLAY = 40
const MAX_DISPLAY_W = 1200
const MAX_DISPLAY_H = 2400

/**
 * The size a picture is shown at in a topic: the size it had in the original (or its own size when unknown), kept in
 * proportion and limited to the editor's rules (40 px at the smallest, 1200 wide, 2400 tall).
 */
export function displaySize(shapeWidth: number | null, shapeHeight: number | null, natural: { width: number; height: number }): { width: number; height: number } {
  let w = shapeWidth && shapeWidth > 0 ? shapeWidth : natural.width
  let h = shapeHeight && shapeHeight > 0 ? shapeHeight : natural.height
  const f = Math.min(1, MAX_DISPLAY_W / w, MAX_DISPLAY_H / h)
  w *= f
  h *= f
  return { width: Math.max(MIN_DISPLAY, Math.round(w)), height: Math.max(MIN_DISPLAY, Math.round(h)) }
}
