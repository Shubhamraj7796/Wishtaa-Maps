export type DriveErrorKind =
  | 'auth' // not signed in, or the sign-in expired and could not be renewed silently
  | 'revoked' // access to Drive (or to this file) was removed
  | 'offline'
  | 'quota' // Drive is full
  | 'rate' // too many requests, try again shortly
  | 'notfound'
  | 'conflict'
  | 'config' // client id / API key not set up
  | 'other'

/** Anything that goes wrong talking to Google Drive, with a message that is safe to show. */
export class DriveError extends Error {
  constructor(
    public readonly kind: DriveErrorKind,
    message: string,
    public readonly status?: number
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
