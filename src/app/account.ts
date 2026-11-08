import { useSyncExternalStore } from 'react'
import { AccountSync } from '@/core/auth/accountSync'
import { authConfig, authEnabled } from '@/core/auth/config'
import { AuthController, type AccountHooks, type AuthState } from '@/core/auth/controller'
import { PREFS_VERSION, pickPrefs, samePrefs, sanitizePrefs } from '@/core/auth/prefs'
import type { AccountDb, AuthUser } from '@/core/auth/types'
import type { FileRecord } from '@/core/files/types'
import { useSettings } from '@/stores/settings'
import { useAuthUi } from './authUi'
import { driveAuth, FOLDER_KEY } from './drive'
import { driveRepository, repository } from './repo'

const local = (): Storage | undefined => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}
const session = (): Storage | undefined => {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage
  } catch {
    return undefined
  }
}

/** True when this page load is the return from Google or from an emailed link: the saved sign-in must be read before anything is shown. */
function returningFromAuth(): boolean {
  if (typeof location === 'undefined') return false
  return /[?&](code|error_code|error_description)=/.test(location.search) || /(^|[#&])(access_token|error_code|error_description)=/.test(location.hash) || location.pathname === '/reset-password'
}

let sync: AccountSync | null = null
let stopPrefs: (() => void) | null = null

const QUEUE_PREFIX = 'wishtaamaps:acct-queue:'
const OFFER_PREFIX = 'wishtaamaps:guest-offer:'
const LOCAL_RECENTS_PREFIX = 'wishtaamaps:local-recents:'

function stopAccountSync() {
  sync?.stop()
  sync = null
  stopPrefs?.()
  stopPrefs = null
}

const hooks: AccountHooks = {
  async clearAccountData(reason) {
    sync?.clear()
    stopAccountSync()
    try {
      const l = local()
      if (l) for (const k of Object.keys(l)) if (k.startsWith(QUEUE_PREFIX)) l.removeItem(k)
    } catch {
      /* ignore */
    }
    // The previous person's Google Drive access and the list of their Drive maps leave this browser. Guest files stay.
    try {
      await driveRepository.forgetDriveCache()
    } catch {
      /* a cache that cannot be cleared must not stop the sign-out */
    }
    driveAuth.forget()
    try {
      local()?.removeItem(FOLDER_KEY)
    } catch {
      /* ignore */
    }
    if (reason === 'other-user') notifyOnce('The previous account\'s Google Drive list was removed from this browser. Files saved as "This browser" were kept.')
  },
  signedIn(user, info) {
    void startAccountSync(user, info)
  },
}

let notice: ((text: string) => void) | null = null
let pendingNotice: string | null = null
function notifyOnce(text: string) {
  if (notice) notice(text)
  else pendingNotice = text
}
/** The screen registers its toast here, so messages from outside React reach the person. */
export function registerAccountNotice(fn: ((text: string) => void) | null) {
  notice = fn
  if (fn && pendingNotice) {
    const t = pendingNotice
    pendingNotice = null
    fn(t)
  }
}

export const auth = new AuthController(
  authEnabled && authConfig.url && authConfig.anonKey
    ? async () => {
        const { createSupabaseBackend } = await import('@/core/auth/supabaseBackend')
        return createSupabaseBackend(authConfig.url as string, authConfig.anonKey as string)
      }
    : null,
  { storage: local(), sessionStorage: session(), hooks, returning: returningFromAuth() }
)

export const useAuth = (): AuthState => useSyncExternalStore(auth.subscribe, auth.getState)

/** Called at start-up: reads the saved sign-in when there is one (or a sign-in link/Google return is being processed). */
export function startAuth() {
  if (!auth.enabled) return
  const s = auth.state
  if (s.status === 'signed-in' || s.status === 'loading' || returningFromAuth()) void auth.init()
}

// ---------------------------------------------------------------- account data
async function startAccountSync(user: AuthUser, info: { newBrowserUser: boolean }) {
  stopAccountSync()
  let db: AccountDb
  try {
    db = (await auth.backend()).db
  } catch {
    return
  }
  if (auth.state.user?.id !== user.id) return
  const s = new AccountSync(db, user.id, { storage: local(), onRejected: (what, msg) => console.warn('Account sync refused', what, msg) })
  sync = s
  s.start()
  void auth.loadProfile()
  void reconcilePrefs(db, s, user.id).catch(() => undefined)
  if (info.newBrowserUser) void offerGuestFiles(user.id)
}

/** The account's preferences win on a new device; a brand-new account takes this device's. After that, changes go up as they happen. */
async function reconcilePrefs(db: AccountDb, s: AccountSync, uid: string) {
  const remote = await db.getPrefs(uid)
  const read = () => pickPrefs(useSettings.getState() as unknown as Record<string, unknown>)
  let last = read()
  if (remote && remote.version <= PREFS_VERSION) {
    const incoming = sanitizePrefs(remote.data)
    if (Object.keys(incoming).length) {
      useSettings.getState().applySynced(incoming)
      last = read()
    } else s.prefs(PREFS_VERSION, last)
  } else if (!remote) s.prefs(PREFS_VERSION, last)
  if (sync !== s) return
  stopPrefs?.()
  stopPrefs = useSettings.subscribe(() => {
    const now = read()
    if (samePrefs(now, last)) return
    last = now
    s.prefs(PREFS_VERSION, now)
  })
}

// --------------------------------------------------------------- recent files
const wantsLocalRecents = (uid: string) => local()?.getItem(LOCAL_RECENTS_PREFIX + uid) !== 'off'
export const localRecentsOn = (uid: string) => wantsLocalRecents(uid)
export function setLocalRecents(uid: string, on: boolean) {
  try {
    local()?.setItem(LOCAL_RECENTS_PREFIX + uid, on ? 'on' : 'off')
  } catch {
    /* ignore */
  }
}

const toRow = (f: FileRecord, when = Date.now()) => ({
  file_ref: f.id,
  title: f.name.slice(0, 300),
  storage_kind: f.storage === 'drive' && f.contentRef ? ('drive' as const) : ('local' as const),
  drive_file_id: f.storage === 'drive' && f.contentRef ? f.contentRef : null,
  last_opened: new Date(when).toISOString(),
})

/** Notes that a file was opened (title and ids only, never content). Drive files always; files in this browser unless the person turned it off. */
export function recordRecentFile(file: FileRecord) {
  const uid = sync?.uid
  if (!uid || file.type === 'folder') return
  if (file.storage !== 'drive' && !wantsLocalRecents(uid)) return
  sync?.recent(toRow(file))
}

/** Adds the files that are in this browser to the account's recent list. Called from the "Add my files to my account" choice. */
export async function addGuestFilesToAccount(): Promise<number> {
  const uid = sync?.uid
  if (!uid) return 0
  setLocalRecents(uid, true)
  const files = (await repository.list({ parentId: 'any' })).filter((f) => !f.trashed && f.type !== 'folder')
  const base = Date.now()
  files.forEach((f, i) => sync?.recent(toRow(f, base - i * 1000)))
  await sync?.flush()
  return files.length
}

export function markGuestOfferDone(uid: string) {
  try {
    local()?.setItem(OFFER_PREFIX + uid, 'done')
  } catch {
    /* ignore */
  }
}

async function offerGuestFiles(uid: string) {
  try {
    if (local()?.getItem(OFFER_PREFIX + uid)) return
    const guest = (await repository.list({ parentId: 'any' })).filter((f) => !f.trashed && f.type !== 'folder' && f.storage === 'local')
    if (!guest.length) {
      markGuestOfferDone(uid)
      return
    }
    if (auth.state.user?.id === uid) useAuthUi.getState().open({ kind: 'guest-files', count: guest.length })
  } catch {
    /* the offer is a convenience */
  }
}

/** The account's recent list as stored (for the Home screen on a device that has not opened these files). */
export async function loadAccountRecents(limit = 12) {
  const uid = auth.state.user?.id
  if (!uid) return []
  const db = (await auth.backend()).db
  return db.listRecent(uid, limit)
}

/** Sends anything still queued (used before a sign-out and in tests). */
export const flushAccountSync = () => sync?.flush() ?? Promise.resolve()
export const accountSync = () => sync
