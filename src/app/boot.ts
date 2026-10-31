import * as Y from 'yjs'
import { buildFileIndex, referencedIds } from '@/core/files/indexer'
import type { FileRepository } from '@/core/files/types'
import { createMapDoc, snapshotTopics } from '@/core/model/doc'
import { fromBase64 } from '@/core/persistence'
import { attachmentStore, sweepAttachments } from '@/editor/attachments'
import { imageStore, setPictureFallback, sweepUnusedImages } from '@/editor/images'
import { matchesId } from '@/core/images/verify'
import { pictureFetcher, pictureSync, repository, setBlobStores } from './repo'

const LEGACY_KEY = 'wishtaamaps:guest:v1'
const LEGACY_DONE = 'wishtaamaps:legacy-imported'

/**
 * Before files existed, the editor kept one map in the browser. If there is one, it becomes a file ("My first map")
 * so nothing is lost. The original is left untouched.
 */
export async function migrateLegacyMap(repo: FileRepository = repository): Promise<string | null> {
  let raw: string | null = null
  try {
    if (localStorage.getItem(LEGACY_DONE)) return null
    raw = localStorage.getItem(LEGACY_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const bytes = fromBase64(raw)
    const doc = createMapDoc()
    Y.applyUpdate(doc.ydoc, bytes, 'load')
    const topics = snapshotTopics(doc)
    if (!Object.keys(topics).length) return null
    const title = doc.meta.get('title')
    const file = await repo.create({ type: 'map', name: title && title !== 'Untitled map' ? title : 'My first map', content: bytes })
    await repo.saveContent(file.id, bytes, {
      ...referencedIds(topics),
      topicCount: Object.keys(topics).length,
      index: buildFileIndex(file.id, topics),
    })
    localStorage.setItem(LEGACY_DONE, '1')
    return file.id
  } catch {
    return null
  }
}

/** The Drive folder (and the listed size) of a picture, looked up among the files that use it. */
async function whereIs(id: string) {
  for (const f of await repository.list({ parentId: 'any' })) {
    const folder = f.driveMeta?.picturesFolderId
    if (folder && f.imageIds?.includes(id)) return { folder, ref: f.driveMeta?.refs?.find((r) => r.id === id) }
  }
  return null
}

/**
 * A picture this device does not have is fetched from the map's Drive folder, checked against its content hash (a damaged or
 * swapped file is never used), and kept in this browser so it is downloaded once.
 */
function installPictureFetching() {
  setPictureFallback({
    async full(id) {
      const at = await whereIs(id)
      if (!at) return null
      const got = await pictureFetcher.fetch(at.folder, id, 'full')
      const blob = new Blob([got.bytes as BlobPart], { type: got.type })
      if (!(await matchesId(id, blob))) return null // damaged or swapped in Drive: never used
      const dims = at.ref ?? (await measure(blob))
      const img = { id, blob, width: dims.width, height: dims.height, type: got.type, size: got.bytes.byteLength }
      await imageStore.put(img)
      return img
    },
    async thumb(id) {
      const at = await whereIs(id)
      if (!at) return null
      const got = await pictureFetcher.fetch(at.folder, id, 'thumb')
      return new Blob([got.bytes as BlobPart], { type: got.type })
    },
  })
}

async function measure(blob: Blob): Promise<{ width: number; height: number }> {
  try {
    const bmp = await createImageBitmap(blob)
    const out = { width: bmp.width, height: bmp.height }
    bmp.close()
    return out
  } catch {
    return { width: 1, height: 1 }
  }
}

/** Asks the browser to keep this site's data (pictures included) even when the disk is nearly full. */
async function keepStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted?.())) await navigator.storage.persist()
  } catch {
    /* not supported: nothing to do */
  }
}

/** Runs once when the app starts. */
export async function boot(): Promise<void> {
  setBlobStores({ images: imageStore, attachments: attachmentStore })
  installPictureFetching()
  void keepStorage()
  // Pictures that were waiting to go to Drive when the page was closed (or crashed) carry on by themselves.
  void pictureSync.resumeFromLedger().catch(() => undefined)
  await migrateLegacyMap()
  // Remove pictures and attachments that no file uses any more.
  await sweepUnusedImages()
  await sweepAttachments()
}
