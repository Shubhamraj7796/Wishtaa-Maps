import { describe, expect, it, vi } from 'vitest'
import { FakeBackend } from '../auth/fakeBackend'
import { FirstMapReporter } from './firstMap'

const flush = () => new Promise((r) => setTimeout(r, 0))

async function invited(confirmed = true) {
  const b = new FakeBackend()
  b.completeGoogle('friend@example.com')
  const code = b.codeFor('friend@example.com')
  b.completeGoogle('new@example.com')
  if (!confirmed) {
    const u = b.users.get('new@example.com')
    if (u) u.confirmed = false
  }
  await b.db.claimReferral(code)
  return b
}

describe('reporting the first saved map', () => {
  it('stays silent for a person who was not invited', async () => {
    const b = new FakeBackend()
    b.completeGoogle('solo@example.com')
    const spy = vi.spyOn(b.db, 'recordFirstMap')
    const r = new FirstMapReporter(b.db)
    await r.start()
    expect(r.waiting).toBe(false)
    r.onSaved(50)
    await flush()
    expect(spy).not.toHaveBeenCalled()
  })

  it('does not report a map that is too small, then reports the first one with enough topics, once', async () => {
    const b = await invited()
    const spy = vi.spyOn(b.db, 'recordFirstMap')
    let t = 0
    const r = new FirstMapReporter(b.db, { now: () => t })
    await r.start()
    expect(r.waiting).toBe(true)
    r.onSaved(1)
    r.onSaved(2)
    await flush()
    expect(spy).not.toHaveBeenCalled()
    r.onSaved(3)
    await flush()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(3) // only a number
    expect(r.waiting).toBe(false)
    t += 10 * 60_000
    r.onSaved(10)
    await flush()
    expect(spy).toHaveBeenCalledTimes(1) // never again
    expect((await b.db.referralSummary())?.awaitingFirstMap).toBe(false)
  })

  it('asks at most once a minute while the database still says waiting (email not confirmed yet), and keeps trying', async () => {
    const b = await invited(false)
    const spy = vi.spyOn(b.db, 'recordFirstMap')
    let t = 1_000_000
    const r = new FirstMapReporter(b.db, { now: () => t })
    await r.start()
    r.onSaved(5)
    await flush()
    r.onSaved(6)
    r.onSaved(7)
    await flush()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(r.waiting).toBe(true)
    t += 61_000
    const u = b.users.get('new@example.com')
    if (u) u.confirmed = true
    r.onSaved(8)
    await flush()
    expect(spy).toHaveBeenCalledTimes(2)
    expect(r.waiting).toBe(false)
  })

  it('a network failure changes nothing and the next save tries again', async () => {
    const b = await invited()
    let t = 0
    const r = new FirstMapReporter(b.db, { now: () => t })
    await r.start()
    b.offline = true
    r.onSaved(5)
    await flush()
    expect(r.waiting).toBe(true)
    b.offline = false
    t += 61_000
    r.onSaved(5)
    await flush()
    expect(r.waiting).toBe(false)
  })

  it('an old database (no awaitingFirstMap) is treated as waiting for an invited person, and the first answer ends it', async () => {
    const b = await invited()
    const real = b.db.referralSummary.bind(b.db)
    b.db.referralSummary = async () => {
      const s = await real()
      if (!s) return s
      const old: Partial<typeof s> = { ...s }
      delete old.awaitingFirstMap
      delete old.minTopics
      return old as typeof s
    }
    const r = new FirstMapReporter(b.db)
    await r.start()
    expect(r.waiting).toBe(true)
    r.onSaved(3)
    await flush()
    expect(r.waiting).toBe(false)
  })

  it('stop() ends all reporting (sign-out)', async () => {
    const b = await invited()
    const spy = vi.spyOn(b.db, 'recordFirstMap')
    const r = new FirstMapReporter(b.db)
    await r.start()
    r.stop()
    r.onSaved(9)
    await flush()
    expect(spy).not.toHaveBeenCalled()
  })

  it('the referrer gets the month only after the waiting time, and the invited friend only the standard offer', async () => {
    const b = await invited()
    const day = 86_400_000
    let clock = Date.now()
    b.now = () => clock
    const r = new FirstMapReporter(b.db, { now: () => clock })
    await r.start()
    r.onSaved(4)
    await flush()
    // the invited person: standard only
    expect((await b.db.myPlan())?.bonusMonths).toBe(0)
    b.sessionFor('friend@example.com')
    expect((await b.db.referralSummary())?.waiting).toBe(1)
    expect((await b.db.myPlan())?.bonusMonths).toBe(0) // inside the 7 days
    clock += 8 * day
    expect((await b.db.myPlan())?.bonusMonths).toBe(1)
    expect((await b.db.myPlan())?.bonusMonths).toBe(1) // once only
  })
})
