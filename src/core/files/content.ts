import * as Y from 'yjs'
import { createMapDoc, snapshotTopics } from '../model/doc'
import { buildFileIndex, referencedIds } from './indexer'
import type { SaveMeta } from './types'

/** Counters and search index for saved map content (used when content arrives from elsewhere, such as Drive). */
export function saveMetaFromContent(fileId: string, content: Uint8Array): SaveMeta {
  const doc = createMapDoc()
  Y.applyUpdate(doc.ydoc, content, 'load')
  const topics = snapshotTopics(doc)
  return { ...referencedIds(topics), topicCount: Object.keys(topics).length, index: buildFileIndex(fileId, topics) }
}

/** True if the bytes are a readable map document. */
export function isReadableContent(content: Uint8Array): boolean {
  try {
    Y.applyUpdate(new Y.Doc(), content)
    return true
  } catch {
    return false
  }
}
