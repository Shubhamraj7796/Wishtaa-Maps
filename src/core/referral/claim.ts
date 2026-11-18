import type { AccountDb } from '../auth/types'
import type { ClaimResult } from '../plan'
import { clearRef, readRef } from './capture'

/**
 * After a sign-in: attaches the remembered referral code (if any) to this account, ONCE. The database decides everything (is the account
 * new, is the code real, is it their own, has this person already been invited): every "no" is the quiet answer 'ignored', so a wrong or
 * old code never shows an error and never blocks the sign-in. The code is forgotten after any answer, and kept only when the network
 * failed, so it can be tried again at the next sign-in (it expires by itself after 30 days).
 */
export async function claimStoredReferral(db: AccountDb, storage: Storage | undefined, now = Date.now()): Promise<ClaimResult | null> {
  const code = readRef(storage, now)
  if (!code) return null
  try {
    const r = await db.claimReferral(code)
    clearRef(storage)
    return r
  } catch {
    return null
  }
}
