import type { Codec, Decoded, Raster, RenderOptions } from './pipeline'

/** Browsers refuse canvases of more than about 16 megapixels (iOS in particular), so big pictures are shrunk in steps. */
export const MAX_CANVAS_PIXELS = 16_000_000

const make = (w: number, h: number) => {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

/** Draws `src` (a bitmap or canvas) into a new canvas of the wanted size, halving at most once per step so detail survives. */
function drawInSteps(src: CanvasImageSource & { width: number; height: number }, sx: number, sy: number, sw: number, sh: number, width: number, height: number, rotate: number): HTMLCanvasElement {
  // Step 1: the wanted part, upright, no bigger than the canvas limit.
  let curW = sw
  let curH = sh
  let cur: CanvasImageSource & { width: number; height: number } = src
  let first = true
  const turn = rotate === 90 || rotate === 270
  const outW = turn ? height : width
  const outH = turn ? width : height
  while (curW / 2 > outW || curH / 2 > outH || curW * curH > MAX_CANVAS_PIXELS) {
    const nw = Math.max(outW, Math.ceil(curW / 2))
    const nh = Math.max(outH, Math.ceil(curH / 2))
    const step = make(nw, nh)
    const ctx = step.getContext('2d')
    if (!ctx) throw new Error('no canvas')
    ctx.imageSmoothingQuality = 'high'
    if (first) ctx.drawImage(cur, sx, sy, curW, curH, 0, 0, nw, nh)
    else ctx.drawImage(cur, 0, 0, curW, curH, 0, 0, nw, nh)
    cur = step
    curW = nw
    curH = nh
    first = false
  }
  const out = make(width, height)
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('no canvas')
  ctx.imageSmoothingQuality = 'high'
  ctx.save()
  ctx.translate(width / 2, height / 2)
  ctx.rotate((rotate * Math.PI) / 180)
  const dw = turn ? height : width
  const dh = turn ? width : height
  if (first) ctx.drawImage(cur, sx, sy, curW, curH, -dw / 2, -dh / 2, dw, dh)
  else ctx.drawImage(cur, 0, 0, curW, curH, -dw / 2, -dh / 2, dw, dh)
  ctx.restore()
  return out
}

let webp: Promise<boolean> | null = null

/** The real thing: createImageBitmap and canvases. */
export const browserCodec: Codec = {
  async decode(blob: Blob): Promise<Decoded> {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
    return { width: bitmap.width, height: bitmap.height, close: () => bitmap.close(), raw: bitmap }
  },

  async render(src: Decoded, o: RenderOptions): Promise<Raster> {
    const bitmap = src.raw as ImageBitmap
    const { crop, rotate } = o
    // The crop is in the coordinates of the rotated picture; map it back to the unrotated one.
    let sx = crop.x
    let sy = crop.y
    let sw = crop.w
    let sh = crop.h
    const W = bitmap.width
    const H = bitmap.height
    if (rotate === 90) [sx, sy, sw, sh] = [crop.y, H - (crop.x + crop.w), crop.h, crop.w]
    else if (rotate === 180) [sx, sy] = [W - (crop.x + crop.w), H - (crop.y + crop.h)]
    else if (rotate === 270) [sx, sy, sw, sh] = [W - (crop.y + crop.h), crop.x, crop.h, crop.w]
    const canvas = drawInSteps(bitmap, sx, sy, sw, sh, o.width, o.height, rotate)
    return {
      width: canvas.width,
      height: canvas.height,
      raw: canvas,
      pixels: () => canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height) ?? { data: [] },
    }
  },

  encode(r: Raster, type: string, quality: number): Promise<Blob | null> {
    return new Promise((resolve) => (r.raw as HTMLCanvasElement).toBlob(resolve, type, quality))
  },

  canEncode(type: string): Promise<boolean> {
    if (type !== 'image/webp') return Promise.resolve(true)
    // Safari's canvas cannot make WebP: it silently returns PNG. Ask once.
    webp ??= new Promise<boolean>((resolve) => {
      try {
        make(2, 2).toBlob((b) => resolve(b?.type === 'image/webp'), 'image/webp', 0.8)
      } catch {
        resolve(false)
      }
    })
    return webp
  },
}
