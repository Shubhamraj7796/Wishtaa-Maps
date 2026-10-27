import type { FileRecord } from '@/core/files/types'

let navigator: ((to: string) => void) | null = null

/** Lets code outside React components (editor actions) change page. Set by the router. */
export function setNavigator(fn: ((to: string) => void) | null) {
  navigator = fn
}

export function navigateTo(to: string) {
  if (navigator) navigator(to)
  else window.location.assign(to)
}

/** The page that opens a file: maps at /map/:id, knowledge bases at /kb/:id, folders at /files/:id. */
export function routeForFile(file: Pick<FileRecord, 'id' | 'type'>, topicId?: string): string {
  if (file.type === 'folder') return `/files/${file.id}`
  const base = `/${file.type === 'kb' ? 'kb' : 'map'}/${file.id}`
  return topicId ? `${base}?topic=${encodeURIComponent(topicId)}` : base
}
