// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PickerUnavailableError } from './errors'
import { PICKER_WAIT_MS, pickDriveFolder, pickOpenableFiles, pickPdfFiles, resetPickerLoader, type PickerApi, type PickerResponse } from './picker'

/** A stand-in for Google's picker that the test drives by hand. */
function mockPicker(opts: { buildThrows?: boolean } = {}) {
  const log = { callback: null as null | ((d: PickerResponse) => void), visible: null as boolean | null, disposed: false }
  class View {
    setMimeTypes() { return this }
    setIncludeFolders() { return this }
    setSelectFolderEnabled() { return this }
    setOwnedByMe() { return this }
    setEnableDrives() { return this }
    setLabel() { return this }
  }
  class Builder {
    addView = () => this
    setOAuthToken = () => this
    setDeveloperKey = () => this
    setAppId = () => this
    setTitle = () => this
    enableFeature = () => this
    setCallback = (cb: (d: PickerResponse) => void) => ((log.callback = cb), this)
    build = () => {
      if (opts.buildThrows) throw new Error('the frame was refused')
      return { setVisible: (v: boolean) => void (log.visible = v), dispose: () => void (log.disposed = true) }
    }
  }
  const api = { PickerBuilder: Builder, DocsView: View, ViewId: { DOCS: 'DOCS', FOLDERS: 'FOLDERS' }, Feature: { MULTISELECT_ENABLED: 'M' }, Action: { PICKED: 'picked', CANCEL: 'cancel', LOADED: 'loaded' } } as unknown as PickerApi
  return { api, log }
}
const opts = { token: 't', apiKey: 'k', clientId: '123-abc' }
const pickers = [
  ['open-map', (api: PickerApi) => pickOpenableFiles(opts, api)],
  ['pdf', (api: PickerApi) => pickPdfFiles(opts, api)],
] as const

beforeEach(() => {
  resetPickerLoader()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('when the browser will not show the Google picker', () => {
  for (const [name, start] of pickers) {
    it(`${name}: a picker that never reports "loaded" fails after ${PICKER_WAIT_MS / 1000} seconds, is hidden and disposed, and a late "loaded" or pick is ignored`, async () => {
      const { api, log } = mockPicker()
      const result = start(api)
      const settled = result.then(() => 'resolved', (e: unknown) => e)
      await vi.advanceTimersByTimeAsync(PICKER_WAIT_MS - 100)
      expect(log.visible).toBe(true) // still waiting: no notice yet
      await vi.advanceTimersByTimeAsync(200)
      const err = await settled
      expect(err).toBeInstanceOf(PickerUnavailableError)
      expect(err).toMatchObject({ reason: 'never-loaded', which: name, kind: 'picker' })
      expect(log.visible).toBe(false) // Google's page is taken off the screen
      expect(log.disposed).toBe(true)
      // Late events after the notice (a "loaded", even a pick) change nothing.
      log.callback?.({ action: 'loaded' })
      log.callback?.({ action: 'picked', docs: [{ id: 'x', name: 'secret.pdf' }] })
      await vi.advanceTimersByTimeAsync(60_000)
      expect(await settled).toBe(err)
    })

    it(`${name}: when the picker opens ("loaded") it never fails, however long the person takes, and the pick still works`, async () => {
      const { api, log } = mockPicker()
      const result = start(api)
      await vi.advanceTimersByTimeAsync(3000)
      log.callback?.({ action: 'loaded' })
      await vi.advanceTimersByTimeAsync(10 * 60_000) // ten minutes of choosing
      log.callback?.({ action: 'picked', docs: [{ id: 'f1', name: 'a.pdf' }] })
      expect(await result).toEqual([{ id: 'f1', name: 'a.pdf', mimeType: undefined, sizeBytes: undefined }])
      expect(log.disposed).toBe(false)
    })

    it(`${name}: closing the picker on purpose is a quiet empty answer, not a failure`, async () => {
      const { api, log } = mockPicker()
      const result = start(api)
      log.callback?.({ action: 'cancel' }) // closed before it even finished loading
      expect(await result).toEqual([])
      await vi.advanceTimersByTimeAsync(60_000) // the wait timer was cleared: nothing happens later
      expect(log.disposed).toBe(false)
    })

    it(`${name}: a picker that cannot even start (the frame is refused) fails at once`, async () => {
      const { api } = mockPicker({ buildThrows: true })
      await expect(start(api)).rejects.toMatchObject({ reason: 'start-failed', which: name })
    })
  }

  it('save-to folder: the same detection, and cancel gives null', async () => {
    const { api, log } = mockPicker()
    const w = window as unknown as { gapi?: unknown; google?: { picker?: PickerApi } }
    w.gapi = { load: (_n: string, o: { callback: () => void }) => o.callback() }
    w.google = { picker: api }
    const never = pickDriveFolder(opts)
    const settled = never.then(() => 'ok', (e: unknown) => e)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(PICKER_WAIT_MS + 100)
    expect(await settled).toMatchObject({ reason: 'never-loaded', which: 'folder' })
    const cancelled = pickDriveFolder(opts)
    await vi.advanceTimersByTimeAsync(0)
    log.callback?.({ action: 'cancel' })
    expect(await cancelled).toBeNull()
    delete w.gapi
    delete w.google
  })

  it('the picker script being blocked fails with script-blocked (not a crash), and a second try loads it again', async () => {
    const w = window as unknown as { gapi?: unknown }
    delete w.gapi
    const append = vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
      queueMicrotask(() => (node as HTMLScriptElement).onerror?.(new Event('error')))
      return node
    })
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    await expect(pickPdfFiles(opts)).rejects.toMatchObject({ reason: 'script-blocked', which: 'pdf', kind: 'picker' })
    await expect(pickPdfFiles(opts)).rejects.toMatchObject({ reason: 'script-blocked' })
    expect(append).toHaveBeenCalledTimes(2) // Try again asks the browser again
  })

  it('a script that never arrives is also script-blocked after the wait', async () => {
    const w = window as unknown as { gapi?: unknown }
    delete w.gapi
    vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => node) // neither loads nor fails
    const settled = pickOpenableFiles(opts).then(() => 'ok', (e: unknown) => e)
    await vi.advanceTimersByTimeAsync(PICKER_WAIT_MS + 100)
    expect(await settled).toMatchObject({ reason: 'script-blocked', which: 'open-map' })
  })

  it('really being offline is not blamed on the browser', async () => {
    const w = window as unknown as { gapi?: unknown }
    delete w.gapi
    vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
      queueMicrotask(() => (node as HTMLScriptElement).onerror?.(new Event('error')))
      return node
    })
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    await expect(pickPdfFiles(opts)).rejects.toMatchObject({ kind: 'offline' })
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  })
})
