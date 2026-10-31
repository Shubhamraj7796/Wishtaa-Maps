import { lockDoc } from '@/core/model/lock'
import { mapDoc } from './mapdoc'
import { showNotice } from './notice'
import { flushOpenFile } from './session'
import { useEditor, type ReadReason } from './store'

const get = useEditor.getState
const set = useEditor.setState

export const isReadOnly = () => get().readOnly

/** What the editor looks like while reading: the lock on, edit state cleared, only view state left. */
export function applyMode(readOnly: boolean, reason: ReadReason | null = null, patch: Partial<ReturnType<typeof get>> = {}) {
  lockDoc(mapDoc.ydoc, readOnly)
  set({
    readOnly,
    readReason: readOnly ? reason : null,
    modeAnnouncement: readOnly ? 'Read mode. Nothing can be changed.' : 'Edit mode.',
    viewCollapsed: {},
    ...(readOnly
      ? {
          editingId: null,
          editingObject: null,
          selectedObject: null,
          imageSelected: null,
          painter: null,
          relationFrom: null,
          linkFrom: null,
          insertOpen: false,
          menu: null,
          themePreview: null,
          styleLive: null,
          widthLive: null,
          imageLive: null,
          ocrTopic: null,
          panelOpen: false,
        }
      : { readPanelOpen: false }),
    ...patch,
  })
}

/** Switches to Read mode once everything is saved: a pending edit is flushed first, and Read mode waits for "Saved". */
export async function enterReadMode(reason: ReadReason = 'user'): Promise<boolean> {
  if (get().readOnly) return true
  if (!(await flushOpenFile())) {
    showNotice('Your last change has not been saved yet. Read mode starts when the status shows Saved.', 7000)
    return false
  }
  applyMode(true, reason)
  return true
}

/** Back to editing. Not possible when the file can only be read. */
export function enterEditMode(): boolean {
  const s = get()
  if (!s.readOnly) return true
  if (!s.canEdit) {
    showNotice('This file can only be read: you do not have permission to edit it.')
    return false
  }
  applyMode(false)
  if (s.readFileDefault) showNotice('Editing is on. This file opens in Read mode by default, so it stays protected next time.', 7000)
  return true
}

export function toggleReadMode() {
  if (get().readOnly) enterEditMode()
  else void enterReadMode()
}

/** Called when something tries to change the map while reading. Quiet but clear, and never more than once a moment. */
let lastBlocked = 0
export function blockedInReadMode(what = 'This') {
  const now = Date.now()
  if (now - lastBlocked < 1500) return
  lastBlocked = now
  showNotice(`${what} is not available in Read mode. Switch to Edit to change the map.`, 4000)
}

/** For actions that only change editor state (not the document): true means "go ahead". */
export function mayEdit(what?: string): boolean {
  if (!get().readOnly) return true
  blockedInReadMode(what)
  return false
}
