import type { Codec } from './pipeline'
import { PICTURE_LIMITS } from './limits'
import { fitWithin } from './process'

/** A small picture (256 px on the longest side) drawn instead of the full one when zoomed out or while panning. */
export async function makeThumb(source: Blob, codec: Codec): Promise<Blob | null> {
  let decoded
  try {
    decoded = await codec.decode(source)
  } catch {
    return null
  }
  try {
    const size = fitWithin(decoded.width, decoded.height, PICTURE_LIMITS.thumbSide)
    const raster = await codec.render(decoded, { crop: { x: 0, y: 0, w: decoded.width, h: decoded.height }, rotate: 0, ...size })
    const type = (await codec.canEncode('image/webp')) ? 'image/webp' : 'image/jpeg'
    return await codec.encode(raster, type, 0.7)
  } finally {
    decoded.close()
  }
}
