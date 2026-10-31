import { showNotice } from './notice'

/**
 * Notices when the same file is open in more than one tab of this browser. Both tabs would keep saving the same file and
 * each one's saves look like "someone else changed it" to the other, so the second tab is told, gently, instead of the
 * two quietly fighting. Uses BroadcastChannel; where it is missing nothing happens.
 */
const CHANNEL = 'wishtaamaps:open-files'
const tabId = Math.random().toString(36).slice(2)

type Msg = { type: 'open' | 'here' | 'close'; fileId: string; tab: string }

let channel: BroadcastChannel | null = null
let current: string | null = null
const others = new Set<string>()
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

function post(type: Msg['type'], fileId: string) {
  try {
    channel?.postMessage({ type, fileId, tab: tabId } satisfies Msg)
  } catch {
    /* ignore */
  }
}

function ensureChannel() {
  if (channel || typeof BroadcastChannel === 'undefined') return
  try {
    channel = new BroadcastChannel(CHANNEL)
  } catch {
    return
  }
  channel.onmessage = (e: MessageEvent<Msg>) => {
    const m = e.data
    if (!m || m.tab === tabId || m.fileId !== current) return
    if (m.type === 'close') {
      if (others.delete(m.tab)) emit()
      return
    }
    if (!others.has(m.tab)) {
      others.add(m.tab)
      emit()
      showNotice('This file is open in another tab. Edit it in one place at a time to avoid sync conflicts.', 9000)
    }
    if (m.type === 'open') post('here', m.fileId) // tell the newcomer we are here
  }
}

/** Call when a file is opened in the editor. */
export function watchFile(fileId: string) {
  ensureChannel()
  current = fileId
  others.clear()
  emit()
  post('open', fileId)
}

/** Call when the editor lets go of its file. */
export function unwatchFile() {
  if (current) post('close', current)
  current = null
  others.clear()
  emit()
}

export function otherTabOpen(): boolean {
  return others.size > 0
}

export function subscribeOtherTab(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
