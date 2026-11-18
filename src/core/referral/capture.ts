import { cleanReferralCode } from '../plan'

/**
 * Remembers a referral code from a link (https://maps.wishtaa.com/?ref=CODE) in this browser's local storage, for 30 days. It must live in
 * local storage (not the page address) so it survives the trip to Google and back, or the emailed confirmation link, and be attached to the
 * new account after sign-in. Nothing else is stored: no name, no email.
 */
export const REF_KEY = 'wishtaamaps:ref'
export const REF_DAYS = 30
const DAY = 86_400_000

interface Stored {
  code: string
  savedAt: number
}

/** Reads the code from a query string ("?ref=abcd2345&x=1"). Anything that is not a well-formed code gives null. */
export function refFromSearch(search: string): string | null {
  try {
    return cleanReferralCode(new URLSearchParams(search).get('ref'))
  } catch {
    return null
  }
}

/** The address search without `ref` (so the link is not left in the address bar), or null when there is no `ref` to remove. */
export function searchWithoutRef(search: string): string | null {
  try {
    const p = new URLSearchParams(search)
    if (!p.has('ref')) return null
    p.delete('ref')
    const rest = p.toString()
    return rest ? `?${rest}` : ''
  } catch {
    return null
  }
}

/** Stores a good code (the newest link wins). A bad or missing code changes nothing. Returns what is stored now, if anything. */
export function rememberRef(code: string | null, storage: Storage | undefined, now = Date.now()): string | null {
  const clean = cleanReferralCode(code)
  if (!clean || !storage) return readRef(storage, now)
  try {
    storage.setItem(REF_KEY, JSON.stringify({ code: clean, savedAt: now } satisfies Stored))
  } catch {
    /* storage full or blocked: the referral is simply not remembered */
  }
  return clean
}

/** The remembered code, or null when there is none or it is older than 30 days (an expired one is removed). */
export function readRef(storage: Storage | undefined, now = Date.now()): string | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(REF_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Partial<Stored>
    const code = cleanReferralCode(s.code)
    if (!code || typeof s.savedAt !== 'number' || now - s.savedAt > REF_DAYS * DAY || s.savedAt > now + DAY) {
      storage.removeItem(REF_KEY)
      return null
    }
    return code
  } catch {
    try {
      storage.removeItem(REF_KEY)
    } catch {
      /* ignore */
    }
    return null
  }
}

export function clearRef(storage: Storage | undefined) {
  try {
    storage?.removeItem(REF_KEY)
  } catch {
    /* ignore */
  }
}

/** The sign-in link of a person: the app's address plus ?ref=CODE. */
export const referralLink = (origin: string, code: string) => `${origin.replace(/\/+$/, '')}/?ref=${code}`
