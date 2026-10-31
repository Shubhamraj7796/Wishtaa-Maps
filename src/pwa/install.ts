import { setPwa } from './state'

/** The browser install offer (Chrome, Edge and other Chromium browsers; not Safari or Firefox). */
interface InstallPrompt extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let saved: InstallPrompt | null = null

/** True when this window is the installed app (a display mode, or the flag iOS sets). */
export function isStandalone(win: Window = window): boolean {
  try {
    return win.matchMedia?.('(display-mode: standalone)').matches === true || (win.navigator as Navigator & { standalone?: boolean }).standalone === true
  } catch {
    return false
  }
}

/** Starts listening for the install offer. Returns a function that stops. */
export function listenForInstall(win: Window = window): () => void {
  setPwa({ standalone: isStandalone(win) })
  const onOffer = (e: Event) => {
    e.preventDefault() // keep the offer for our own button, instead of the browser mini bar
    saved = e as InstallPrompt
    setPwa({ canInstall: true })
  }
  const onInstalled = () => {
    saved = null
    setPwa({ canInstall: false, installed: true })
  }
  win.addEventListener('beforeinstallprompt', onOffer)
  win.addEventListener('appinstalled', onInstalled)
  return () => {
    win.removeEventListener('beforeinstallprompt', onOffer)
    win.removeEventListener('appinstalled', onInstalled)
  }
}

/** Shows the browser install window. The offer can be used once. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const offer = saved
  if (!offer) return 'unavailable'
  saved = null
  setPwa({ canInstall: false })
  try {
    await offer.prompt()
    const { outcome } = await offer.userChoice
    if (outcome === 'accepted') setPwa({ installed: true })
    return outcome
  } catch {
    return 'unavailable'
  }
}
