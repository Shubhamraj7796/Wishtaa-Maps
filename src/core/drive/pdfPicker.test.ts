import { describe, expect, it } from 'vitest'
import { pickPdfFiles, type DocsViewApi, type PickerApi, type PickerResponse } from './picker'

function mockPicker() {
  const log = { views: [] as { calls: [string, unknown][] }[], features: [] as unknown[], title: '', callback: null as null | ((d: PickerResponse) => void), visible: false }
  class View implements DocsViewApi {
    calls: [string, unknown][] = []
    constructor() {
      log.views.push({ calls: this.calls })
    }
    setMimeTypes(m: string) { this.calls.push(['mime', m]); return this }
    setIncludeFolders(b: boolean) { this.calls.push(['folders', b]); return this }
    setSelectFolderEnabled(b: boolean) { this.calls.push(['selectFolder', b]); return this }
    setOwnedByMe(b: boolean) { this.calls.push(['owned', b]); return this }
    setEnableDrives(b: boolean) { this.calls.push(['drives', b]); return this }
    setLabel(l: string) { this.calls.push(['label', l]); return this }
    setQuery() { return this }
  }
  class Builder {
    addView = (v: unknown) => (void v, this)
    setOAuthToken = () => this
    setDeveloperKey = () => this
    setAppId = () => this
    setCallback = (cb: (d: PickerResponse) => void) => { log.callback = cb; return this }
    setTitle = (t: string) => { log.title = t; return this }
    enableFeature = (f: unknown) => { log.features.push(f); return this }
    build = () => ({ setVisible: (v: boolean) => { log.visible = v } })
  }
  const api = { PickerBuilder: Builder, DocsView: View, ViewId: { DOCS: 'DOCS', FOLDERS: 'FOLDERS', RECENTLY_PICKED: 'RECENT' }, Feature: { MULTISELECT_ENABLED: 'MULTI', SUPPORT_DRIVES: 'DRIVES' }, Action: { PICKED: 'picked', CANCEL: 'cancel' } } as unknown as PickerApi
  return { api, log }
}
const opts = { token: 't', apiKey: 'k', clientId: '123-abc' }
const call = (v: { calls: [string, unknown][] }, name: string) => v.calls.find((c) => c[0] === name)?.[1]

describe('the PDF Picker (its own, not the .wishtaa / .emmx one)', () => {
  it('filters on application/pdf in My Drive, Shared with me, Recent and Shared drives, with folders, plus an unfiltered tab for mistyped PDFs', async () => {
    const { api, log } = mockPicker()
    const p = pickPdfFiles(opts, api)
    expect(log.views.map((v) => call(v, 'label'))).toEqual(['My Drive', 'Shared with me', 'Recent', 'Shared drives', 'Any file (.pdf)'])
    for (const v of log.views.slice(0, 4)) expect(call(v, 'mime')).toBe('application/pdf')
    expect(call(log.views[4] as never, 'mime')).toBeUndefined()
    for (const v of log.views) {
      expect(call(v, 'folders')).toBe(true)
      expect(call(v, 'selectFolder')).toBe(false)
    }
    expect(call(log.views[1] as never, 'owned')).toBe(false)
    expect(call(log.views[3] as never, 'drives')).toBe(true)
    expect(log.features).toEqual(expect.arrayContaining(['MULTI', 'DRIVES']))
    expect(log.title).toBe('Insert a PDF from Google Drive')
    log.callback?.({ action: 'cancel' })
    expect(await p).toEqual([])
  })

  it('returns every picked file, whatever type Drive gave it (a PDF can arrive as application/octet-stream)', async () => {
    const { api, log } = mockPicker()
    const p = pickPdfFiles(opts, api)
    log.callback?.({
      action: 'picked',
      docs: [
        { id: 'a', name: 'Paper.pdf', mimeType: 'application/pdf', sizeBytes: 1000 },
        { id: 'b', name: 'Scan.pdf', mimeType: 'application/octet-stream', sizeBytes: 2000 },
      ],
    })
    expect(await p).toEqual([
      { id: 'a', name: 'Paper.pdf', mimeType: 'application/pdf', sizeBytes: 1000 },
      { id: 'b', name: 'Scan.pdf', mimeType: 'application/octet-stream', sizeBytes: 2000 },
    ])
  })

  it('says so when there is no API key', async () => {
    await expect(pickPdfFiles({ token: 't', apiKey: undefined, clientId: '1-a' })).rejects.toThrow(/API key/)
  })
})
