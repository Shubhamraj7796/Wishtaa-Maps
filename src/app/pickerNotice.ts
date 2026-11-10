import { PickerUnavailableError, type PickerFailure, type PickerKind } from '@/core/drive/errors'
import { useAuthUi } from './authUi'
import { appVersion } from './chunkRecovery'

export type PickerChoice = 'retry' | 'device' | 'close'

export const PICKER_NAMES: Record<PickerKind, string> = { 'open-map': 'open a map', folder: 'save-to folder', pdf: 'PDF' }
export const PICKER_REASONS: Record<PickerFailure, string> = { 'script-blocked': 'script blocked', 'never-loaded': 'never loaded', 'start-failed': 'popup or frame could not start' }

/** Shows the "Google Drive could not open in this browser" notice and waits for what the person chooses. Closing it is "close". */
export function askPickerNotice(which: PickerKind, reason: PickerFailure): Promise<PickerChoice> {
  return new Promise((resolve) => {
    let answered = false
    const answer = (c: PickerChoice) => {
      if (answered) return
      answered = true
      resolve(c)
    }
    useAuthUi.getState().openNow({ kind: 'picker-problem', which, reason, answer })
  })
}

/**
 * Runs a Google picker. If the browser will not show it, the notice appears (once) and the person decides: Try again runs it again,
 * "Choose a file from this device" has already opened the device chooser, and closing the notice gives up. Cancelling the picker
 * itself is an ordinary answer and never shows the notice.
 */
export async function withPickerNotice<T>(run: () => Promise<T>, onGiveUp: T): Promise<T> {
  for (;;) {
    try {
      return await run()
    } catch (e) {
      if (!(e instanceof PickerUnavailableError)) throw e
      const choice = await askPickerNotice(e.which, e.reason)
      if (choice !== 'retry') return onGiveUp
    }
  }
}

/** "Chrome 131", "Edge 131", "Firefox 132" ... from what the browser says about itself (name and major version only). */
export function browserLabel(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  const pick = (re: RegExp, name: string) => {
    const m = re.exec(ua)
    return m ? `${name} ${m[1]}` : null
  }
  return pick(/Edg\/(\d+)/, 'Edge') ?? pick(/OPR\/(\d+)/, 'Opera') ?? pick(/Firefox\/(\d+)/, 'Firefox') ?? pick(/(?:Chrome|CriOS)\/(\d+)/, 'Chrome') ?? pick(/Version\/(\d+).*Safari/, 'Safari') ?? 'unknown browser'
}

/** What "Copy details" copies: which picker, why, the browser and the app version. No file names, no tokens, nothing personal. */
export async function pickerDetails(which: PickerKind, reason: PickerFailure): Promise<string> {
  let name = browserLabel()
  try {
    // Brave says it is Chrome; it can be asked.
    const brave = (navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } }).brave
    if (brave?.isBrave && (await brave.isBrave())) name = `Brave (${name})`
  } catch {
    /* best effort */
  }
  return ['Wishtaa Maps: Google picker problem', `Picker: ${PICKER_NAMES[which]}`, `Reason: ${PICKER_REASONS[reason]}`, `Browser: ${name}`, `App version: ${appVersion()}`, `Time: ${new Date().toISOString()}`].join('\n')
}
