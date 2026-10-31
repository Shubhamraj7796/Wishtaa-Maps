/**
 * Optional diagnostics for Google Drive syncing. Off by default. Turn on in the browser console with
 * `localStorage.setItem('wishtaamaps:debug-drive', '1')` (and reload), or open any page with `?debug=drive`.
 * Entries are printed to the console and kept in `window.__driveLog` (the last 200).
 */
const KEY = 'wishtaamaps:debug-drive'

function enabled(): boolean {
  try {
    if (typeof location !== 'undefined' && /[?&]debug=drive\b/.test(location.search)) return true
    return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function driveLog(event: string, data: Record<string, unknown> = {}) {
  if (!enabled()) return
  const entry = { t: new Date().toISOString(), event, ...data }
  const w = globalThis as unknown as { __driveLog?: unknown[] }
  const log = (w.__driveLog ??= [])
  log.push(entry)
  if (log.length > 200) log.shift()
  console.debug('[drive]', event, data)
}
