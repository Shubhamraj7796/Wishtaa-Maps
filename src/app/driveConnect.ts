import { DriveAccountError, DriveError } from '@/core/drive/errors'
import { DRIVE_SCOPE } from '@/core/drive/auth'
import { expectedDriveEmail, linkDriveAccount } from '@/core/drive/linkAccount'
import { authConfig } from '@/core/auth/config'
import { auth } from './account'
import { appVersion } from './chunkRecovery'
import { driveAuth, driveClient, driveConfig } from './drive'

/** What went wrong when connecting Drive, in the terms the screen explains. */
export type DriveProblem =
  /** The Drive that was connected belongs to another Google account than the one required (or its address could not be read). */
  | { kind: 'account'; reason: 'mismatch' | 'unreadable'; actual: string | null; expected: string }
  /** Google's window closed or was refused before finishing: cancelled, or "Access blocked / app not verified / not a test user". */
  | { kind: 'blocked'; detail: string }
  /** The browser would not open Google's window. */
  | { kind: 'popup' }

export interface ConnectOptions {
  /** Always show Google's account chooser (when any Google account may be used). */
  chooseAccount?: boolean
  /** The Google account that must be used. Defaults to the one the person signed in with (see `expectedDriveEmail`). */
  expected?: string | null
}

/**
 * Connects Google Drive: asks Google for the narrow Drive permission (suggesting the right account), then CHECKS which account the
 * token belongs to. A token for the wrong account is thrown away before anything is linked or saved.
 */
export async function connectDrive(o: ConnectOptions = {}): Promise<string | null> {
  const expected = o.expected !== undefined ? o.expected : expectedDriveEmail(auth.state.user)
  if (expected) driveAuth.setLoginHint(expected)
  await driveAuth.connect({ chooseAccount: o.chooseAccount && !expected })
  const account = await linkDriveAccount({ auth: driveAuth, client: driveClient }, expected)
  await driveClient.ensureAppFolder()
  return account
}

/** Turns a failure into a problem the person can act on, or null for an ordinary error that is just shown as a message. */
export function classifyDriveProblem(e: unknown, wasFirstConnect: boolean): DriveProblem | null {
  if (e instanceof DriveAccountError) return { kind: 'account', reason: e.reason, actual: e.actual, expected: e.expected }
  if (!(e instanceof DriveError)) return null
  if (e.kind === 'popup') return { kind: 'popup' }
  if (e.kind === 'revoked' && /access_denied/i.test(e.detail ?? '')) return { kind: 'blocked', detail: e.detail ?? 'access_denied' }
  // Closing the window on the very first connect is either a change of mind or Google's "Access blocked" page: say what to do for both.
  if (e.kind === 'auth' && e.detail === 'popup_closed' && wasFirstConnect) return { kind: 'blocked', detail: 'popup_closed' }
  return null
}

/** The text of "Copy details": what happened and in which browser, to send to whoever is approving the app. Never a token. */
export function driveProblemDetails(p: DriveProblem): string {
  const me = auth.state.user
  const lines = [
    'Wishtaa Maps: Google Drive connection problem',
    `Problem: ${p.kind === 'account' ? `${p.reason} (Drive account ${p.actual ?? 'unknown'}, required ${p.expected})` : p.kind === 'blocked' ? `Google window not completed (${p.detail})` : 'Browser blocked the Google window'}`,
    `Signed in as: ${me?.email ?? 'not signed in'}`,
    `Requested permission: ${DRIVE_SCOPE}`,
    `Google client: ${driveConfig.clientId ? `${driveConfig.clientId.slice(0, 12)}...` : 'not set'}`,
    `Version: ${appVersion()}`,
    `Browser: ${typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent}`,
    `Time: ${new Date().toISOString()}`,
  ]
  return lines.join('\n')
}

export const supportEmail = authConfig.supportEmail
