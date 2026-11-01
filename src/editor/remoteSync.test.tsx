// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import * as Y from 'yjs'
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installMemoryLocalStorage } from '../test/memoryStorage'

const h = vi.hoisted(() => ({ drive: null as unknown, laptop: null as unknown, laptopLocal: null as unknown, local: null as unknown }))

vi.mock('../app/repo', async () => {
  const { MemoryBackend, RepositoryCore } = await import('@/core/files/core')
  const { DriveRepository } = await import('@/core/drive/repository')
  const { FakeDrive } = await import('@/core/drive/fakeDrive')
  const { MemorySyncStore } = await import('@/core/drive/syncStore')
  const { MemoryImageStore } = await import('@/core/images/store')
  const drive = new FakeDrive()
  let t = Date.UTC(2026, 5, 1)
  const blobs = () => ({ images: new MemoryImageStore(), attachments: new MemoryImageStore() })
  const local = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const laptopLocal = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const phone = new DriveRepository(local, drive, { blobs, sessionId: 'phone', syncStore: new MemorySyncStore() })
  const laptop = new DriveRepository(laptopLocal, drive, { blobs, sessionId: 'laptop', syncStore: new MemorySyncStore() })
  Object.assign(h, { drive, laptop, laptopLocal, local })
  return { repository: phone, driveRepository: phone }
})

import type { DriveRepository } from '@/core/drive/repository'
import { addChild } from '@/core/model/commands'
import { createMapDoc, ensureRoot, getRootId, snapshotTopics } from '@/core/model/doc'
import { CHECK_EVERY } from './remoteSync'
import { closeFile, mapDoc, openFile } from './session'
import { useEditor } from './store'
import { driveRepository } from '../app/repo'

const laptop = () => h.laptop as DriveRepository
const phoneRepo = driveRepository
const laptopLocal = () => h.laptopLocal as import('@/core/files/core').RepositoryCore
const st = () => useEditor.getState()
const texts = () => Object.values(st().topics).map((t) => t.text).sort()
const tick = async (ms = 0) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))

function mapBytes(...extra: string[]) {
  const doc = createMapDoc()
  const root = ensureRoot(doc, 'Central Topic')
  for (const t of extra) addChild(doc, root, t)
  return Y.encodeStateAsUpdate(doc.ydoc)
}
/** What the laptop does: opens its copy, adds a topic, saves to Drive. */
async function laptopAdds(laptopId: string, text: string) {
  const doc = createMapDoc()
  Y.applyUpdate(doc.ydoc, (await laptopLocal().loadContent(laptopId)) as Uint8Array)
  addChild(doc, getRootId(doc) as string, text)
  await laptop().saveContent(laptopId, Y.encodeStateAsUpdate(doc.ydoc))
}

describe('an open Drive map on the phone while the laptop saves', () => {
  let laptopId = ''
  let phoneId = ''

  beforeEach(async () => {
    installMemoryLocalStorage()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const f = await laptopLocal().create({ type: 'map', name: 'Shared', content: mapBytes('One') })
    const onLaptop = await laptop().moveToDrive(f.id)
    laptopId = onLaptop.id
    const onPhone = await phoneRepo.openFromDrive(onLaptop.contentRef as string)
    phoneId = onPhone.id
    await openFile(phoneId, phoneRepo)
    await tick(20)
  })
  afterEach(async () => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    await closeFile()
  })

  it('refreshes an idle map when the tab gets the focus, keeping the selection, with a note', async () => {
    const one = Object.values(st().topics).find((t) => t.text === 'One')?.id as string
    act(() => useEditor.setState({ selected: [one] }))
    await laptopAdds(laptopId, 'From the laptop')
    expect(texts()).not.toContain('From the laptop')
    window.dispatchEvent(new Event('focus'))
    await tick(60)
    expect(texts()).toContain('From the laptop')
    expect(st().selected).toEqual([one]) // the selection stays
    expect(st().notice?.text).toBe('Updated from another device.')
    expect(st().canUndo).toBe(false) // it was not an edit of the phone's: nothing to undo, nothing to save again
    expect(st().save.status).toBe('saved')
  })

  it('also checks when the tab becomes visible and when the connection returns', async () => {
    await laptopAdds(laptopId, 'First')
    document.dispatchEvent(new Event('visibilitychange'))
    await tick(60)
    expect(texts()).toContain('First')
    await laptopAdds(laptopId, 'Second')
    window.dispatchEvent(new Event('online'))
    await tick(60)
    expect(texts()).toContain('Second')
  })

  it('and every minute while it is visible, by asking for metadata only when nothing changed', async () => {
    await closeFile()
    vi.useFakeTimers({ shouldAdvanceTime: true }) // before the map opens, so its one-minute timer is the fake one
    await openFile(phoneId, phoneRepo)
    await laptopAdds(laptopId, 'Later')
    const drive = h.drive as { calls: string[] }
    const before = drive.calls.length
    await act(async () => void (await vi.advanceTimersByTimeAsync(CHECK_EVERY + 100)))
    expect(texts()).toContain('Later')
    expect(drive.calls.slice(before).some((c) => c.startsWith('meta'))).toBe(true)
  })

  it('does not check while the tab is hidden', async () => {
    vi.restoreAllMocks()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await laptopAdds(laptopId, 'Hidden')
    window.dispatchEvent(new Event('focus'))
    await tick(60)
    expect(texts()).not.toContain('Hidden')
  })

  it('what the phone typed meanwhile is kept and merged with the laptop’s change', async () => {
    act(() => void addChild(mapDoc, getRootId(mapDoc) as string, 'Typed on the phone'))
    await laptopAdds(laptopId, 'From the laptop')
    window.dispatchEvent(new Event('focus'))
    await tick(400) // the phone's autosave and the check both run
    await tick(100)
    const all = texts()
    expect(all).toEqual(expect.arrayContaining(['From the laptop', 'Typed on the phone', 'One']))
    expect(Object.keys(snapshotTopics(mapDoc)).length).toBe(all.length)
    expect(phoneRepo.conflicts()).toEqual([])
  })
})
