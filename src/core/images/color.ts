import type { Codec } from './pipeline'

const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')

/** The average colour of a picture as "#rrggbb" (from an 8 x 8 sample), or null if it cannot be read. */
export async function averageColor(source: Blob, codec: Codec): Promise<string | null> {
  let decoded
  try {
    decoded = await codec.decode(source)
  } catch {
    return null
  }
  try {
    const raster = await codec.render(decoded, { crop: { x: 0, y: 0, w: decoded.width, h: decoded.height }, rotate: 0, width: 8, height: 8 })
    const data = raster.pixels().data
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let i = 0; i + 3 < data.length; i += 4) {
      const a = (data[i + 3] as number) / 255
      r += (data[i] as number) * a + 255 * (1 - a) // transparent areas read as white
      g += (data[i + 1] as number) * a + 255 * (1 - a)
      b += (data[i + 2] as number) * a + 255 * (1 - a)
      n++
    }
    return n ? `#${hex(r / n)}${hex(g / n)}${hex(b / n)}` : null
  } finally {
    decoded.close()
  }
}
