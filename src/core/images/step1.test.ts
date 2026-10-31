import { describe, expect, it, vi } from 'vitest'
import { clampRect, dragRect, fullRect, hitHandle, nudgeRect, rotateRect, zoomView, clampView, MIN_CROP, type Rect } from './crop'
import { hasLosslessStrip, jpegOrientation, stripJpegMetadata, stripMetadata, stripPngMetadata } from './metadata'
import { analyze, pick } from './pipeline'
import { fakeCodec, pixels, source } from '../../test/fakeCodec'
import { ASK_THRESHOLD, COMPRESSED, compressedSize, decide, hardLimitProblem, HARD_LIMITS, looksTextHeavy, pickSmallest, qualityFor, shouldAsk } from './plan'
import { ImageError } from './process'
import { pictureId, sha256Hex, sha256HexSync } from './sha256'

const utf8 = (s: string) => new TextEncoder().encode(s)

describe('hashing', () => {
  it('matches the standard test vectors, in both versions', async () => {
    const abc = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    const empty = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    expect(sha256HexSync(utf8('abc'))).toBe(abc)
    expect(sha256HexSync(new Uint8Array())).toBe(empty)
    expect(await sha256Hex(utf8('abc'))).toBe(abc)
    expect(sha256HexSync(utf8('a'.repeat(1000)))).toBe(await sha256Hex(utf8('a'.repeat(1000))))
  })

  it('works where the browser has no secure hashing (plain http development)', async () => {
    vi.stubGlobal('crypto', undefined)
    expect(await sha256Hex(utf8('abc'))).toMatch(/^ba7816bf/)
    vi.unstubAllGlobals()
  })

  it('the picture id comes from the content: same bytes, same id', async () => {
    const a = pictureId(await sha256Hex(utf8('same')))
    const b = pictureId(await sha256Hex(utf8('same')))
    const c = pictureId(await sha256Hex(utf8('different')))
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^p-[0-9a-f]{40}$/)
  })
})

/** A tiny JPEG with an EXIF block (orientation + a GPS-like tag), an XMP block and a comment. */
function jpegWithExif(orientation: number): Uint8Array {
  const tiff = [0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 2, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0, 0x25, 0x88, 4, 0, 1, 0, 0, 0, 99, 0, 0, 0, 0, 0, 0, 0]
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
  const seg = (marker: number, body: number[]) => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 255, ...body]
  const dqt = seg(0xdb, [0, 1, 2, 3])
  return Uint8Array.from([0xff, 0xd8, ...seg(0xe1, exif), ...seg(0xe1, [...utf8('http://ns.adobe.com/xap/1.0/\0'), 1, 2]), ...seg(0xfe, [...utf8('hello')]), ...dqt, 0xff, 0xda, 0, 3, 0, 7, 7, 7, 0xff, 0xd9])
}

describe('metadata', () => {
  it('reads the EXIF orientation', () => {
    expect(jpegOrientation(jpegWithExif(6))).toBe(6)
    expect(jpegOrientation(jpegWithExif(1))).toBe(1)
    expect(jpegOrientation(jpegWithExif(8))).toBe(8)
    expect(jpegOrientation(utf8('not a jpeg'))).toBe(1)
  })

  it('removes EXIF, XMP and comments from a JPEG but keeps the picture data exactly', () => {
    const src = jpegWithExif(6)
    const out = stripJpegMetadata(src)
    expect(out.length).toBeLessThan(src.length)
    expect(jpegOrientation(out)).toBe(1)
    expect(new TextDecoder('latin1').decode(out)).not.toMatch(/Exif|adobe|hello/)
    expect([...out.slice(0, 2)]).toEqual([0xff, 0xd8])
    expect([...out.slice(-12)]).toEqual([...src.slice(-12)]) // scan data and end marker untouched
  })

  it('removes the text and EXIF chunks of a PNG, keeping the pixels', () => {
    const chunk = (type: string, data: number[]) => [0, 0, 0, data.length, ...utf8(type), ...data, 0, 0, 0, 0]
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, ...chunk('IHDR', new Array(13).fill(1)), ...chunk('tEXt', [65, 0, 66]), ...chunk('eXIf', [1, 2, 3]), ...chunk('IDAT', [9, 9]), ...chunk('IEND', [])])
    const out = stripPngMetadata(png)
    const text = new TextDecoder('latin1').decode(out)
    expect(text).toContain('IHDR')
    expect(text).toContain('IDAT')
    expect(text).toContain('IEND')
    expect(text).not.toMatch(/tEXt|eXIf/)
  })

  it('leaves other formats alone', () => {
    const webp = utf8('RIFFxxxxWEBP')
    expect(stripMetadata(webp)).toBe(webp)
    expect(hasLosslessStrip('image/jpeg')).toBe(true)
    expect(hasLosslessStrip('image/webp')).toBe(false)
  })
})

describe('when to ask, and what to do', () => {
  const KB = 1024
  it('asks only when compressing saves at least a quarter AND at least 30 KB', () => {
    expect(ASK_THRESHOLD).toEqual({ fraction: 0.25, bytes: 30 * KB })
    expect(shouldAsk(1000 * KB, 300 * KB)).toBe(true)
    expect(shouldAsk(100 * KB, 60 * KB)).toBe(true) // 40 KB, 40%
    expect(shouldAsk(100 * KB, 90 * KB)).toBe(false) // saves little
    expect(shouldAsk(20 * KB, 4 * KB)).toBe(false) // 80% but only 16 KB: tiny file
    expect(shouldAsk(1000 * KB, 800 * KB)).toBe(false) // 200 KB but only 20%
    expect(shouldAsk(0, 0)).toBe(false)
    expect(shouldAsk(100 * KB, 200 * KB)).toBe(false) // it would grow
  })

  it('Ask each time: asks when it helps, otherwise keeps the picture as it is, silently', () => {
    expect(decide('ask', 1000 * KB, 200 * KB)).toEqual({ ask: true, use: 'compressed' })
    expect(decide('ask', 40 * KB, 30 * KB)).toEqual({ ask: false, use: 'original' })
    expect(decide('ask', 100 * KB, null)).toEqual({ ask: false, use: 'original' })
  })

  it('Always compress: never asks; compresses when that makes it smaller', () => {
    expect(decide('compress', 1000 * KB, 200 * KB)).toEqual({ ask: false, use: 'compressed' })
    expect(decide('compress', 100 * KB, 150 * KB)).toEqual({ ask: false, use: 'original' })
  })

  it('Always keep original: never asks, never compresses', () => {
    expect(decide('original', 5000 * KB, 100 * KB)).toEqual({ ask: false, use: 'original' })
  })
})

describe('sizes and the readability guard', () => {
  it('compressed is at most 1280 px on the longest side and never enlarged', () => {
    expect(compressedSize(4000, 3000, false)).toEqual({ width: 1280, height: 960 })
    expect(compressedSize(3000, 4000, false)).toEqual({ width: 960, height: 1280 })
    expect(compressedSize(800, 600, false)).toEqual({ width: 800, height: 600 })
    expect(compressedSize(100, 80, false)).toEqual({ width: 100, height: 80 })
  })

  it('text is never shrunk below 900 px on its longer side unless it started smaller', () => {
    const t = compressedSize(5000, 2000, true)
    expect(Math.max(t.width, t.height)).toBeGreaterThanOrEqual(900)
    expect(compressedSize(600, 400, true)).toEqual({ width: 600, height: 400 })
    expect(COMPRESSED.textMinSide).toBe(900)
  })

  it('quality is about 0.8 and never under 0.78', () => {
    expect(qualityFor('compressed')).toBeGreaterThanOrEqual(0.78)
    expect(qualityFor('compressed')).toBeCloseTo(0.8)
    expect(qualityFor('high')).toBeCloseTo(0.92)
  })

  it('the hard limits are 10 MB and 4000 px, with a plain explanation', () => {
    expect(HARD_LIMITS).toEqual({ maxBytes: 10485760, maxSide: 4000 })
    expect(hardLimitProblem(5 * 1048576, 3000, 2000)).toBeNull()
    expect(hardLimitProblem(11 * 1048576, 3000, 2000)).toMatch(/limit is 10 MB/)
    expect(hardLimitProblem(1000, 4500, 100)).toMatch(/4000 px/)
  })
})

describe('telling text and diagrams from photographs', () => {
  it('a photograph is neither flat nor text', () => {
    let seed = 7
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 255
    const s = looksTextHeavy(pixels(200, 200, () => [rnd(), rnd(), rnd(), 255]), 200, 200)
    expect(s.flat).toBe(false)
    expect(s.textHeavy).toBe(false)
  })

  it('white with dark strokes is text-heavy and flat', () => {
    const s = looksTextHeavy(pixels(200, 200, (x, y) => (x % 7 === 0 && y % 3 !== 0 ? [20, 20, 20, 255] : [255, 255, 255, 255])), 200, 200)
    expect(s.textHeavy).toBe(true)
    expect(s.flat).toBe(true)
  })

  it('notices transparency', () => {
    expect(looksTextHeavy(pixels(50, 50, () => [0, 0, 0, 0]), 50, 50).hasAlpha).toBe(true)
    expect(looksTextHeavy(pixels(50, 50, () => [0, 0, 0, 255]), 50, 50).hasAlpha).toBe(false)
  })

  it('PNG competes only for flat pictures; otherwise the smallest of the rest', () => {
    const c = [
      { type: 'image/png', size: 10 },
      { type: 'image/webp', size: 50 },
      { type: 'image/jpeg', size: 80 },
    ]
    expect(pickSmallest(c, { flat: true })?.type).toBe('image/png')
    expect(pickSmallest(c, { flat: false })?.type).toBe('image/webp')
    expect(pickSmallest([], { flat: true })).toBeNull()
  })
})

describe('crop maths', () => {
  const b = { w: 1000, h: 600 }

  it('clamps inside the picture with a minimum size', () => {
    expect(clampRect({ x: -50, y: -10, w: 200, h: 100 }, b)).toEqual({ x: 0, y: 0, w: 200, h: 100 })
    expect(clampRect({ x: 950, y: 590, w: 200, h: 100 }, b)).toEqual({ x: 800, y: 500, w: 200, h: 100 })
    expect(clampRect({ x: 10, y: 10, w: 2, h: 2 }, b).w).toBe(MIN_CROP)
    expect(clampRect({ x: 0, y: 0, w: 5000, h: 5000 }, b)).toEqual({ x: 0, y: 0, w: 1000, h: 600 })
  })

  it('handles are at least 44 px to hit, corners first', () => {
    const r: Rect = { x: 100, y: 100, w: 300, h: 200 }
    expect(hitHandle({ x: 100, y: 100 }, r)).toBe('nw')
    expect(hitHandle({ x: 120, y: 118 }, r)).toBe('nw') // within 22 px
    expect(hitHandle({ x: 400, y: 300 }, r)).toBe('se')
    expect(hitHandle({ x: 250, y: 100 }, r)).toBe('n')
    expect(hitHandle({ x: 400, y: 200 }, r)).toBe('e')
    expect(hitHandle({ x: 250, y: 200 }, r)).toBe('move')
    expect(hitHandle({ x: 600, y: 600 }, r)).toBeNull()
    expect(hitHandle({ x: 118, y: 100 }, r, 44)).toBe('nw') // within 22 px of the corner
    expect(hitHandle({ x: 130, y: 100 }, r, 44)).toBe('n') // further along the edge it is the edge
  })

  it('dragging corners and edges resizes; moving keeps the size; nothing leaves the picture', () => {
    const r: Rect = { x: 100, y: 100, w: 300, h: 200 }
    expect(dragRect(r, 'se', 50, 40, b)).toEqual({ x: 100, y: 100, w: 350, h: 240 })
    expect(dragRect(r, 'nw', 20, 30, b)).toEqual({ x: 120, y: 130, w: 280, h: 170 })
    expect(dragRect(r, 'e', 900, 0, b).w).toBe(900)
    expect(dragRect(r, 'move', 5000, 5000, b)).toEqual({ x: 700, y: 400, w: 300, h: 200 })
    expect(dragRect(r, 'move', -5000, -5000, b)).toEqual({ x: 0, y: 0, w: 300, h: 200 })
  })

  it('dragging an edge past the other one stops at the minimum size, it does not flip', () => {
    const r: Rect = { x: 100, y: 100, w: 300, h: 200 }
    const out = dragRect(r, 'w', 1000, 0, b)
    expect(out.w).toBeGreaterThanOrEqual(MIN_CROP)
    expect(out.x).toBeLessThanOrEqual(1000)
  })

  it('rotating turns the picture and the crop together; four turns come home', () => {
    let rect: Rect = { x: 100, y: 50, w: 300, h: 200 }
    let bounds = b
    const start = { ...rect }
    for (let i = 0; i < 4; i++) {
      const r = rotateRect(rect, bounds, 'right')
      rect = r.rect
      bounds = r.bounds
      expect(rect.w * rect.h).toBe(300 * 200)
    }
    expect(rect).toEqual(start)
    expect(bounds).toEqual(b)
    const left = rotateRect({ x: 0, y: 0, w: 100, h: 50 }, b, 'left')
    expect(left.bounds).toEqual({ w: 600, h: 1000 })
    expect(left.rect).toEqual({ x: 0, y: 900, w: 50, h: 100 })
    expect(rotateRect(left.rect, left.bounds, 'right').rect).toEqual({ x: 0, y: 0, w: 100, h: 50 })
  })

  it('arrow keys nudge by 1 px, 10 with Shift, and Alt resizes', () => {
    const r: Rect = { x: 100, y: 100, w: 300, h: 200 }
    expect(nudgeRect(r, 'ArrowRight', false, false, b).x).toBe(101)
    expect(nudgeRect(r, 'ArrowDown', true, false, b).y).toBe(110)
    expect(nudgeRect(r, 'ArrowRight', false, true, b).w).toBe(301)
    expect(nudgeRect(r, 'a', false, false, b)).toBe(r)
    expect(nudgeRect({ x: 0, y: 0, w: 300, h: 200 }, 'ArrowLeft', true, false, b).x).toBe(0)
  })

  it('the full picture is the whole rectangle', () => {
    expect(fullRect(b)).toEqual({ x: 0, y: 0, w: 1000, h: 600 })
  })

  it('pinch zoom stays between 1x and 8x around the pointer, and the pan stays inside the picture', () => {
    const v = zoomView({ scale: 1, x: 0, y: 0 }, 2, { x: 100, y: 100 })
    expect(v.scale).toBe(2)
    expect(v.x).toBe(-100)
    expect(zoomView({ scale: 1, x: 0, y: 0 }, 0.1, { x: 0, y: 0 }).scale).toBe(1)
    expect(zoomView({ scale: 7, x: 0, y: 0 }, 5, { x: 0, y: 0 }).scale).toBe(8)
    expect(clampView({ scale: 2, x: 50, y: -999 }, { w: 400, h: 300 })).toEqual({ scale: 2, x: 0, y: -300 })
  })
})

// ---- the pipeline, with a fake browser -----------------------------------------------------------------------

describe('the picture pipeline', () => {
  it('a big photo: compressed is within 1280 px and much smaller; the original is kept as it is', async () => {
    const { codec } = fakeCodec({ webp: true })
    const a = await analyze(source(4000, 3000, 'photo', 6_000_000, 'image/jpeg'), {}, codec)
    expect(Math.max(a.compressed.width, a.compressed.height)).toBe(1280)
    expect(a.compressed.type).toBe('image/webp')
    expect(a.compressed.blob.size).toBeLessThan(400_000)
    expect(a.original?.width).toBe(4000)
    expect(a.original?.blob.size).toBeGreaterThan(5_000_000)
    expect(a.originalProblem).toBeNull()
    expect(decide('ask', a.original?.blob.size ?? 0, a.compressed.blob.size).ask).toBe(true)
  })

  it('a small picture is never enlarged', async () => {
    const { codec } = fakeCodec({ webp: true })
    const a = await analyze(source(300, 200, 'photo', 40_000), {}, codec)
    expect(a.compressed.width).toBe(300)
    expect(a.compressed.height).toBe(200)
  })

  it('a flat-colour screenshot keeps PNG when that is the smallest', async () => {
    const { codec } = fakeCodec({ webp: true })
    const a = await analyze(source(1600, 900, 'flat', 400_000), {}, codec)
    expect(a.stats.flat).toBe(true)
    expect(a.compressed.type).toBe('image/png')
  })

  it('where the browser cannot make WebP (Safari), JPEG is used and WebP is not even tried as a result', async () => {
    const { codec } = fakeCodec({ webp: false })
    const a = await analyze(source(3000, 2000, 'photo', 3_000_000, 'image/jpeg'), {}, codec)
    expect(a.compressed.type).toBe('image/jpeg')
    expect(a.compressed.blob.type).toBe('image/jpeg')
  })

  it('a picture with transparency is never turned into a JPEG', async () => {
    const { codec } = fakeCodec({ webp: false })
    const a = await analyze(source(800, 800, 'alpha', 300_000), {}, codec)
    expect(a.stats.hasAlpha).toBe(true)
    expect(a.compressed.type).not.toBe('image/jpeg')
  })

  it('text keeps at least 0.78 quality in everything it is encoded with', async () => {
    const { codec, log } = fakeCodec({ webp: true })
    await analyze(source(2400, 1500, 'text', 900_000), {}, codec)
    for (const e of log.encoded.filter((x) => x.startsWith('image/webp') || x.startsWith('image/jpeg'))) expect(Number(e.split('@')[1])).toBeGreaterThanOrEqual(0.78)
  })

  it('a crop makes both versions from the chosen part only', async () => {
    const { codec, log } = fakeCodec({ webp: true })
    const a = await analyze(source(2000, 1000, 'photo', 1_000_000), { crop: { x: 100, y: 100, w: 600, h: 300 } }, codec)
    expect(a.original?.width).toBe(600)
    expect(a.original?.height).toBe(300)
    expect(a.compressed.width).toBe(600)
    expect(log.renders.every((r) => r.crop.w === 600 && r.crop.h === 300)).toBe(true)
  })

  it('rotating swaps the sides, and the crop is in rotated coordinates', async () => {
    const { codec } = fakeCodec({ webp: true })
    const a = await analyze(source(2000, 1000, 'photo', 1_000_000), { rotate: 90 }, codec)
    expect(a.compressed.width).toBeLessThan(a.compressed.height)
    expect(a.original?.width).toBe(1000)
    expect(a.original?.height).toBe(2000)
  })

  it('an EXIF-rotated JPEG is redrawn upright (not just stripped), so it does not end up sideways', async () => {
    const { codec, log } = fakeCodec({ webp: true })
    await analyze(source(3000, 2000, 'photo', 100, 'image/jpeg', jpegWithExif(6)), {}, codec)
    expect(log.renders.some((r) => r.width === 3000 && r.height === 2000)).toBe(true) // a full-size redraw for the original
  })

  it('an untouched upright JPEG keeps its exact pixels and loses its metadata', async () => {
    const { codec } = fakeCodec({ webp: true })
    const real = jpegWithExif(1)
    const a = await analyze(source(1000, 800, 'photo', 100, 'image/jpeg', real), {}, codec)
    const text = new TextDecoder('latin1').decode(new Uint8Array(await (a.original as { blob: Blob }).blob.arrayBuffer()))
    expect(text).not.toMatch(/Exif|adobe/)
    expect(a.original?.type).toBe('image/jpeg')
  })

  it('an original over 4000 px is refused with an explanation, but Compressed still works', async () => {
    const { codec } = fakeCodec({ webp: true })
    const a = await analyze(source(6000, 4000, 'photo', 2_000_000, 'image/jpeg', jpegWithExif(6)), {}, codec)
    expect(a.original).toBeNull()
    expect(a.originalProblem).toMatch(/4000 px/)
    expect(pick(a, 'compressed').width).toBe(1280)
    expect(() => pick(a, 'original')).toThrow(ImageError)
  })

  it('an original over 10 MB is refused with an explanation', async () => {
    const { codec } = fakeCodec({ webp: true })
    const a = await analyze(source(3900, 2900, 'photo', 12_000_000, 'image/jpeg'), {}, codec)
    expect(a.original).toBeNull()
    expect(a.originalProblem).toMatch(/limit is 10 MB/)
    expect(pick(a, 'compressed')).toBeTruthy()
  })

  it('a picture that cannot be read gets a friendly message, and the bitmap is always released', async () => {
    const bad = fakeCodec({ failDecode: true })
    await expect(analyze(source(10, 10, 'photo', 100), {}, bad.codec)).rejects.toThrow(/HEIC|Most compatible/)
    const ok = fakeCodec({ webp: true })
    await analyze(source(1000, 800, 'photo', 100_000), {}, ok.codec)
    expect(ok.log.closed).toBe(1)
  })

  it('a small file is not worth a question: the decision is to keep it', async () => {
    const { codec } = fakeCodec({ webp: true })
    const a = await analyze(source(500, 400, 'photo', 22_000), {}, codec)
    expect(decide('ask', a.original?.blob.size ?? 0, a.compressed.blob.size).ask).toBe(false)
  })
})
