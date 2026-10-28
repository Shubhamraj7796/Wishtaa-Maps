import * as Y from 'yjs'
import { buildFileIndex, referencedIds } from '@/core/files/indexer'
import type { FileRepository } from '@/core/files/types'
import { createMapDoc, snapshotTopics } from '@/core/model/doc'
import { fromBase64 } from '@/core/persistence'
import { attachmentStore, sweepAttachments } from '@/editor/attachments'
import { imageStore, sweepUnusedImages } from '@/editor/images'
import { repository, setBlobStores } from './repo'

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

/** Runs once when the app starts. */
export async function boot(): Promise<void> {
  setBlobStores({ images: imageStore, attachments: attachmentStore })
  await migrateLegacyMap()
  // Remove pictures and attachments that no file uses any more.
  await sweepUnusedImages()
  await sweepAttachments()
}
