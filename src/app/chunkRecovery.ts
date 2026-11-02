import { lazy, type ComponentType } from 'react'

/**
 * After a new version is deployed, a tab that was already open still runs the OLD scripts, and the files they ask for later (a panel
 * loaded on demand, such as the PDF viewer) no longer exist. The browser then reports "Failed to fetch dynamically imported module".
 * This recognises that, clears what the service worker kept of the old app, and reloads ONCE so the tab carries on with the new version.
 */

const FAILED_IMPORT = /dynamically imported module|importing a module script failed|error loading dynamically imported|ChunkLoadError|Unable to preload CSS|Loading chunk .* failed|Loading CSS chunk/i

export function isChunkError(e: unknown): boolean {
  if (!e) return false
  const text = e instanceof Error ? `${e.name} ${e.message}` : String(e)
  return FAILED_IMPORT.test(text)
}

const GUARD = 'wishtaamaps:stale-reload'
const AFTER = 'wishtaamaps:after-recover'

/** What was being opened when the app updated itself (once), so it can be opened again. */
export function takeAfterRecover(): 'pdf' | null {
  try {
    const v = sessionStorage.getItem(AFTER)
    sessionStorage.removeItem(AFTER)
    return v === 'pdf' ? 'pdf' : null
  } catch {
    return null
  }
}
/** A second automatic reload within this time is not made (it would be a loop); the person is asked instead. */
export const RELOAD_GUARD_MS = 60_000

function read(): number {
  try {
    return Number(sessionStorage.getItem(GUARD)) || 0
  } catch {
    return 0
  }
}

/** True when an automatic reload was already made a moment ago. */
export const alreadyReloaded = (now = Date.now()) => now - read() < RELOAD_GUARD_MS

/** True while that reload is still on its way (it was started in the last few seconds). */
export const reloadInProgress = (now = Date.now()) => now - read() < 5000

/** The caches that hold the app itself (never the pictures shared in, which are the person's). */
export const isAppCache = (name: string) => name === 'wishtaa-assets' || name.startsWith('wishtaa-shell-')

/** Forgets what the service worker kept of the old app. Safe to call at any time: it is all fetched again from the network. */
export async function clearAppCaches(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return
    for (const name of await caches.keys()) if (isAppCache(name)) await caches.delete(name)
  } catch {
    /* nothing to clear */
  }
}

/**
 * Brings a stale tab up to date: clear the app's caches, ask the service worker to look for the new version, and reload once.
 * Returns 'reloading', or 'already-tried' when it has just done so (the caller then shows the manual "Reload app").
 */
export async function recoverFromStaleBuild(reload: () => void = () => location.reload(), then?: 'pdf'): Promise<'reloading' | 'already-tried'> {
  if (alreadyReloaded()) {
    // The same recovery was started a moment ago by another listener: still note what was being opened, so it comes back.
    if (then && reloadInProgress()) {
      try {
        sessionStorage.setItem(AFTER, then)
      } catch {
        /* ignore */
      }
    }
    return 'already-tried'
  }
  try {
    sessionStorage.setItem(GUARD, String(Date.now()))
    // What the person was opening comes back by itself after the reload.
    if (then) sessionStorage.setItem(AFTER, then)
  } catch {
    /* without session storage the guard cannot be kept: do not reload by ourselves, a loop would be possible */
    return 'already-tried'
  }
  await clearAppCaches()
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    await reg?.update()
  } catch {
    /* offline or no worker: the reload still gets the page from the network */
  }
  reload()
  return 'reloading'
}

/** `React.lazy` that survives a deploy: a failed import of an old file recovers once instead of leaving a broken panel. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(load: () => Promise<{ default: T }>, then?: 'pdf') {
  return lazy(async () => {
    try {
      return await load()
    } catch (e) {
      if (isChunkError(e)) {
        const r = await recoverFromStaleBuild(undefined, then)
        if (r === 'reloading' || reloadInProgress()) return new Promise<never>(() => undefined) // the page is reloading: nothing is shown meanwhile
      }
      throw e
    }
  })
}

/** Vite reports a failed preload of a script or style as an event; the same recovery applies. */
export function installChunkRecovery() {
  if (typeof window === 'undefined') return
  // The event is only listened to, not stopped: the import still fails with its own error, which the caller (and the error panel)
  // recognise as an old-version problem.
  window.addEventListener('vite:preloadError', () => void recoverFromStaleBuild())
  window.addEventListener('unhandledrejection', (e) => {
    if (isChunkError(e.reason)) {
      e.preventDefault()
      void recoverFromStaleBuild()
    }
  })
  // The guard only has to stop a loop; once the new version has run for a while it can be forgotten.
  window.setTimeout(() => {
    try {
      sessionStorage.removeItem(GUARD)
    } catch {
      /* ignore */
    }
  }, RELOAD_GUARD_MS)
}

/** The version of the app this tab is running (the name of its main script), for bug reports. */
export function appVersion(): string {
  try {
    const src = [...document.scripts].map((s) => s.src).find((s) => /\/assets\/index-/.test(s))
    return src?.split('/').pop() ?? 'dev'
  } catch {
    return 'unknown'
  }
}

/** A short, plain reason for an error, and whether it is a stale-version problem. No document content is ever included. */
export function describeError(e: unknown, label = 'This panel'): { title: string; hint: string; stale: boolean } {
  const message = e instanceof Error ? e.message : String(e ?? '')
  if (isChunkError(e)) return { title: `Could not load ${label === 'The PDF panel' ? 'the PDF viewer' : label.toLowerCase()}`, hint: 'The app was updated while this tab was open. Reloading brings the new version.', stale: true }
  if (/password/i.test(message)) return { title: 'This PDF needs a password', hint: 'Open it again with the + button and enter the password.', stale: false }
  if (/not available on this device|no longer stored|missing/i.test(message)) return { title: 'The PDF is not available on this device', hint: 'Reopen it from this device or from Google Drive.', stale: false }
  if (/pdf|damaged|could not be (read|opened)|not a pdf/i.test(message) && label === 'The PDF panel') return { title: 'Could not read this PDF', hint: message.slice(0, 160), stale: false }
  return { title: `${label} ran into a problem`, hint: 'Your map and its saved changes are not affected.', stale: false }
}

/** What "Copy details" puts on the clipboard: the error, the app version and the browser. Nothing from the map or any document. */
export function errorDetails(e: unknown, label: string): string {
  const err = e instanceof Error ? e : new Error(String(e))
  return [`${label}: ${err.name}: ${err.message}`, `Version: ${appVersion()}`, `Browser: ${typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent}`, `Time: ${new Date().toISOString()}`, (err.stack ?? '').split('\n').slice(0, 6).join('\n')].join('\n')
}
