import { useEffect, useState } from 'react'
import { promptInstall } from '@/pwa/install'
import { applyUpdate } from '@/pwa/register'
import { usePwa } from '@/pwa/state'
import { buttonPrimary, buttonSecondary } from './Modal'

/** "Update available - reload": a new version is downloaded and waiting. Your open map is saved first. Never forced. */
export function UpdateBar() {
  const ready = usePwa((s) => s.updateReady)
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!ready || hidden) return null
  const reload = async () => {
    setBusy(true)
    try {
      const { flushOpenFile } = await import('@/editor/session')
      await flushOpenFile() // whatever is open is written before the page reloads
    } catch {
      /* nothing was open */
    }
    applyUpdate()
  }
  return (
    <div role="status" aria-live="polite" data-testid="update-bar" className="flex flex-wrap items-center gap-3 border-b border-line bg-brand/10 px-4 py-2 text-sm">
      <p className="min-w-0 flex-1">Update available - reload to use the newest version.</p>
      <button type="button" disabled={busy} onClick={() => void reload()} className={`${buttonPrimary} px-3 py-1 text-xs`}>
        {busy ? 'Reloading…' : 'Reload'}
      </button>
      <button type="button" onClick={() => setHidden(true)} className={`${buttonSecondary} px-3 py-1 text-xs`}>
        Later
      </button>
    </div>
  )
}

/** Preferences: install the app, in whatever way this browser offers. */
export function InstallApp() {
  const { canInstall, installed, standalone, offlineReady } = usePwa()
  const [note, setNote] = useState<string | null>(null)
  const [supported, setSupported] = useState(true)
  useEffect(() => setSupported(typeof navigator !== 'undefined' && 'serviceWorker' in navigator), [])
  return (
    <fieldset className="rounded-ui border border-line p-3">
      <legend className="px-1 font-semibold">Install app</legend>
      {standalone || installed ? (
        <p className="text-sm" data-testid="install-state">
          Wishtaa Maps is installed on this device.
        </p>
      ) : canInstall ? (
        <>
          <p className="mb-2 text-xs text-muted">Opens in its own window, starts fast, and works with no connection once it has loaded one time.</p>
          <button
            type="button"
            className={buttonPrimary}
            onClick={() =>
              void promptInstall().then((r) => setNote(r === 'accepted' ? 'Installing…' : r === 'dismissed' ? 'Not installed. You can install any time from here.' : 'The browser did not offer to install right now.'))
            }
          >
            Install Wishtaa Maps
          </button>
        </>
      ) : (
        <p className="text-xs text-muted" data-testid="install-state">
          {supported
            ? 'This browser does not show a one-tap install here. In Chrome or Edge, use the install icon in the address bar, or the menu, then Install app. On an iPhone or iPad, tap Share, then Add to Home Screen.'
            : 'This browser cannot install web apps. Wishtaa Maps still works here as a normal page.'}
        </p>
      )}
      {note && (
        <p role="status" className="mt-2 text-xs text-muted">
          {note}
        </p>
      )}
      <p className="mt-2 text-xs text-muted">{offlineReady ? 'Ready to open with no connection (your maps are saved in this browser).' : 'Not saved for offline use yet. Open the app once with a connection.'}</p>
    </fieldset>
  )
}
