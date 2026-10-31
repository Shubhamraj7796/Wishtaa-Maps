import * as Y from 'yjs'
import { repository } from '@/app/repo'
import { saveMetaFromContent } from '@/core/files/content'
import { pictureIdOf } from '@/core/images/sha256'
import { addChild, setImage } from '@/core/model/commands'
import { createMapDoc, ensureRoot } from '@/core/model/doc'
import { ensureThumb, imageStore } from '@/editor/images'

/** Makes a map with 500 realistic pictures in this browser (run by bench/run500.mjs in headless Chromium). */

const COUNT = 500
const toBlob = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob>((r) => c.toBlob((b) => r(b as Blob), type, q))

/** A screenshot-like picture: pale page, coloured blocks, lines of text and some noise, saved as WebP like the Compressed setting does. */
async function picture(n: number): Promise<{ blob: Blob; width: number; height: number }> {
  const width = 1280
  const height = 720
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const g = c.getContext('2d') as CanvasRenderingContext2D
  g.fillStyle = `hsl(${(n * 37) % 360} 30% 94%)`
  g.fillRect(0, 0, width, height)
  g.fillStyle = `hsl(${(n * 53) % 360} 55% 45%)`
  g.fillRect(0, 0, width, 70)
  g.fillStyle = '#222'
  g.font = '22px sans-serif'
  for (let i = 0; i < 18; i++) g.fillText(`Row ${i} of picture ${n}: quarterly figures ${(n * 7919 + i * 104729) % 100000}`, 40, 120 + i * 32)
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `hsl(${(n * 11 + i * 29) % 360} 60% ${40 + (i % 5) * 8}%)`
    g.fillRect(700 + ((i * 97 + n * 13) % 500), 100 + ((i * 53 + n * 7) % 560), 30 + (i % 40), 10 + (i % 25))
  }
  const blob = await toBlob(c, 'image/webp', 0.8)
  return { blob, width, height }
}

;(window as unknown as { seed: (withPictures?: boolean, count?: number) => Promise<{ id: string; bytes: number; pictures: number }> }).seed = async (withPictures = true, count = COUNT) => {
  const doc = createMapDoc()
  const root = ensureRoot(doc, '500 pictures')
  const ids: string[] = []
  let bytes = 0
  for (let i = 0; i < count; i++) {
    const topic = addChild(doc, root, `Topic ${i}`)
    if (!withPictures) continue // the same map without pictures, to tell what the pictures cost
    const p = await picture(i)
    const id = await pictureIdOf(p.blob)
    ids.push(id)
    bytes += p.blob.size
    if (!(await imageStore.getMeta(id))) await imageStore.put({ id, blob: p.blob, width: p.width, height: p.height, type: p.blob.type, size: p.blob.size })
    await ensureThumb(id) // as when a picture is added in the editor
    setImage(doc, topic, { imageId: id, width: 320, height: 180 })
  }
  const content = Y.encodeStateAsUpdate(doc.ydoc)
  const file = await repository.create({ type: 'map', name: '500 pictures', content })
  await repository.saveContent(file.id, content, saveMetaFromContent(file.id, content))
  return { id: file.id, bytes, pictures: new Set(ids).size }
}
document.title = 'ready'
