import { describe, expect, it } from 'vitest'
import { DriveAuth, type Gis, type GisTokenResponse } from './auth'
import { DriveRenewal, RECONNECT_MESSAGE, type RenewalEnv } from './renewal'

const MIN = 60_000

/** A browser stand-in with a clock the test moves, and handles for the events renewal listens to. */
function fakeEnv() {
  let now = 0
  let visible = true
  const timers: { id: number; at: number; cb: () => void }[] = []
  let n = 0
  let wake: (() => void) | null = null
  let gesture: (() => void) | null = null
  const env: RenewalEnv = {
    visible: () => visible,
    onWake: (cb) => ((wake = cb), () => void (wake = null)),
    onceGesture: (cb) => ((gesture = cb), () => void (gesture = null)),
    setTimer: (cb, ms) => {
      const t = { id: ++n, at: now + ms, cb }
      timers.push(t)
      return t.id
    },
    clearTimer: (h) => {
      const i = timers.findIndex((t) => t.id === h)
      if (i >= 0) timers.splice(i, 1)
    },
  }
  return {
    env,
    now: () => now,
    advance: async (ms: number) => {
      const end = now + ms
      for (;;) {
        const next = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0]
        if (!next) break
        now = next.at
        timers.splice(timers.indexOf(next), 1)
        next.cb()
        await tick()
      }
      now = end
    },
    hide: () => (visible = false),
    show: () => (visible = true),
    focus: () => wake?.(),
    click: () => {
      const g = gesture
      gesture = null // a real listener fires once
      g?.()
    },
    hasGestureListener: () => gesture !== null,
    pendingTimers: () => timers.length,
  }
}
const tick = () => new Promise((r) => setTimeout(r, 0))

type Reply = { token?: string; error?: string; popupBlocked?: boolean }

function setup() {
  const clock = fakeEnv()
  const requests: { prompt?: string; hint?: string }[] = []
  const script: Reply[] = []
  let respond: (r: GisTokenResponse) => void = () => undefined
  let onError: (e: { type: string }) => void = () => undefined
  let n = 0
  const gis: Gis = {
    initTokenClient: (c) => {
      respond = c.callback
      onError = c.error_callback ?? (() => undefined)
      return {
        requestAccessToken: (o) => {
          requests.push(o ?? {})
          const next = script.shift() ?? {}
          queueMicrotask(() => (next.popupBlocked ? onError({ type: 'popup_failed_to_open' }) : next.error ? respond({ error: next.error }) : respond({ access_token: next.token ?? `token${++n}`, expires_in: 3600, scope: 'https://www.googleapis.com/auth/drive.file' })))
        },
      }
    },
    hasGrantedAllScopes: () => true,
    revoke: () => undefined,
  }
  const store = new Map<string, string>()
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
  const auth = new DriveAuth({ clientId: 'cid', loadGis: async () => gis, storage, now: clock.now })
  const renewal = new DriveRenewal(auth, { env: clock.env })
  return { auth, renewal, clock, requests, script, store }
}

describe('keeping Google Drive access alive', () => {
  it('renews about 50 minutes after the token was issued, with no prompt, and the next one the same way', async () => {
    const { auth, renewal, clock, requests } = setup()
    await auth.connect()
    renewal.start()
    expect(requests).toHaveLength(1)
    await clock.advance(49 * MIN)
    expect(requests).toHaveLength(1)
    await clock.advance(2 * MIN) // 51 minutes: due
    await tick()
    expect(requests).toHaveLength(2)
    expect(requests[1]).toMatchObject({ prompt: 'none' }) // no window, no question
    expect(auth.hasValidToken()).toBe(true)
    expect(auth.expiresInMs()).toBeGreaterThan(55 * MIN)
    await clock.advance(51 * MIN)
    await tick()
    expect(requests).toHaveLength(3)
    expect(auth.state.status).toBe('connected')
    expect(auth.state.message).toBeNull()
    renewal.stop()
  })

  it('never shows the Reconnect bar while renewals keep working: a day of 50-minute renewals', async () => {
    const { auth, renewal, clock } = setup()
    await auth.connect()
    renewal.start()
    for (let i = 0; i < 28; i++) {
      await clock.advance(51 * MIN)
      await tick()
      expect(auth.state.status).toBe('connected')
      expect(auth.hasValidToken()).toBe(true)
    }
    renewal.stop()
  })

  it('renews when the tab comes back into view after being hidden past the due time', async () => {
    const { auth, renewal, clock, requests } = setup()
    await auth.connect()
    renewal.start()
    clock.hide()
    await clock.advance(55 * MIN) // the timer fires while hidden: no attempt
    expect(requests).toHaveLength(1)
    clock.show()
    clock.focus()
    await tick()
    expect(requests).toHaveLength(2)
    expect(auth.hasValidToken()).toBe(true)
    renewal.stop()
  })

  it('after a reload (linked, but no token yet) it gets one without a banner', async () => {
    const first = setup()
    await first.auth.connect()
    first.auth.setAccount('me@example.com')
    const again = new DriveAuth({ clientId: 'cid', loadGis: async () => ({ initTokenClient: (c) => ({ requestAccessToken: () => queueMicrotask(() => c.callback({ access_token: 'fresh', expires_in: 3600 })) }), hasGrantedAllScopes: () => true, revoke: () => undefined }) as Gis, storage: { getItem: (k) => first.store.get(k) ?? null, setItem: () => undefined, removeItem: () => undefined }, now: first.clock.now })
    expect(again.state.status).toBe('connected')
    expect(again.hasValidToken()).toBe(false)
    const renewal = new DriveRenewal(again, { env: first.clock.env })
    renewal.start()
    await tick()
    expect(again.hasValidToken()).toBe(true)
    expect(again.state.status).toBe('connected')
    renewal.stop()
  })

  it('when the browser will not open Google\'s window by itself, it waits for the next click and renews then, still silently', async () => {
    const { auth, renewal, clock, requests, script } = setup()
    await auth.connect()
    renewal.start()
    script.push({ popupBlocked: true })
    await clock.advance(51 * MIN)
    await tick()
    expect(requests).toHaveLength(2)
    expect(auth.state.status).toBe('connected') // no bar, no message
    expect(auth.state.message).toBeNull()
    expect(clock.hasGestureListener()).toBe(true)
    clock.click() // the person clicks something
    await tick()
    expect(requests).toHaveLength(3)
    expect(requests[2]?.prompt).toBe('none')
    expect(auth.hasValidToken()).toBe(true)
    expect(clock.hasGestureListener()).toBe(false)
    renewal.stop()
  })

  it('if Google says the person must confirm, the old token keeps working and the bar appears only once it has expired', async () => {
    const { auth, renewal, clock, script } = setup()
    await auth.connect()
    renewal.start()
    script.push({ error: 'interaction_required' }, { error: 'interaction_required' }, { error: 'interaction_required' }, { error: 'interaction_required' }, { error: 'interaction_required' })
    await clock.advance(51 * MIN)
    await tick()
    expect(auth.hasValidToken()).toBe(true) // still good for several minutes
    expect(auth.state.status).toBe('connected')
    await clock.advance(15 * MIN) // the old token has now run out and the quiet tries failed
    await tick()
    expect(auth.hasValidToken()).toBe(false)
    expect(auth.state).toMatchObject({ status: 'reconnect', message: RECONNECT_MESSAGE })
    renewal.stop()
  })

  it('stops trying quietly once the bar is up (no window flashing every minute)', async () => {
    const { auth, renewal, clock, requests, script } = setup()
    await auth.connect()
    renewal.start()
    for (let i = 0; i < 12; i++) script.push({ error: 'interaction_required' })
    await clock.advance(75 * MIN)
    await tick()
    expect(auth.state.status).toBe('reconnect')
    const seen = requests.length
    await clock.advance(30 * MIN)
    await tick()
    expect(requests.length).toBe(seen)
    renewal.stop()
  })

  it('a refusal (access removed) is handled by the normal path and forgets the account', async () => {
    const { auth, renewal, clock, script } = setup()
    await auth.connect()
    renewal.start()
    script.push({ error: 'access_denied' })
    await clock.advance(51 * MIN)
    await tick()
    expect(auth.state.status).toBe('disconnected')
    expect(auth.state.message).toMatch(/not allowed/)
    renewal.stop()
  })

  it('does nothing when no Google account is linked, and stops listening when stopped', async () => {
    const { auth, renewal, clock, requests } = setup()
    renewal.start()
    await clock.advance(120 * MIN)
    expect(requests).toHaveLength(0)
    expect(auth.state.status).toBe('disconnected')
    renewal.stop()
    expect(clock.pendingTimers()).toBe(0)
  })

  it('a person who clicks Reconnect while a quiet renewal is waiting is not handed its failure', async () => {
    const { auth, script } = setup()
    await auth.connect()
    script.push({ popupBlocked: true }, { token: 'by-hand' })
    const quiet = auth.renewQuietly()
    const manual = auth.refresh()
    expect(await quiet).toBe('needs-gesture')
    await expect(manual).resolves.toBe('by-hand')
  })
})

describe('which Google account is asked for', () => {
  const gisWith = (requests: { prompt?: string; hint?: string }[]): Gis => ({
    initTokenClient: (c) => ({ requestAccessToken: (o) => (requests.push(o ?? {}), queueMicrotask(() => c.callback({ access_token: 't', expires_in: 3600 }))) }),
    hasGrantedAllScopes: () => true,
    revoke: () => undefined,
  })

  it('suggests the address the person signed in with (login_hint) and asks for consent in the same flow', async () => {
    const requests: { prompt?: string; hint?: string }[] = []
    const auth = new DriveAuth({ clientId: 'cid', loadGis: async () => gisWith(requests) })
    auth.setLoginHint('Me@Gmail.com')
    await auth.connect()
    expect(requests[0]).toEqual({ prompt: 'consent', hint: 'Me@Gmail.com' })
  })

  it('shows the account chooser, with no suggestion, when asked to (sign-in was by email, not Google)', async () => {
    const requests: { prompt?: string; hint?: string }[] = []
    const auth = new DriveAuth({ clientId: 'cid', loadGis: async () => gisWith(requests) })
    auth.setLoginHint('signed-in-by@email.com')
    await auth.connect({ chooseAccount: true })
    expect(requests[0]).toEqual({ prompt: 'select_account consent' })
  })

  it('once linked, the linked account is the suggestion, not the sign-in address', async () => {
    const requests: { prompt?: string; hint?: string }[] = []
    const auth = new DriveAuth({ clientId: 'cid', loadGis: async () => gisWith(requests) })
    await auth.connect()
    auth.setAccount('linked@gmail.com')
    auth.setLoginHint('other@gmail.com')
    await auth.refresh()
    expect(requests[1]?.hint).toBe('linked@gmail.com')
  })
})
