import { linkedFile } from '../links'
import { buildIndex as buildTopicIndex, childrenOf, type TopicMap } from '../model/tree'
import { noteText } from '../sanitize'
import type { FileIndex, FileLinkRef } from './types'

const MAX_NOTE_CHARS = 500
const MAX_TOPICS = 5000

/** What search, notes, resources and backlinks need from a map, taken when it is saved. */
export function buildFileIndex(fileId: string, topics: TopicMap): FileIndex {
  const out: FileIndex = { fileId, topics: [], resources: [] }
  let n = 0
  for (const t of Object.values(topics)) {
    if (++n > MAX_TOPICS) break
    const links: FileLinkRef[] = []
    const ref = linkedFile(t.link)
    if (ref) links.push({ file: ref.fileId, ...(ref.topicId ? { topic: ref.topicId } : {}) })
    const note = noteText(t.note).slice(0, MAX_NOTE_CHARS)
    // Only topics that have something worth searching beyond their text still need an entry for the text itself.
    out.topics.push({ id: t.id, text: t.text, note, tags: t.tags ?? [], links })
    if (t.image) out.resources.push({ kind: 'image', id: t.image.imageId, topicId: t.id, topicText: t.text })
    for (const a of t.attachments ?? []) {
      out.resources.push({ kind: 'file', id: a.id, name: a.name, size: a.size, type: a.type, topicId: t.id, topicText: t.text })
    }
  }
  return out
}

/** Pictures and attachments a map uses (so shared storage can be cleaned up safely across files). */
export function referencedIds(topics: TopicMap): { imageIds: string[]; attachmentIds: string[] } {
  const imageIds = new Set<string>()
  const attachmentIds = new Set<string>()
  for (const t of Object.values(topics)) {
    if (t.image) imageIds.add(t.image.imageId)
    for (const a of t.attachments ?? []) attachmentIds.add(a.id)
  }
  return { imageIds: [...imageIds], attachmentIds: [...attachmentIds] }
}

export interface Backlink {
  fileId: string
  topicId: string
  topicText: string
}

/** Topics in other files that link to this file (and, if given, to this particular topic). */
export function findBacklinks(indexes: readonly FileIndex[], fileId: string, topicId?: string): Backlink[] {
  const out: Backlink[] = []
  for (const idx of indexes) {
    if (idx.fileId === fileId) continue
    for (const t of idx.topics) {
      if (t.links.some((l) => l.file === fileId && (topicId === undefined || l.topic === topicId || l.topic === undefined))) {
        out.push({ fileId: idx.fileId, topicId: t.id, topicText: t.text })
      }
    }
  }
  return out
}

/** Titles of the topics directly under the central topic (handy for a quick outline of a file). */
export function mainBranchTitles(topics: TopicMap, rootId: string): string[] {
  return childrenOf(buildTopicIndex(topics), rootId).map((t) => t.text)
}
