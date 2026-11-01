import { applyDelta } from '@/core/drive/merge'
import type { RemoteChange } from '@/core/drive/repository'
import { driveRepository } from '../app/repo'
import { showNotice } from './notice'
import { mapDoc } from './mapdoc'

/** How often an open Drive map is compared with Drive while the tab is visible (milliseconds). */
export const CHECK_EVERY = 60_000

interface Control {
  /** Anything typed that is not yet written. */
  hasUnsaved: () => boolean
  /** Writes it now (which also merges it with a newer version in Drive, if there is one). */
  flush: () => Promise<void>
}

/**
 * Keeps an open Drive map up to date with the other devices. A newer version in Drive is looked for (metadata only) when the tab
 * becomes visible, gets the focus, the connection returns, and every minute while it is visible. What comes in is put into the map on
 * screen quietly: the selection and the view stay, and anything typed in the meantime is left alone. Returns a function that stops it.
 */
export function startRemoteSync(fileId: string, ctl: Control): () => void {
  let running = false
  let again = false
  let stopped = false

  const check = async () => {
    if (stopped || document.visibilityState === 'hidden') return
    if (running) {
      again = true
      return
    }
    running = true
    try {
      if (ctl.hasUnsaved()) await ctl.flush() // sends (and merges) what was typed first
      await driveRepository.checkRemote(fileId)
    } finally {
      running = false
    }
    if (again && !stopped) {
      again = false
      void check()
    }
  }

  const stopListening = driveRepository.onRemoteChange((c) => {
    if (stopped || c.fileId !== fileId) return
    show(c)
  })
  const onVisible = () => document.visibilityState === 'visible' && void check()
  const onFocus = () => void check()
  const onOnline = () => void check()
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onFocus)
  window.addEventListener('online', onOnline)
  const timer = window.setInterval(() => void check(), CHECK_EVERY)
  void check() // right away: a map opened from the copy kept here may already be behind

  return () => {
    stopped = true
    stopListening()
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', onFocus)
    window.removeEventListener('online', onOnline)
    window.clearInterval(timer)
  }
}

/** Puts a change from another device into the open map and says so. */
export function show(c: RemoteChange) {
  const changes = applyDelta(mapDoc, c.before, c.content)
  if (!changes) return
  if (c.kind === 'merged') {
    showNotice(c.conflicts.length ? `Merged changes from another device. ${c.conflicts.length === 1 ? 'One edit' : `${c.conflicts.length} edits`} clashed: the newer was kept. File menu, Recover earlier version, has the other.` : 'Merged changes from another device.')
  } else showNotice('Updated from another device.')
}
