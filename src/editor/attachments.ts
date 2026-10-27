import { ImageGc } from '@/core/images/gc'
import { IndexedDbImageStore, MemoryImageStore, type ImageStore } from '@/core/images/store'
import { stripControl } from '@/core/text'
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, addAttachment, removeAttachment } from '@/core/model/content'
import { MAX_UNDO } from '@/core/model/doc'
import { newId } from '@/core/model/ids'
import type { Attachment } from '@/core/model/topic'
import { repository } from '../app/repo'
import { mapDoc } from './mapdoc'
import { showNotice } from './notice'
import { useEditor } from './store'

function createStore(): ImageStore {
  try {
    if (typeof indexedDB !== 'undefined') return new IndexedDbImageStore('wishtaa-maps-attachments')
  } catch {
    /* fall through */
  }
  return new MemoryImageStore()
}

/** Files attached to topics. Same interface as pictures, so it can move to Supabase Storage later. */
export const attachmentStore: ImageStore = createStore()

const referenced = async () => {
  const ids = await repository.referencedAttachmentIds()
  for (const t of Object.values(useEditor.getState().topics)) for (const a of t.attachments ?? []) ids.add(a.id)
  return ids
}
const gc = new ImageGc(attachmentStore, referenced, MAX_UNDO)
export const noteAttachmentStep = () => gc.noteStep()
export const scanAttachments = () => gc.scan().catch(() => [])
export const sweepAttachments = () => gc.sweepAll().catch(() => [])

/** A file name that is safe to show and to download as. */
export function cleanFileName(name: string): string {
  const base = stripControl(name).replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 120)
  return base || 'file'
}

export async function attachFiles(files: FileList | File[], topicId: string) {
  const topic = useEditor.getState().topics[topicId]
  if (!topic) return
  for (const file of Array.from(files)) {
    if ((topic.attachments?.length ?? 0) >= MAX_ATTACHMENTS) {
      showNotice(`A topic can hold up to ${MAX_ATTACHMENTS} attachments.`)
      return
    }
    if (file.size === 0) {
      showNotice(`“${cleanFileName(file.name)}” is empty.`)
      continue
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      showNotice(`“${cleanFileName(file.name)}” is larger than 10 MB.`)
      continue
    }
    const meta: Attachment = { id: newId(), name: cleanFileName(file.name), size: file.size, type: file.type || 'application/octet-stream' }
    try {
      await attachmentStore.put({ id: meta.id, blob: file, width: 0, height: 0, type: meta.type, size: meta.size })
      addAttachment(mapDoc, topicId, meta)
    } catch {
      showNotice("Couldn't save that file in this browser. Storage may be full or blocked.")
    }
  }
}

export const detachFile = (topicId: string, attachmentId: string) => removeAttachment(mapDoc, topicId, attachmentId)

export async function downloadAttachment(a: Attachment) {
  const stored = await attachmentStore.get(a.id).catch(() => undefined)
  if (!stored) {
    showNotice('That file is no longer stored in this browser.')
    return
  }
  const url = URL.createObjectURL(stored.blob)
  const link = document.createElement('a')
  link.href = url
  link.download = a.name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function pickFiles(multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = multiple
    input.onchange = () => resolve(Array.from(input.files ?? []))
    input.oncancel = () => resolve([])
    input.click()
  })
}

export const formatBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`)
