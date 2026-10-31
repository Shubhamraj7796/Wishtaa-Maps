import 'fake-indexeddb/auto'
import { zipSync, strToU8 } from 'fflate'
import * as Y from 'yjs'
import { beforeEach, describe, expect, it } from 'vitest'
import { simple, basicShapes } from '../import/emmx/testkit'
import { MemoryBackend, RepositoryCore } from '../files/core'
import { MemoryImageStore } from '../images/store'
import { createMapDoc, ensureRoot } from '../model/doc'
import { addChild } from '../model/commands'
import { DriveError } from './errors'
import { FakeDrive } from './fakeDrive'
import { packFile, WISHTAA_LEGACY_MIME, WISHTAA_MIME, type BlobStores } from './format'
import { changedSinceConversion, checkEmmxContent, checkName, checkWishtaaContent, kindOfName, NotOpenable, OPEN_HINT, PICKER_MIME_TYPES, sourceOf, sourceProps } from './openable'
import { OPEN_PICKER_TITLE, pickOpenableFiles, type DocsViewApi, type PickerApi, type PickerResponse } from './picker'
import { DriveRepository } from './repository'

const mapBytes = (...extra: string[]) => {
  const doc = createMapDoc()
  const root = ensureRoot(doc, 'Central Topic')
  for (const t of extra) addChild(doc, root, t)
  return Y.encodeStateAsUpdate(doc.ydoc)
}

describe('names', () => {
  it('accepts .wishtaa and .emmx in any case, and nothing else', () => {
    expect(checkName('Notes.wishtaa')).toBe('wishtaa')
    expect(checkName('IND AS 2.EMMX')).toBe('emmx')
    expect(checkName('a.Emmx ')).toBe('emmx')
    expect(kindOfName('readme.txt')).toBeNull()
    for (const bad of ['plan.txt', 'plan.json', 'plan.zip', 'plan.wishtaa.txt', 'emmx', '.emmx.bak', 'plan']) {
      expect(() => checkName(bad), bad).toThrow(NotOpenable)
    }
  })

  it('the message says what can be opened', () => {
    expect(() => checkName('plan.docx')).toThrow(/Only \.wishtaa and \.emmx files can be opened/)
    expect(OPEN_HINT).toMatch(/Only \.wishtaa and \.emmx/)
  })
})

describe('contents', () => {
  const emmx = () => simple(basicShapes())

  it('a real .wishtaa is accepted', async () => {
    const text = await packFile({ type: 'map', name: 'x', createdAt: 1, modifiedAt: 2, content: mapBytes('A') })
    expect(() => checkWishtaaContent(text, 'x.wishtaa')).not.toThrow()
  })

  it('a file renamed .wishtaa that is plain text, or JSON that is not ours, is refused', () => {
    expect(() => checkWishtaaContent('just some words', 'a.wishtaa')).toThrow(/not a Wishtaa Maps file/)
    expect(() => checkWishtaaContent('{"hello":1}', 'a.wishtaa')).toThrow(NotOpenable)
    expect(() => checkWishtaaContent('{"app":"other","version":1}', 'a.wishtaa')).toThrow(NotOpenable)
    expect(() => checkWishtaaContent('{"app":"wishtaa-maps"}', 'a.wishtaa')).toThrow(NotOpenable) // no version
    expect(() => checkWishtaaContent('[1,2]', 'a.wishtaa')).toThrow(NotOpenable)
    expect(() => checkWishtaaContent('null', 'a.wishtaa')).toThrow(NotOpenable)
  })

  it('a real .emmx is accepted', () => {
    expect(() => checkEmmxContent(emmx(), 'a.emmx')).not.toThrow()
  })

  it('a text file renamed .emmx is refused', () => {
    expect(() => checkEmmxContent(strToU8('hello, not a zip, but long enough to look like something'), 'a.emmx')).toThrow(/not a ZIP archive/)
  })

  it('a damaged zip is refused', () => {
    const bad = emmx().slice(0, 60)
    bad[0] = 0x50
    bad[1] = 0x4b
    bad[2] = 3
    bad[3] = 4
    expect(() => checkEmmxContent(bad, 'a.emmx')).toThrow(NotOpenable)
    const corrupt = new Uint8Array(100)
    corrupt.set([0x50, 0x4b, 0x03, 0x04])
    expect(() => checkEmmxContent(corrupt, 'a.emmx')).toThrow(/damaged|not a valid/)
  })

  it('a zip that is not an .emmx (no document.xml) is refused', () => {
    const other = zipSync({ 'readme.txt': strToU8('hi there, this is padding to be long enough') })
    expect(() => checkEmmxContent(other, 'a.emmx')).toThrow(/no document\.xml/)
  })

  it('an empty or tiny file is refused', () => {
    expect(() => checkEmmxContent(new Uint8Array(0), 'a.emmx')).toThrow(NotOpenable)
    expect(() => checkEmmxContent(new Uint8Array([0x50, 0x4b]), 'a.emmx')).toThrow(NotOpenable)
  })
})

describe('the link from a converted copy to its original', () => {
  const link = { fileId: 'orig-1', name: 'IND AS 2.emmx', modifiedTime: '2026-10-01T10:00:00.000Z', importedAt: '2026-10-31T09:00:00.000Z' }

  it('round-trips through Drive properties, which are short strings', () => {
    const props = sourceProps(link)
    expect(Object.values(props).every((v) => typeof v === 'string')).toBe(true)
    expect(sourceOf(props)).toEqual(link)
    expect(sourceOf({})).toBeNull()
    expect(sourceOf(undefined)).toBeNull()
  })

  it('a very long name is shortened so it fits', () => {
    expect(sourceProps({ ...link, name: 'x'.repeat(300) }).sourceName?.length ?? 0).toBeLessThanOrEqual(60)
  })

  it('knows when the original changed after it was converted', () => {
    expect(changedSinceConversion(link, '2026-10-01T10:00:00.000Z')).toBe(false)
    expect(changedSinceConversion(link, '2026-10-02T10:00:00.000Z')).toBe(true)
    expect(changedSinceConversion(link, '2026-09-01T10:00:00.000Z')).toBe(false)
    expect(changedSinceConversion(link, 'garbage')).toBe(false)
  })
})

describe('the Google Picker', () => {
  function mockPicker() {
    const log = { views: [] as { id: unknown; calls: [string, unknown][] }[], features: [] as unknown[], title: '', calledQuery: false, callback: null as null | ((d: PickerResponse) => void), visible: false }
    class View implements DocsViewApi {
      calls: [string, unknown][] = []
      constructor(id: unknown) {
        log.views.push({ id, calls: this.calls })
      }
      setMimeTypes(m: string) { this.calls.push(['mime', m]); return this }
      setIncludeFolders(b: boolean) { this.calls.push(['folders', b]); return this }
      setSelectFolderEnabled(b: boolean) { this.calls.push(['selectFolder', b]); return this }
      setOwnedByMe(b: boolean) { this.calls.push(['owned', b]); return this }
      setEnableDrives(b: boolean) { this.calls.push(['drives', b]); return this }
      setLabel(l: string) { this.calls.push(['label', l]); return this }
      setQuery() { log.calledQuery = true; return this }
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
  const call = (view: { calls: [string, unknown][] }, name: string) => view.calls.find((c) => c[0] === name)?.[1]

  it('shows My Drive, Shared with me, Recent and shared drives, with folders you can browse', async () => {
    const { api, log } = mockPicker()
    const p = pickOpenableFiles(opts, api)
    expect(log.views.map((v) => call(v, 'label'))).toEqual(['My Drive', 'Shared with me', 'Recent', 'Shared drives'])
    expect(call(log.views[1] as never, 'owned')).toBe(false)
    expect(call(log.views[3] as never, 'drives')).toBe(true)
    for (const v of log.views) {
      expect(call(v, 'folders')).toBe(true)
      expect(call(v, 'selectFolder')).toBe(false)
    }
    log.callback?.({ action: 'cancel' })
    await p
  })

  it('lists the types a .wishtaa or .emmx can have, and uses no text query (it would stop folder browsing)', async () => {
    const { api, log } = mockPicker()
    const p = pickOpenableFiles(opts, api)
    const mimes = String(call(log.views[0] as never, 'mime')).split(',')
    expect(mimes).toEqual(expect.arrayContaining([WISHTAA_MIME, WISHTAA_LEGACY_MIME, 'application/octet-stream', 'application/zip', 'application/x-zip-compressed']))
    expect(mimes).toEqual(PICKER_MIME_TYPES)
    expect(log.calledQuery).toBe(false)
    log.callback?.({ action: 'cancel' })
    await p
  })

  it('allows picking several files, and says in the title what can be opened', async () => {
    const { api, log } = mockPicker()
    const p = pickOpenableFiles(opts, api)
    expect(log.features).toEqual(expect.arrayContaining(['MULTI', 'DRIVES']))
    expect(log.title).toBe(OPEN_PICKER_TITLE)
    expect(log.title).toMatch(/\.wishtaa and \.emmx/)
    expect(log.visible).toBe(true)
    log.callback?.({ action: 'cancel' })
    await p
  })

  it('returns what was picked, and nothing when cancelled', async () => {
    const a = mockPicker()
    const p1 = pickOpenableFiles(opts, a.api)
    a.log.callback?.({ action: 'picked', docs: [{ id: '1', name: 'a.emmx' }, { id: '2', name: 'b.wishtaa', mimeType: 'application/json' }] })
    expect((await p1).map((d) => d.id)).toEqual(['1', '2'])
    const b = mockPicker()
    const p2 = pickOpenableFiles(opts, b.api)
    b.log.callback?.({ action: 'cancel' })
    expect(await p2).toEqual([])
  })

  it('needs the API key and client id', async () => {
    await expect(pickOpenableFiles({ token: 't', apiKey: undefined, clientId: '1-a' }, mockPicker().api)).rejects.toBeInstanceOf(DriveError)
  })
})

describe('new files get the new type; old ones still open', () => {
  let drive: FakeDrive
  let local: RepositoryCore
  let repo: DriveRepository
  beforeEach(() => {
    drive = new FakeDrive()
    local = new RepositoryCore(new MemoryBackend(), () => Date.now())
    const blobs: BlobStores = { images: new MemoryImageStore(), attachments: new MemoryImageStore() }
    repo = new DriveRepository(local, drive, { blobs: () => blobs })
  })

  it('a file made now has the .wishtaa type', async () => {
    const f = await local.create({ type: 'map', name: 'New', content: mapBytes('A') })
    const moved = await repo.moveToDrive(f.id)
    expect(drive.files.get(moved.contentRef as string)?.meta.mimeType).toBe(WISHTAA_MIME)
    expect(WISHTAA_MIME).toBe('application/vnd.wishtaa.map+json')
  })

  it('a file stored by an older version as plain JSON still opens, and is not rewritten to change its type', async () => {
    const text = await packFile({ type: 'map', name: 'Old', createdAt: 1, modifiedAt: 2, content: mapBytes('A') })
    const old = drive.seed('Old.wishtaa', text, undefined, 'application/json')
    const before = JSON.stringify(drive.files.get(old.id)?.meta)
    const rec = await repo.openFromDrive(old.id)
    expect(rec.storage).toBe('drive')
    expect(JSON.stringify(drive.files.get(old.id)?.meta)).toBe(before)
    expect(drive.calls.some((c) => c.startsWith('update') || c.startsWith('setAppProperties'))).toBe(false)
  })

  it('saving an old file keeps working (and keeps its type)', async () => {
    const text = await packFile({ type: 'map', name: 'Old', createdAt: 1, modifiedAt: 2, content: mapBytes('A') })
    const old = drive.seed('Old.wishtaa', text, undefined, 'application/json')
    const rec = await repo.openFromDrive(old.id)
    await repo.saveContent(rec.id, mapBytes('A', 'B'))
    expect(drive.files.get(old.id)?.meta.mimeType).toBe('application/json')
  })
})

describe('finding the converted copy', () => {
  it('first in this browser, then in Drive for another device', async () => {
    const drive = new FakeDrive()
    const local = new RepositoryCore(new MemoryBackend(), () => Date.now())
    const repo = new DriveRepository(local, drive, { blobs: () => ({ images: new MemoryImageStore(), attachments: new MemoryImageStore() }) })
    expect(await repo.findConverted('orig')).toBeNull()

    const link = { fileId: 'orig', name: 'a.emmx', modifiedTime: '2026-10-01T00:00:00.000Z', importedAt: '2026-10-02T00:00:00.000Z' }
    const f = await local.create({ type: 'map', name: 'a', content: mapBytes() })
    await local.update(f.id, { source: link })
    expect((await repo.findConverted('orig'))?.local?.id).toBe(f.id)

    // made on another device: only in Drive
    await local.trash(f.id)
    await local.remove(f.id)
    const made = await drive.create({ name: 'a.wishtaa', parentId: await drive.ensureAppFolder(), body: await packFile({ type: 'map', name: 'a', createdAt: 1, modifiedAt: 2, content: mapBytes() }), appProperties: sourceProps(link) })
    const found = await repo.findConverted('orig')
    expect(found?.driveFileId).toBe(made.id)
    expect(found?.link).toEqual({ ...link })
  })

  it('opening a converted copy from Drive keeps its link', async () => {
    const drive = new FakeDrive()
    const local = new RepositoryCore(new MemoryBackend(), () => Date.now())
    const repo = new DriveRepository(local, drive, { blobs: () => ({ images: new MemoryImageStore(), attachments: new MemoryImageStore() }) })
    const link = { fileId: 'orig', name: 'a.emmx', modifiedTime: '2026-10-01T00:00:00.000Z', importedAt: '2026-10-02T00:00:00.000Z' }
    const made = await drive.create({ name: 'a.wishtaa', parentId: await drive.ensureAppFolder(), body: await packFile({ type: 'map', name: 'a', createdAt: 1, modifiedAt: 2, content: mapBytes() }), appProperties: sourceProps(link) })
    const rec = await repo.openFromDrive(made.id)
    expect(rec.source).toEqual(link)
  })
})

