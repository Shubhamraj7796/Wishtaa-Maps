import { analyze } from '@/core/images/pipeline'
import { LOCAL } from '@/core/model/doc'
import type { TopicImage } from '@/core/model/topic'
import { marksOf } from '@/core/model/pictureEdit'
import type { MarkupObject } from '@/core/pdf/types'
import { loadImageBlob } from '../images'
import { mapDoc } from '../mapdoc'
import { showNotice } from '../notice'
import { mayEdit } from '../readmode'
import { useEditor } from '../store'
import { finalize, getPictureCodec, storePicture } from './flow'

/** Draws marks onto a canvas of `W` by `H` pixels (the stored picture's own size), like the viewer draws them. */
export function drawMarks(ctx: CanvasRenderingContext2D, marks: readonly MarkupObject[], W: number, H: number) {
  for (const m of marks) {
    ctx.save()
    ctx.strokeStyle = m.color
    ctx.fillStyle = m.color
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const line = Math.max(1, (m.width ?? 0.004) * W)
    ctx.lineWidth = line
    switch (m.kind) {
      case 'highlight':
        ctx.globalAlpha = m.opacity ?? 0.4
        ctx.globalCompositeOperation = 'multiply'
        for (const r of m.rects ?? []) ctx.fillRect(r.x * W, r.y * H, r.w * W, r.h * H)
        break
      case 'underline':
      case 'strike':
        for (const r of m.rects ?? []) {
          const y = (m.kind === 'underline' ? r.y + r.h * 0.92 : r.y + r.h * 0.55) * H
          ctx.lineWidth = m.width ? Math.max(1, m.width * W) : Math.max(1.5, r.h * H * 0.08)
          ctx.beginPath()
          ctx.moveTo(r.x * W, y)
          ctx.lineTo((r.x + r.w) * W, y)
          ctx.stroke()
        }
        break
      case 'pen': {
        const pts = m.points ?? []
        if (pts.length > 1) {
          ctx.beginPath()
          pts.forEach((p, i) => (i ? ctx.lineTo(p[0] * W, p[1] * H) : ctx.moveTo(p[0] * W, p[1] * H)))
          ctx.stroke()
        }
        break
      }
      case 'rect': {
        const r = m.rects?.[0]
        if (r) ctx.strokeRect(r.x * W, r.y * H, r.w * W, r.h * H)
        break
      }
      case 'whiteout': {
        const r = m.rects?.[0]
        if (r) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(r.x * W, r.y * H, r.w * W, r.h * H)
        }
        break
      }
      case 'ellipse': {
        const r = m.rects?.[0]
        if (r) {
          ctx.beginPath()
          ctx.ellipse((r.x + r.w / 2) * W, (r.y + r.h / 2) * H, (r.w / 2) * W, (r.h / 2) * H, 0, 0, Math.PI * 2)
          ctx.stroke()
        }
        break
      }
      case 'line':
      case 'arrow': {
        const [a, b] = m.points ?? []
        if (!a || !b) break
        ctx.beginPath()
        ctx.moveTo(a[0] * W, a[1] * H)
        ctx.lineTo(b[0] * W, b[1] * H)
        ctx.stroke()
        if (m.kind === 'arrow') {
          const ang = Math.atan2((b[1] - a[1]) * H, (b[0] - a[0]) * W)
          const size = Math.max(8, line * 4)
          ctx.beginPath()
          ctx.moveTo(b[0] * W, b[1] * H)
          for (const k of [0.45, -0.45]) ctx.lineTo(b[0] * W - size * Math.cos(ang + k), b[1] * H - size * Math.sin(ang + k))
          ctx.closePath()
          ctx.fill()
        }
        break
      }
      case 'text': {
        const r = m.rects?.[0]
        if (!r || !m.text) break
        const size = (m.fontSize ?? 0.02) * H
        ctx.font = `${size}px sans-serif`
        ctx.textBaseline = 'top'
        let y = r.y * H
        for (const para of m.text.split('\n')) {
          let lineText = ''
          for (const word of para.split(' ')) {
            const next = lineText ? `${lineText} ${word}` : word
            if (lineText && ctx.measureText(next).width > r.w * W) {
              ctx.fillText(lineText, r.x * W, y)
              y += size * 1.25
              lineText = word
            } else lineText = next
          }
          ctx.fillText(lineText, r.x * W, y)
          y += size * 1.25
        }
        break
      }
    }
    ctx.restore()
  }
}

/**
 * The picture as a flat image: turned and mirrored as the topic asks (when `turn`), with its marks drawn in (when `marks`). A picture
 * with a turn and marks keeps them consistent: marks are laid on the stored picture, then everything is turned together.
 */
export async function renderBaked(blob: Blob, image: TopicImage, opts: { turn: boolean; marks: boolean }): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  try {
    const bw = bitmap.width
    const bh = bitmap.height
    const rot = opts.turn ? (image.rotation ?? 0) : 0
    const odd = rot === 90 || rot === 270
    const canvas = document.createElement('canvas')
    canvas.width = odd ? bh : bw
    canvas.height = odd ? bw : bh
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('This browser cannot draw the picture.')
    ctx.translate(canvas.width / 2, canvas.height / 2)
    if (opts.turn) ctx.scale(image.flipX ? -1 : 1, image.flipY ? -1 : 1)
    ctx.rotate((rot * Math.PI) / 180)
    ctx.translate(-bw / 2, -bh / 2)
    ctx.drawImage(bitmap, 0, 0)
    if (opts.marks) drawMarks(ctx, marksOf(image), bw, bh)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be saved.'))), 'image/png'))
  } finally {
    bitmap.close()
  }
}

export type BakeScope = 'topic' | 'all'
export interface BakeOptions {
  /** Make the turn and mirror permanent. */
  turn?: boolean
  /** Draw the marks into the picture. */
  marks?: boolean
  quality: 'compressed' | 'original'
  scope: BakeScope
}

const sameLook = (a: TopicImage, b: TopicImage) => (a.rotation ?? 0) === (b.rotation ?? 0) && !!a.flipX === !!b.flipX && !!a.flipY === !!b.flipY && JSON.stringify(a.marks ?? {}) === JSON.stringify(b.marks ?? {}) && !!a.markHidden === !!b.markHidden

/** The topics that show this picture exactly as this topic does (so one baked picture can serve them all). */
export function topicsShowingSameLook(topicId: string): string[] {
  const topics = useEditor.getState().topics
  const mine = topics[topicId]?.image
  if (!mine) return []
  return Object.keys(topics).filter((id) => topics[id]?.image?.imageId === mine.imageId && sameLook(topics[id]?.image as TopicImage, mine))
}

/**
 * Makes a turn, or marks, part of the picture itself: a NEW picture is stored (its id comes from its bytes, so the same result is one
 * picture and is uploaded once) and the topic or topics point at it with the turn and marks removed. One undo step. The old picture
 * is untouched, and is dropped later only if nothing uses it. Returns the new picture's id, or null.
 */
export async function bakePicture(topicId: string, opts: BakeOptions): Promise<string | null> {
  if (!mayEdit('Changing a picture')) return null
  const image = useEditor.getState().topics[topicId]?.image
  if (!image) return null
  try {
    const source = await loadImageBlob(image.imageId)
    if (!source) {
      showNotice('The picture is no longer stored in this browser.')
      return null
    }
    const flat = await renderBaked(source, image, { turn: !!opts.turn, marks: !!opts.marks })
    const analysis = await analyze(flat, {}, getPictureCodec())
    let quality = opts.quality
    if (quality === 'original' && !analysis.original) {
      showNotice(`${analysis.originalProblem ?? 'That picture is too large to keep as it is.'} It was made Compressed instead.`, 8000)
      quality = 'compressed'
    }
    const chosen = await finalize(analysis, quality, flat)
    const id = await storePicture(chosen)
    const ids = opts.scope === 'all' ? topicsShowingSameLook(topicId) : [topicId]
    mapDoc.ydoc.transact(() => {
      for (const tid of ids.length ? ids : [topicId]) {
        const t = mapDoc.topics.get(tid)
        if (!t?.image) continue
        const next: TopicImage = { ...t.image, imageId: id }
        if (opts.turn) {
          delete next.rotation
          delete next.flipX
          delete next.flipY
        }
        if (opts.marks) {
          delete next.marks
          delete next.markHidden
        }
        mapDoc.topics.set(tid, { ...t, image: next })
      }
    }, LOCAL)
    return id
  } catch (e) {
    showNotice(e instanceof Error && e.message ? e.message : 'The picture could not be changed.')
    return null
  }
}
