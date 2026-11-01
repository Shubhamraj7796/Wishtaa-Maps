import type { TopicImage } from '@/core/model/topic'
import { marksOf } from '@/core/model/pictureEdit'
import { MarkupLayer } from '../markup/layers'

/** Pictures smaller than this on screen (pixels across) are drawn without their marks: they would be specks. */
export const MIN_MARK_PX = 90

export interface FaceView {
  rotation: 0 | 90 | 180 | 270
  flipX: boolean
  flipY: boolean
  /** Marks to draw, or none. */
  marks: ReturnType<typeof marksOf>
}

/** What a picture reference asks to be drawn: turned, mirrored, with marks. */
export function faceOf(image: TopicImage | null | undefined, showMarks = true): FaceView {
  return { rotation: (image?.rotation ?? 0) as FaceView['rotation'], flipX: !!image?.flipX, flipY: !!image?.flipY, marks: showMarks && !image?.markHidden ? marksOf(image) : [] }
}

/** The CSS that turns the stored picture (laid out upright in its own box) into the picture as shown. */
export function faceTransform(f: Pick<FaceView, 'rotation' | 'flipX' | 'flipY'>): string {
  return `translate(-50%, -50%) scale(${f.flipX ? -1 : 1}, ${f.flipY ? -1 : 1}) rotate(${f.rotation}deg)`
}

export const isPlain = (f: FaceView) => f.rotation === 0 && !f.flipX && !f.flipY && f.marks.length === 0

/**
 * A stored picture as it is meant to be seen: turned and mirrored as the topic asks, with its marks over it. `w` and `h` are the size
 * of the box it is shown in (already the size AS SHOWN). A picture with nothing done to it is a plain `<img>`, exactly as before.
 */
export function PictureFace({ url, alt, image, w, h, screenW = w, fit = 'fill', showMarks = true, className = '' }: { url: string; alt: string; image: TopicImage | null | undefined; w: number; h: number; /** How wide it is on screen, to leave marks off a speck. */ screenW?: number; fit?: 'fill' | 'contain'; showMarks?: boolean; className?: string }) {
  const f = faceOf(image, showMarks && screenW >= MIN_MARK_PX)
  const fitClass = fit === 'fill' ? 'object-fill' : 'object-contain'
  if (isPlain(f)) return <img src={url} alt={alt} draggable={false} decoding="async" className={`block h-full w-full select-none ${fitClass} ${className}`} />
  const odd = f.rotation === 90 || f.rotation === 270
  const inner = odd ? { w: h, h: w } : { w, h }
  return (
    <div className="relative h-full w-full overflow-hidden" data-face={`${f.rotation}${f.flipX ? 'x' : ''}${f.flipY ? 'y' : ''}`}>
      <div className="absolute" style={{ left: '50%', top: '50%', width: inner.w, height: inner.h, transform: faceTransform(f), transformOrigin: 'center' }}>
        <img src={url} alt={alt} draggable={false} decoding="async" className={`block h-full w-full select-none ${fitClass} ${className}`} />
        {f.marks.length > 0 && <MarkupLayer list={f.marks} box={{ w: inner.w, h: inner.h, scale: 1 }} />}
      </div>
    </div>
  )
}
