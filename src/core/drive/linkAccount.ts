import type { DriveAuth } from './auth'
import type { DriveClient } from './client'
import { DriveAccountError } from './errors'

const GMAIL = /^(gmail|googlemail)\.com$/i

/** An address in the form Google treats as one account: lower case, and for Gmail no dots, no "+tag", and googlemail.com is gmail.com. */
export function googleKey(email: string): string {
  const [local = '', domain = ''] = email.trim().toLowerCase().split('@')
  if (!GMAIL.test(domain)) return `${local}@${domain}`
  return `${local.split('+')[0]?.replace(/\./g, '') ?? ''}@gmail.com`
}

export const sameGoogleAccount = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && googleKey(a) === googleKey(b)

/**
 * The Google account Drive MUST be linked to, or null when any Google account may be used.
 *   - signed in with Google: that Google address;
 *   - signed in by email code or password with a Gmail address: that address (it is a Google account by definition);
 *   - any other email address: it may or may not be a Google account, so the person chooses (and the choice is saved in their account).
 */
export function expectedDriveEmail(user: { email: string | null; googleEmail: string | null } | null | undefined): string | null {
  if (!user) return null
  if (user.googleEmail) return user.googleEmail
  if (user.email && GMAIL.test(user.email.split('@')[1] ?? '')) return user.email
  return null
}

/**
 * Called right after a Drive token was obtained (by Google's window, or during sign-in). Reads which Google account the token belongs
 * to. If a specific account is required and this is not it, the token is thrown away (and revoked), nothing is linked, and a
 * `DriveAccountError` says exactly which account it was. Otherwise the account is recorded and returned.
 */
export async function linkDriveAccount(deps: { auth: Pick<DriveAuth, 'discard' | 'setAccount'>; client: Pick<DriveClient, 'accountEmail' | 'account'> }, expected: string | null): Promise<string | null> {
  if (!expected) {
    // Any Google account may be used (a guest, or an address that is not a Google account): record whichever it is.
    const any = await deps.client.account()
    deps.auth.setAccount(any)
    return any
  }
  const email = await deps.client.accountEmail()
  if (!email) {
    await deps.auth.discard()
    throw new DriveAccountError('unreadable', null, expected)
  }
  if (!sameGoogleAccount(email, expected)) {
    await deps.auth.discard()
    throw new DriveAccountError('mismatch', email, expected)
  }
  deps.auth.setAccount(email)
  return email
}
