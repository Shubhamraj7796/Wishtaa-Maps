import { newId } from './ids'
import { LOCAL, type MapDoc } from './doc'
import type { TopicImage } from './topic'
import type { MarkupObject, Point, Turn } from '../pdf/types'
import { fromShown } from '../pdf/geometry'

/**
 * Turning, flipping and marking up a picture, without touching the picture itself. These are small properties of the picture
 * REFERENCE in a topic (`rotation`, `flipX`, `flipY`, `marks`, `markHidden`), so editing them changes only the map JSON: no picture is
 * ever uploaded again. Every command is one undo step.
 *
 * Coordinates of marks are fractions (0 to 1) of the ORIGINAL picture, from its top left, as stored: they do not depend on how the
 * picture is turned, flipped or sized, so a mark stays on the thing it marks when the picture is rotated.
 *
 * `image.width` and `image.height` are always the size of the picture AS SHOWN, so turning by 90 degrees swaps them and the layout
 * engine needs to know nothing about rotation. The picture is drawn as: stored picture, then turned by `rotation` clockwise, then
 * mirrored by `flipX` / `flipY` (mirrors are in screen space).
 */
export type PictureMark = MarkupObject

/** Most marks one picture may carry. */
export const MAX_MARKS = 2000
/** The id marks carry in place of a PDF source. */
export const PICTURE_SOURCE = 'picture'

const tx = (doc: MapDoc, fn: () => void) => doc.ydoc.transact(fn, LOCAL)

const withImage = (doc: MapDoc, topicId: string, fn: (image: TopicImage) => TopicImage | null) => {
  const t = doc.topics.get(topicId)
  if (!t?.image) return false
  const next = fn(t.image)
  if (!next) return false
  tx(doc, () => doc.topics.set(topicId, { ...t, image: next }))
  return true
}

export const rotationOf = (image: TopicImage | null | undefined): Turn => (image?.rotation ?? 0) as Turn
const turned = (r: Turn) => r === 90 || r === 270

/** The size of the stored picture's own box, before it is turned (what the picture and its marks are laid out in). */
export function innerSize(image: Pick<TopicImage, 'width' | 'height' | 'rotation'>): { w: number; h: number } {
  return turned((image.rotation ?? 0) as Turn) ? { w: image.height, h: image.width } : { w: image.width, h: image.height }
}

/** Turns a picture a quarter turn. Right is clockwise as seen on screen (the opposite of its stored turn when it is mirrored). */
export function rotatePicture(doc: MapDoc, topicId: string, by: 90 | -90): boolean {
  return withImage(doc, topicId, (image) => {
    const mirrored = !!image.flipX !== !!image.flipY
    const step = mirrored ? -by : by
    const rotation = ((((image.rotation ?? 0) + step) % 360) + 360) % 360
    const next: TopicImage = { ...image, width: image.height, height: image.width }
    if (rotation) next.rotation = rotation as 90 | 180 | 270
    else delete next.rotation
    return next
  })
}

/** Mirrors a picture left to right, or top to bottom, as seen on screen. */
export function flipPicture(doc: MapDoc, topicId: string, axis: 'x' | 'y'): boolean {
  return withImage(doc, topicId, (image) => {
    const key = axis === 'x' ? 'flipX' : 'flipY'
    const next: TopicImage = { ...image }
    if (image[key]) delete next[key]
    else next[key] = true
    return next
  })
}

/** Takes off every turn and mirror (the marks stay on what they mark). */
export function resetPictureTurn(doc: MapDoc, topicId: string): boolean {
  return withImage(doc, topicId, (image) => {
    const { rotation, flipX, flipY, ...rest } = image
    void flipX
    void flipY
    const swap = (rotation ?? 0) === 90 || rotation === 270
    return { ...rest, ...(swap ? { width: image.height, height: image.width } : {}) }
  })
}

export const marksOf = (image: TopicImage | null | undefined): PictureMark[] => (image?.marks ? Object.values(image.marks).sort((a, b) => a.createdAt - b.createdAt) : [])

export type NewMark = Omit<PictureMark, 'id' | 'createdAt' | 'sourceId' | 'page'>

export function addPictureMark(doc: MapDoc, topicId: string, mark: NewMark): string | null {
  const id = newId()
  const ok = withImage(doc, topicId, (image) => {
    if (Object.keys(image.marks ?? {}).length >= MAX_MARKS) return null
    return { ...image, marks: { ...image.marks, [id]: { ...mark, id, sourceId: PICTURE_SOURCE, page: 0, createdAt: Date.now() } } }
  })
  return ok ? id : null
}

export function updatePictureMark(doc: MapDoc, topicId: string, markId: string, change: Partial<NewMark>): boolean {
  return withImage(doc, topicId, (image) => {
    const cur = image.marks?.[markId]
    return cur ? { ...image, marks: { ...image.marks, [markId]: { ...cur, ...change } } } : null
  })
}

export function deletePictureMark(doc: MapDoc, topicId: string, markId: string): boolean {
  return withImage(doc, topicId, (image) => {
    if (!image.marks?.[markId]) return null
    const marks = { ...image.marks }
    delete marks[markId]
    const next: TopicImage = { ...image, marks }
    if (!Object.keys(marks).length) delete next.marks
    return next
  })
}

/** Removes all the marks of a picture (one undo step). */
export function clearPictureMarks(doc: MapDoc, topicId: string): boolean {
  return withImage(doc, topicId, (image) => {
    if (!image.marks) return null
    const { marks, ...rest } = image
    void marks
    return rest
  })
}

/** "Show markup": hides the marks (on the map, in the Outline and in the viewer) without deleting them. */
export function setMarksHidden(doc: MapDoc, topicId: string, hidden: boolean): boolean {
  return withImage(doc, topicId, (image) => {
    if (!!image.markHidden === hidden) return null
    const next: TopicImage = { ...image }
    if (hidden) next.markHidden = true
    else delete next.markHidden
    return next
  })
}

/**
 * A point on the picture AS SHOWN (fractions of the shown box) turned into a point on the stored picture, undoing the mirror and then
 * the turn. This is how a pen stroke made on a turned picture is stored.
 */
export function toPicturePoint(shown: Point, image: Pick<TopicImage, 'rotation' | 'flipX' | 'flipY'>): Point {
  const unflipped: Point = [image.flipX ? 1 - shown[0] : shown[0], image.flipY ? 1 - shown[1] : shown[1]]
  return fromShown(unflipped, (image.rotation ?? 0) as Turn)
}
