import type { NewItem } from '@/core/drive/create'

type Handler = (item: NewItem) => void
let handler: Handler | null = null

/** Lets code outside React (the editor's command palette) start "new file". Set by the app shell. */
export function setCreateHandler(fn: Handler | null) {
  handler = fn
}

export function requestCreate(item: NewItem) {
  handler?.(item)
}
