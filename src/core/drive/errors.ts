export type DriveErrorKind =
  | 'auth' // not signed in, or the sign-in expired and could not be renewed silently
  | 'revoked' // access to Drive (or to this file) was removed
  | 'offline'
  | 'quota' // Drive is full
  | 'rate' // too many requests, try again shortly
  | 'notfound'
  | 'conflict'
  | 'config' // client id / API key not set up
  | 'account' // the Google account that was chosen is not the one the person signed in with (or could not be read)
  | 'popup' // the browser would not open Google's window without a click (a quiet renewal had to wait for one)
  | 'other'

/** Anything that goes wrong talking to Google Drive, with a message that is safe to show. */
export class DriveError extends Error {
  constructor(
    public readonly kind: DriveErrorKind,
    message: string,
    public readonly status?: number,
    /** The raw reason from Google (an error type or description), kept for "Copy details". Never a token. */
    public readonly detail?: string
  ) {
    super(message)
    this.name = 'DriveError'
  }

  /** Read by the autosaver to show "Offline - will sync" instead of an error. */
  get offline(): boolean {
    return this.kind === 'offline'
  }
}

/** The file in Drive changed (on another device) since we last synced, and so did the local copy. */
export class DriveConflictError extends DriveError {
  constructor(message = 'This file was changed in Google Drive. Choose which version to keep.') {
    super('conflict', message)
    this.name = 'DriveConflictError'
  }
}

/** The Drive that was connected belongs to a different Google account than the one required. */
export class DriveAccountError extends DriveError {
  constructor(
    public readonly reason: 'mismatch' | 'unreadable',
    /** The Google account the token belongs to (null when it could not be read). */
    public readonly actual: string | null,
    /** The account that was required. */
    public readonly expected: string
  ) {
    super(
      'account',
      reason === 'mismatch'
        ? `This Drive belongs to ${actual}. Please use the same Google account you signed in with (${expected}).`
        : `Could not confirm which Google account this Drive belongs to. Please try again with ${expected}.`
    )
    this.name = 'DriveAccountError'
  }
}
