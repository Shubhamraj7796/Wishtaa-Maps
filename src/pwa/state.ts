import { create } from 'zustand'

/** What the installed-app features know right now. Every field starts false: nothing is assumed until the browser says so. */
export interface PwaState {
  /** A new version of the app has been downloaded and is waiting: "Update available - reload". */
  updateReady: boolean
  /** The browser offered to install the app (and the offer is still usable). */
  canInstall: boolean
  /** The app is installed on this device (or was just installed). */
  installed: boolean
  /** This window is the installed app (no browser address bar). */
  standalone: boolean
  /** The app has been saved for opening with no connection. */
  offlineReady: boolean
}

export const usePwa = create<PwaState>(() => ({ updateReady: false, canInstall: false, installed: false, standalone: false, offlineReady: false }))
export const setPwa = (patch: Partial<PwaState>) => usePwa.setState(patch)
