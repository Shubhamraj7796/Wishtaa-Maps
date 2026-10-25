import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Autosaver, type MapStorage, type SaveStatus } from './autosave'

class FakeStorage implements MapStorage {
  saved: string[] = []
  active = 0
  maxActive = 0
  failNext = 0
  latencyMs = 0
  syncWrites: string[] = []
  withSync = true
  constructor() {
    if (!this.withSync) return
  }
  async load() {
    return null
  }
  async save(data: string) {
    this.active++
    this.maxActive = Math.max(this.maxActive, this.active)
    try {
      if (this.latencyMs) await new Promise((r) => setTimeout(r, this.latencyMs))
      if (this.failNext > 0) {
        this.failNext--
        throw new Error('QuotaExceededError')
      }
      this.saved.push(data)
    } finally {
      this.active--
    }
  }
  saveSync(data: string) {
    if (this.failNext > 0) {
      this.failNext--
      throw new Error('QuotaExceededError')
    }
    this.syncWrites.push(data)
  }
}

function make(opts: { latencyMs?: number } = {}) {
  const storage = new FakeStorage()
  storage.latencyMs = opts.latencyMs ?? 0
  const state = { value: 'v0' }
  const statuses: SaveStatus[] = []
  const saver = new Autosaver({
    storage,
    serialize: () => state.value,
    debounceMs: 400,
    retryDelaysMs: [1000, 2000, 5000],
    now: () => 1_700_000_000_000,
    onChange: (s) => statuses.push(s.status),
  })
  const edit = (v: string) => {
    state.value = v
    saver.markDirty()
  }
  return { storage, saver, edit, statuses }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('debounce', () => {
  it('shows "saving" immediately but writes only after the quiet period', async () => {
    const { saver, edit, storage } = make()
    edit('a')
    expect(saver.snapshot.status).toBe('saving')
    await vi.advanceTimersByTimeAsync(399)
    expect(storage.saved).toEqual([])
    await vi.advanceTimersByTimeAsync(2)
    expect(storage.saved).toEqual(['a'])
    expect(saver.snapshot.status).toBe('saved')
  })

  it('collapses a burst of changes into one write of the latest state', async () => {
    const { edit, storage } = make()
    for (const v of ['a', 'ab', 'abc', 'abcd']) {
      edit(v)
      await vi.advanceTimersByTimeAsync(100) // keeps resetting the timer
    }
    await vi.advanceTimersByTimeAsync(400)
    expect(storage.saved).toEqual(['abcd'])
  })

  it('records the save time only after the write succeeds', async () => {
    const { saver, edit } = make()
    expect(saver.snapshot.savedAt).toBeNull()
    edit('a')
    expect(saver.snapshot.savedAt).toBeNull()
    await vi.advanceTimersByTimeAsync(500)
    expect(saver.snapshot.savedAt).toBe(1_700_000_000_000)
  })
})

describe('serialised queue', () => {
  it('never runs two writes at once and ends with the latest state', async () => {
    const { storage, edit, saver } = make({ latencyMs: 1000 })
    edit('one')
    await vi.advanceTimersByTimeAsync(400) // write #1 starts (1s latency)
    edit('two') // change arrives mid-write
    edit('three')
    await vi.advanceTimersByTimeAsync(5000)
    expect(storage.maxActive).toBe(1)
    expect(storage.saved[0]).toBe('one')
    expect(storage.saved[storage.saved.length - 1]).toBe('three')
    expect(storage.saved).not.toContain('two') // superseded before it was written
    expect(saver.snapshot.status).toBe('saved')
    expect(saver.hasUnsaved).toBe(false)
  })

  it('stays in "saving" while a write is in flight', async () => {
    const { saver, edit } = make({ latencyMs: 1000 })
    edit('a')
    await vi.advanceTimersByTimeAsync(700)
    expect(saver.snapshot.status).toBe('saving')
    expect(saver.hasUnsaved).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(saver.snapshot.status).toBe('saved')
  })
})

describe('flush and unload', () => {
  it('flush() writes immediately without waiting for the debounce', async () => {
    const { saver, edit, storage } = make()
    edit('now')
    await saver.flush()
    expect(storage.saved).toEqual(['now'])
    await vi.advanceTimersByTimeAsync(1000)
    expect(storage.saved).toEqual(['now']) // no duplicate write later
  })

  it('prepareForUnload() writes synchronously and reports it is safe to leave', () => {
    const { saver, edit, storage } = make()
    edit('last-edit')
    expect(saver.hasUnsaved).toBe(true)
    expect(saver.prepareForUnload()).toBe(true)
    expect(storage.syncWrites).toEqual(['last-edit'])
    expect(saver.snapshot.status).toBe('saved')
  })

  it('prepareForUnload() says it is NOT safe when the write fails', () => {
    const { saver, edit, storage } = make()
    storage.failNext = 1
    edit('x')
    expect(saver.prepareForUnload()).toBe(false)
    expect(saver.snapshot.status).toBe('error')
  })

  it('prepareForUnload() is a no-op when everything is saved', () => {
    const { saver, storage } = make()
    expect(saver.prepareForUnload()).toBe(true)
    expect(storage.syncWrites).toEqual([])
  })

  it('reports unsaved while a write is still in flight', async () => {
    const { saver, edit } = make({ latencyMs: 2000 })
    edit('slow')
    await vi.advanceTimersByTimeAsync(500)
    expect(saver.prepareForUnload()).toBe(false) // would trigger the leave warning
  })
})

describe('failure and retry', () => {
  it('goes saving -> error -> saving -> saved and keeps the changes', async () => {
    const { saver, edit, storage, statuses } = make()
    storage.failNext = 1
    edit('keep-me')
    await vi.advanceTimersByTimeAsync(400)
    expect(saver.snapshot.status).toBe('error')
    expect(saver.snapshot.error).toMatch(/Quota/)
    expect(saver.hasUnsaved).toBe(true)
    await vi.advanceTimersByTimeAsync(1000) // first backoff
    expect(storage.saved).toEqual(['keep-me'])
    expect(saver.snapshot.status).toBe('saved')
    expect(statuses).toEqual(['saving', 'error', 'saving', 'saved'])
  })

  it('backs off between automatic retries', async () => {
    const { storage, edit, saver } = make()
    storage.failNext = 3
    edit('x')
    await vi.advanceTimersByTimeAsync(400) // fail #1
    await vi.advanceTimersByTimeAsync(1000) // fail #2 (after 1s)
    await vi.advanceTimersByTimeAsync(1999)
    expect(saver.snapshot.status).toBe('error') // third try not due until 2s
    await vi.advanceTimersByTimeAsync(2) // fail #3 at 2s
    await vi.advanceTimersByTimeAsync(5000) // succeeds after the next 5s delay
    expect(storage.saved).toEqual(['x'])
    expect(saver.snapshot.status).toBe('saved')
  })

  it('manual retry() saves right away', async () => {
    const { saver, edit, storage } = make()
    storage.failNext = 1
    edit('y')
    await vi.advanceTimersByTimeAsync(400)
    expect(saver.snapshot.status).toBe('error')
    await saver.retry()
    expect(storage.saved).toEqual(['y'])
    expect(saver.snapshot.status).toBe('saved')
  })

  it('writes newer edits made while in the error state', async () => {
    const { saver, edit, storage } = make()
    storage.failNext = 1
    edit('old')
    await vi.advanceTimersByTimeAsync(400)
    edit('new')
    expect(saver.snapshot.status).toBe('saving')
    await vi.advanceTimersByTimeAsync(500)
    expect(storage.saved).toEqual(['new'])
  })
})

describe('before-save hook', () => {
  it('waits for pending blob writes before saving the map', async () => {
    const order: string[] = []
    const storage: MapStorage = {
      load: async () => null,
      save: async () => void order.push('map'),
    }
    const saver = new Autosaver({
      storage,
      serialize: () => 'm',
      beforeSave: async () => {
        await new Promise((r) => setTimeout(r, 300))
        order.push('blobs')
      },
    })
    saver.markDirty()
    await vi.advanceTimersByTimeAsync(1000)
    expect(order).toEqual(['blobs', 'map'])
  })
})
