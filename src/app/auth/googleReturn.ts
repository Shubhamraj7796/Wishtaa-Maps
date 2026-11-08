/**
 * Signing in with Google leaves the page and comes back. This note (kept for the tab only) tells the app, on the way back, that the
 * person just signed in with Google, so it can ask for Google Drive access straight away (see `AuthHost`).
 */
const KEY = 'wishtaamaps:google-return'

export function markGoogleReturn() {
  try {
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    /* without it the person simply connects Drive from the account page */
  }
}

/** True once, if the page was reached by returning from a Google sign-in started in the last 10 minutes. */
export function takeGoogleReturn(now = Date.now()): boolean {
  try {
    const at = Number(sessionStorage.getItem(KEY))
    sessionStorage.removeItem(KEY)
    return !!at && now - at < 10 * 60_000
  } catch {
    return false
  }
}
