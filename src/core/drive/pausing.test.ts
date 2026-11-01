import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { DriveError } from './errors'
import { FakeDrive } from './fakeDrive'
import { MemoryLedger, PAUSE_TEXT, PictureSync, type SyncMode } from './pictures'

/**
 * "67 pictures paused": uploads stop when Google says the sign-in is gone, access was removed or Drive is full. The status says WHY,
 * the cause going away (signing in again) carries on by itself, and there is always a button.
 */
let drive: FakeDrive
let ledger: MemoryLedger
let sync: PictureSync
let mode: SyncMode
let saver: boolean
let folder = ''

const bytes = (n: number) => ({ bytes: new Uint8Array(2048).fill(n), type: 'image/webp' })
beforeEach(async () => {
  drive = new FakeDrive()
  ledger = new MemoryLedger()
  mode = 'auto'
  saver = false
  folder = (await drive.createFolder('pics', await drive.ensureAppFolder())).id
  sync = new PictureSync(drive, { read: async (id) => bytes(id.length) }, ledger, { concurrency: 2, mode: () => mode, holdBack: () => saver, sleep: async () => undefined })
})
const fail = (kind: 'auth' | 'quota' | 'revoked') => {
  const real = drive.uploadBinary.bind(drive)
  drive.uploadBinary = async () => {
    throw new DriveError(kind, 'nope', kind === 'auth' ? 401 : 403)
  }
  return () => void (drive.uploadBinary = real)
}
const files = async () => (await drive.listFolder(folder)).filter((f) => f.appProperties?.pictureKind === 'full').length

describe('why uploads are paused', () => {
  it('an expired sign-in pauses them, says "sign in", and signing in again resumes them by itself', async () => {
    const fix = fail('auth')
    await sync.enqueue('m', folder, ['a', 'b', 'c'])
    await sync.run()
    const s = sync.getStatus()
    expect(s).toMatchObject({ paused: true, pausedReason: 'auth' })
    expect(PAUSE_TEXT.auth).toMatch(/sign in to Google Drive/)
    expect(s.pictures).toBe(3)
    expect(s.lastError).toBeTruthy()

    fix() // the sign-in is back
    sync.resumeIfPausedFor('auth') // what the app does when Google gives a new token
    for (let i = 0; i < 50 && sync.getStatus().pending; i++) await new Promise((r) => setTimeout(r, 5))
    expect(sync.getStatus()).toMatchObject({ paused: false, pausedReason: null, pending: 0 })
    expect(await files()).toBe(3)
  })

  it('does not resume for a different cause: signing in does not fix a full Drive', async () => {
    fail('quota')
    await sync.enqueue('m', folder, ['a'])
    await sync.run()
    expect(sync.getStatus().pausedReason).toBe('quota')
    sync.resumeIfPausedFor('auth')
    expect(sync.getStatus().pausedReason).toBe('quota')
    expect(PAUSE_TEXT.quota).toBe('Google Drive is full')
  })

  it('removed access is its own reason', async () => {
    fail('revoked')
    await sync.enqueue('m', folder, ['a'])
    await sync.run()
    expect(sync.getStatus().pausedReason).toBe('revoked')
  })

  it('"Resume" tries the failed ones again at once (they do not wait out their back-off)', async () => {
    const fix = fail('quota')
    await sync.enqueue('m', folder, ['a', 'b'])
    await sync.run()
    expect((await ledger.jobs()).some((j) => j.nextAt > 0)).toBe(true) // the one that failed was set to wait
    fix()
    sync.resume()
    for (let i = 0; i < 50 && sync.getStatus().pending; i++) await new Promise((r) => setTimeout(r, 5))
    expect(sync.getStatus()).toMatchObject({ paused: false, pending: 0, lastError: null })
    expect(await files()).toBe(2)
  })

  it('pausing yourself is a reason too, and Resume clears it', async () => {
    mode = 'manual'
    await sync.enqueue('m', folder, ['a'])
    sync.pause()
    expect(sync.getStatus()).toMatchObject({ paused: true, pausedReason: 'user' })
    expect(PAUSE_TEXT.user).toBe('paused by you')
    sync.resume()
    expect(sync.getStatus().paused).toBe(false)
  })

  it('data saver holds them back, shows that reason, and "Sync now" sends them anyway', async () => {
    saver = true
    await sync.enqueue('m', folder, ['a', 'b'])
    await sync.run()
    expect(await files()).toBe(0) // nothing went up by itself
    expect(sync.getStatus()).toMatchObject({ paused: true, pausedReason: 'datasaver' })
    await sync.syncNow()
    expect(await files()).toBe(2)
  })

  it('in "Only when I tap Sync" nothing is "paused": it is waiting, and Sync now sends it', async () => {
    mode = 'manual'
    await sync.enqueue('m', folder, ['a'])
    expect(sync.getStatus()).toMatchObject({ paused: false, pausedReason: null, mode: 'manual', pictures: 1 })
    await sync.syncNow()
    expect(await files()).toBe(1)
  })

  it('every reason has words a person can read', () => {
    for (const reason of ['user', 'auth', 'revoked', 'quota', 'datasaver'] as const) expect(PAUSE_TEXT[reason].length).toBeGreaterThan(5)
  })
})
