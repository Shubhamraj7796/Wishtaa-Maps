import type { Codec, Decoded, Raster, RenderOptions } from '@/core/images/pipeline'

export function pixels(w: number, h: number, f: (x: number, y: number) => [number, number, number, number]) {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(f(x, y), (y * w + x) * 4)
  return d
}

export type Kind = 'photo' | 'text' | 'flat' | 'alpha'

/** A source "picture": a header with its size and kind, padded to the wanted byte size. Real JPEG bytes can be passed in. */
const sources = new WeakMap<Blob, { w: number; h: number; kind: Kind }>()
export function source(w: number, h: number, kind: Kind, bytes: number, type = 'image/png', real?: Uint8Array): Blob {
  const blob = new Blob([(real ?? new Uint8Array(bytes)) as BlobPart], { type })
  sources.set(blob, { w, h, kind })
  return blob
}

export function fakeCodec(opts: { webp?: boolean; failDecode?: boolean } = {}) {
  const log = { closed: 0, encoded: [] as string[], renders: [] as RenderOptions[] }
  const kindOf = new WeakMap<object, Kind>()
  const codec: Codec = {
    async decode(blob: Blob): Promise<Decoded> {
      if (opts.failDecode) throw new Error('bad')
      const meta = sources.get(blob) as { w: number; h: number; kind: Kind }
      const d: Decoded = { width: meta.w, height: meta.h, raw: meta, close: () => void log.closed++ }
      kindOf.set(d, meta.kind)
      return d
    },
    async render(src: Decoded, o: RenderOptions): Promise<Raster> {
      log.renders.push(o)
      const kind = (src.raw as { kind: Kind }).kind
      const r: Raster = {
        width: o.width,
        height: o.height,
        raw: kind,
        pixels: () => ({
          data:
            kind === 'photo'
              ? pixels(o.width, o.height, (x, y) => [(x * 37 + y * 11) % 256, (x * 5 + y * 91) % 256, (x * 13 + y * 7) % 256, 255])
              : kind === 'alpha'
                ? pixels(o.width, o.height, () => [0, 0, 0, 0])
                : pixels(o.width, o.height, (x, y) => (kind === 'text' && x % 7 === 0 && y % 3 !== 0 ? [20, 20, 20, 255] : [255, 255, 255, 255])),
        }),
      }
      return r
    },
    async encode(r: Raster, type: string, q: number): Promise<Blob | null> {
      log.encoded.push(`${type}@${q}`)
      if (type === 'image/webp' && !opts.webp) return new Blob([new Uint8Array(r.width * r.height)], { type: 'image/png' }) // Safari
      const flat = r.raw !== 'photo'
      const px = r.width * r.height
      const n = type === 'image/webp' ? px * 0.12 * q : type === 'image/jpeg' ? px * 0.2 * q : flat ? px * 0.04 : px * 1.5
      return new Blob([new Uint8Array(Math.round(n))], { type })
    },
    async canEncode(type: string) {
      return type === 'image/webp' ? !!opts.webp : true
    },
  }
  return { codec, log }
}

