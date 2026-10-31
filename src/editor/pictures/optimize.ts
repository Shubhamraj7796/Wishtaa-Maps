import { analyze, type Candidate, type Codec } from '@/core/images/pipeline'
import { shouldAsk } from '@/core/images/plan'
import { pictureIdOf } from '@/core/images/sha256'
import { setImage } from '@/core/model/commands'
import { LOCAL } from '@/core/model/doc'
import { addImageReferenceSource, ensureThumb, imageStore, releaseUnusedUrls, track } from '../images'
import { mapDoc } from '../mapdoc'
import { mayEdit } from '../readmode'
import { useEditor } from '../store'
import { getPictureCodec } from './flow'

/** One picture that can be made smaller, with the smaller version already made. */
export interface OptimizeItem {
  id: string
  before: number
  after: number
  candidate: Candidate
}

export interface OptimizePlan {
  /** Pictures in the map. */
  total: number
  items: OptimizeItem[]
  before: number
  after: number
}

/** Old pictures stay in this browser for the rest of the session, so Undo can bring them back. */
const keptForUndo = new Set<string>()
addImageReferenceSource(() => keptForUndo)

const distinctIds = () => {
  const ids = new Set<string>()
  for (const t of Object.values(useEditor.getState().topics)) if (t.image) ids.add(t.image.imageId)
  return [...ids]
}

/**
 * Looks at every picture in the map and works out which would be clearly smaller as "Compressed" (the same rule as when adding:
 * at least a quarter and 30 KB). Nothing is changed. `onProgress` is told how many have been looked at.
 */
export async function planOptimize(onProgress?: (done: number, of: number) => void, codec: Codec = getPictureCodec()): Promise<OptimizePlan> {
  const ids = distinctIds()
  const items: OptimizeItem[] = []
  let before = 0
  let after = 0
  for (const [i, id] of ids.entries()) {
    const img = await imageStore.get(id).catch(() => undefined)
    if (img) {
      before += img.size
      let kept = img.size
      try {
        const a = await analyze(img.blob, {}, codec)
        if (shouldAsk(img.size, a.compressed.blob.size)) {
          items.push({ id, before: img.size, after: a.compressed.blob.size, candidate: a.compressed })
          kept = a.compressed.blob.size
        }
      } catch {
        /* this one is left as it is */
      }
      after += kept
    }
    onProgress?.(i + 1, ids.length)
  }
  return { total: ids.length, items, before, after }
}

/**
 * Swaps every use of each picture for its smaller version, as ONE undo step. The new pictures are stored first; the old ones are
 * kept until the session ends. Display sizes do not change. Returns how many pictures were replaced.
 */
export async function applyOptimize(plan: OptimizePlan): Promise<number> {
  if (!plan.items.length || !mayEdit('Optimizing pictures')) return 0
  const swaps = new Map<string, { id: string; width: number; height: number }>()
  for (const it of plan.items) {
    const c = it.candidate
    const id = await pictureIdOf(c.blob)
    if (id === it.id) continue
    if (!(await imageStore.getMeta(id).catch(() => undefined))) {
      await track(imageStore.put({ id, blob: c.blob, width: c.width, height: c.height, type: c.type, size: c.blob.size }))
    }
    void ensureThumb(id)
    keptForUndo.add(it.id)
    swaps.set(it.id, { id, width: c.width, height: c.height })
  }
  mapDoc.ydoc.transact(() => {
    for (const [topicId, t] of Object.entries(useEditor.getState().topics)) {
      const to = t.image && swaps.get(t.image.imageId)
      if (!t.image || !to) continue
      setImage(mapDoc, topicId, { ...t.image, imageId: to.id })
    }
  }, LOCAL)
  releaseUnusedUrls()
  return swaps.size
}
