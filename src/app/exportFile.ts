import { makeBundle, makeSharedCopy } from '@/core/files/bundle'
import type { FileRecord, FileRepository } from '@/core/files/types'
import { attachmentStore } from '@/editor/attachments'
import { imageStore } from '@/editor/images'

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Map'

function save(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

async function input(file: FileRecord, repo: FileRepository) {
  const content = await repo.loadContent(file.id)
  if (!content) throw new Error('This file could not be read.')
  return { type: file.type === 'kb' ? ('kb' as const) : ('map' as const), name: file.name, createdAt: file.createdAt, modifiedAt: file.modifiedAt, content, imageIds: file.imageIds, attachmentIds: file.attachmentIds }
}

const stores = () => ({ images: imageStore, attachments: attachmentStore })

/** "Download as a single file": the map and a pictures folder in one zip. Opens in any Wishtaa Maps (Import). */
export async function downloadBundle(file: FileRecord, repo: FileRepository): Promise<void> {
  const bytes = await makeBundle(await input(file, repo), stores())
  save(`${safeName(file.name)}.wishtaa.zip`, new Blob([bytes as BlobPart], { type: 'application/zip' }))
}

/**
 * "Share a copy": one file with the pictures inside. The app can only read Drive files it made itself, so someone who is sent the
 * map's Drive file could not read its pictures folder; this copy has no such dependence.
 */
export async function downloadSharedCopy(file: FileRecord, repo: FileRepository): Promise<void> {
  const text = await makeSharedCopy(await input(file, repo), stores())
  save(`${safeName(file.name)}.wishtaa`, new Blob([text], { type: 'application/json' }))
}
