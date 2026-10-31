import { beforeEach, describe, expect, it, vi } from 'vitest'

/** A BroadcastChannel stand-in that delivers to every other instance with the same name, like separate tabs. */
class FakeChannel {
  static all: FakeChannel[] = []
  onmessage: ((e: MessageEvent) => void) | null = null
  constructor(public name: string) {
    FakeChannel.all.push(this)
  }
  postMessage(data: unknown) {
    for (const c of FakeChannel.all) if (c !== this && c.name === this.name) c.onmessage?.({ data } as MessageEvent)
  }
  close() {}
}

async function freshTab() {
  vi.resetModules()
  return import('./tabwatch')
}

describe('same file open in two tabs', () => {
  beforeEach(() => {
    FakeChannel.all = []
    vi.stubGlobal('BroadcastChannel', FakeChannel)
  })

  it('tells the tab that is already open when a second one opens the file, and both know', async () => {
    const a = await freshTab()
    const b = await freshTab()
    a.watchFile('f1')
    expect(a.otherTabOpen()).toBe(false)
    b.watchFile('f1')
    expect(a.otherTabOpen()).toBe(true)
    expect(b.otherTabOpen()).toBe(true)
  })

  it('goes away when the other tab closes the file', async () => {
    const a = await freshTab()
    const b = await freshTab()
    a.watchFile('f1')
    b.watchFile('f1')
    b.unwatchFile()
    expect(a.otherTabOpen()).toBe(false)
  })

  it('ignores tabs that have a different file open', async () => {
    const a = await freshTab()
    const b = await freshTab()
    a.watchFile('f1')
    b.watchFile('f2')
    expect(a.otherTabOpen()).toBe(false)
    expect(b.otherTabOpen()).toBe(false)
  })

  it('does nothing where BroadcastChannel is missing', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const a = await freshTab()
    expect(() => a.watchFile('f1')).not.toThrow()
    expect(a.otherTabOpen()).toBe(false)
  })
})
