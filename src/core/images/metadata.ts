/** JPEG and PNG housekeeping done on the bytes themselves, so a picture can keep its pixels exactly and still lose its location data. */

const isJpeg = (b: Uint8Array) => b.length > 4 && b[0] === 0xff && b[1] === 0xd8
const isPng = (b: Uint8Array) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47

/** The EXIF orientation of a JPEG (1 to 8; 1 = upright, also when there is none). */
export function jpegOrientation(bytes: Uint8Array): number {
  if (!isJpeg(bytes)) return 1
  let i = 2
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) return 1
    const marker = bytes[i + 1] as number
    if (marker === 0xda || marker === 0xd9) return 1
    const len = ((bytes[i + 2] as number) << 8) | (bytes[i + 3] as number)
    if (marker === 0xe1 && bytes[i + 4] === 0x45 && bytes[i + 5] === 0x78 && bytes[i + 6] === 0x69 && bytes[i + 7] === 0x66) {
      const t = i + 10 // start of the TIFF header
      const little = bytes[t] === 0x49
      const u16 = (o: number) => (little ? (bytes[o] as number) | ((bytes[o + 1] as number) << 8) : ((bytes[o] as number) << 8) | (bytes[o + 1] as number))
      const u32 = (o: number) => (little ? (u16(o) | (u16(o + 2) << 16)) >>> 0 : ((u16(o) << 16) | u16(o + 2)) >>> 0)
      const ifd = t + u32(t + 4)
      const n = u16(ifd)
      for (let k = 0; k < n; k++) {
        const e = ifd + 2 + k * 12
        if (u16(e) === 0x0112) {
          const v = u16(e + 8)
          return v >= 1 && v <= 8 ? v : 1
        }
      }
      return 1
    }
    i += 2 + len
  }
  return 1
}

/** Removes EXIF, XMP and other metadata segments (location, camera, time) from a JPEG without touching the picture. */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (!isJpeg(bytes)) return bytes
  const out: number[] = [0xff, 0xd8]
  let i = 2
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) break
    const marker = bytes[i + 1] as number
    if (marker === 0xda) break // start of the picture data: copy the rest as it is
    const len = ((bytes[i + 2] as number) << 8) | (bytes[i + 3] as number)
    const drop = marker === 0xe1 || marker === 0xed || marker === 0xfe || (marker >= 0xe3 && marker <= 0xef && marker !== 0xee)
    if (!drop) for (let k = 0; k < 2 + len; k++) out.push(bytes[i + k] as number)
    i += 2 + len
  }
  const head = Uint8Array.from(out)
  const merged = new Uint8Array(head.length + (bytes.length - i))
  merged.set(head)
  merged.set(bytes.subarray(i), head.length)
  return merged
}

const PNG_DROP = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME'])

/** Removes the text and EXIF chunks of a PNG, keeping every pixel. */
export function stripPngMetadata(bytes: Uint8Array): Uint8Array {
  if (!isPng(bytes)) return bytes
  const parts: Uint8Array[] = [bytes.subarray(0, 8)]
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let i = 8
  while (i + 12 <= bytes.length) {
    const len = view.getUint32(i)
    const type = String.fromCharCode(bytes[i + 4] as number, bytes[i + 5] as number, bytes[i + 6] as number, bytes[i + 7] as number)
    const end = i + 12 + len
    if (end > bytes.length) break
    if (!PNG_DROP.has(type)) parts.push(bytes.subarray(i, end))
    i = end
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

export const stripMetadata = (bytes: Uint8Array): Uint8Array => (isJpeg(bytes) ? stripJpegMetadata(bytes) : isPng(bytes) ? stripPngMetadata(bytes) : bytes)

/** A picture type the browsers decode but that carries nothing we can strip losslessly. */
export const hasLosslessStrip = (type: string) => type === 'image/jpeg' || type === 'image/png'
