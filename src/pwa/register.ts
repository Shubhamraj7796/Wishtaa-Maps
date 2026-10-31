import { setPwa } from './state'

/**
 * Registers the service worker (production only: in development a worker would hold old scripts) and watches it:
 *  - once it is in place, "offline ready" is switched on;
 *  - when a new version has been downloaded and is waiting, `updateReady` is switched on so the page can offer the update.
 * Everything is feature-detected: where there is no service worker support, nothing happens and the app works as before.
 */

interface WorkerLike {
  state: string
  postMessage(m: unknown): void
  addEventListener(t: 'statechange', fn: () => void): void
}
export interface RegistrationLike {
  waiting: WorkerLike | null
  installing: WorkerLike | null
  active?: unknown
  addEventListener(t: 'updatefound', fn: () => void): void
  update?: () => Promise<unknown>
}
export interface ContainerLike {
  controller: unknown
  register?: (url: string, o?: object) => Promise<RegistrationLike>
  addEventListener(t: 'controllerchange', fn: () => void): void
}

let waiting: WorkerLike | null = null
let reloadWhenTaken = false
let onTaken: () => void = () => undefined

/** Watches one registration. Exported for tests. */
export function watchRegistration(reg: RegistrationLike, container: ContainerLike) {
  const noteWaiting = (w: WorkerLike | null) => {
    // With no controller this is the very first install, not an update.
    if (w && container.controller) {
      waiting = w
      setPwa({ updateReady: true })
    }
  }
  const noteInstalling = (w: WorkerLike | null) => {
    if (!w) return
    w.addEventListener('statechange', () => {
      if (w.state !== 'installed') return
      if (container.controller) noteWaiting(w)
      else setPwa({ offlineReady: true })
    })
  }
  if (reg.active) setPwa({ offlineReady: true })
  noteWaiting(reg.waiting)
  noteInstalling(reg.installing)
  reg.addEventListener('updatefound', () => noteInstalling(reg.installing))
}

/** The person chose "reload": the waiting version takes over, and the page reloads once it has. */
export function applyUpdate(reload: () => void = () => location.reload()) {
  if (!waiting) {
    reload()
    return
  }
  reloadWhenTaken = true
  onTaken = reload
  waiting.postMessage({ type: 'SKIP_WAITING' })
}

export function registerServiceWorker(env: { container?: ContainerLike; production?: boolean; win?: Window } = {}): void {
  const production = env.production ?? import.meta.env.PROD
  const container = env.container ?? (typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? (navigator.serviceWorker as unknown as ContainerLike) : undefined)
  const win = env.win ?? (typeof window !== 'undefined' ? window : undefined)
  if (!production || !container?.register || !win) return
  container.addEventListener('controllerchange', () => {
    if (reloadWhenTaken) {
      reloadWhenTaken = false
      onTaken()
    }
  })
  const start = () => {
    container
      .register?.('/sw.js', { scope: '/' })
      .then((reg) => {
        watchRegistration(reg, container)
        // Look for a new version when the app comes back to the front and every hour, so nobody stays on an old one for days.
        const check = () => void reg.update?.().catch(() => undefined)
        win.addEventListener('focus', check)
        win.setInterval(check, 60 * 60 * 1000)
      })
      .catch(() => undefined) // no worker: the app simply works as it always did
  }
  if (win.document.readyState === 'complete') start()
  else win.addEventListener('load', start, { once: true })
}
