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

let openDrive: (() => void) | null = null
/** Lets the command palette start "Open from Google Drive". Set by the app shell. */
export function setOpenFromDriveHandler(fn: (() => void) | null) {
  openDrive = fn
}
export const requestOpenFromDrive = () => openDrive?.()
