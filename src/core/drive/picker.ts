import { DriveError, PickerUnavailableError, type PickerKind } from './errors'

export interface PickedFile {
  id: string
  name: string
}

export interface PickerBuilder {
  addView(view: unknown): PickerBuilder
  setOAuthToken(t: string): PickerBuilder
  setDeveloperKey(k: string): PickerBuilder
  setAppId(id: string): PickerBuilder
  setCallback(cb: (data: PickerResponse) => void): PickerBuilder
  setTitle(t: string): PickerBuilder
  enableFeature(f: unknown): PickerBuilder
  build(): { setVisible(v: boolean): void; dispose?(): void }
}
export interface PickerResponse {
  action: string
  docs?: { id: string; name: string; mimeType?: string; sizeBytes?: number; lastEditedUtc?: number }[]
}
export interface DocsViewApi {
  setMimeTypes(m: string): DocsViewApi
  setIncludeFolders(b: boolean): DocsViewApi
  setSelectFolderEnabled(b: boolean): DocsViewApi
  setOwnedByMe?(b: boolean): DocsViewApi
  setEnableDrives?(b: boolean): DocsViewApi
  setLabel?(l: string): DocsViewApi
}
export interface PickerApi {
  PickerBuilder: new () => PickerBuilder
  DocsView: new (viewId?: unknown) => DocsViewApi
  ViewId: { DOCS: unknown; FOLDERS: unknown; RECENTLY_PICKED?: unknown }
  Feature: { MULTISELECT_ENABLED: unknown; SUPPORT_DRIVES?: unknown }
  Action: { PICKED: string; CANCEL: string; LOADED?: string }
}

const SCRIPT = 'https://apis.google.com/js/api.js'
let apiPromise: Promise<PickerApi> | null = null

/** How long the picker has to show itself (its script, then its window) before the app says it cannot open here. */
export const PICKER_WAIT_MS = 15_000

/** For tests: forget a picker that was loaded before. */
export const resetPickerLoader = () => void (apiPromise = null)

function loadPicker(which: PickerKind): Promise<PickerApi> {
  apiPromise ??= new Promise<PickerApi>((resolve, reject) => {
    const w = window as unknown as { gapi?: { load(name: string, cb: unknown): void }; google?: { picker?: PickerApi } }
    const timer = setTimeout(() => {
      apiPromise = null
      reject(new PickerUnavailableError('script-blocked', which))
    }, PICKER_WAIT_MS)
    const fail = (e: Error) => {
      clearTimeout(timer)
      apiPromise = null
      reject(e)
    }
    const finish = () => {
      try {
        w.gapi?.load('picker', {
          callback: () => {
            const p = w.google?.picker
            if (p) {
              clearTimeout(timer)
              resolve(p)
            } else fail(new PickerUnavailableError('script-blocked', which))
          },
          onerror: () => fail(new PickerUnavailableError('script-blocked', which)),
        })
      } catch {
        fail(new PickerUnavailableError('script-blocked', which))
      }
    }
    if (w.gapi) return finish()
    const s = document.createElement('script')
    s.src = SCRIPT
    s.async = true
    s.onload = finish
    s.onerror = () => fail(typeof navigator !== 'undefined' && navigator.onLine === false ? new DriveError('offline', 'Could not reach Google. Check your connection and try again.') : new PickerUnavailableError('script-blocked', which))
    document.head.appendChild(s)
  })
  return apiPromise
}

/**
 * Shows a built picker and waits for the answer. Picking and cancelling are answers; a picker that never reports "loaded" within
 * PICKER_WAIT_MS (a blocked frame, an error page, a sign-in screen the app cannot see) is a failure: it is hidden and disposed so
 * nothing of Google's is left on screen, and anything it reports later is ignored.
 */
function present<T>(picker: PickerApi, which: PickerKind, builder: PickerBuilder, onData: (d: PickerResponse) => { value: T } | null): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false
    let handle: ReturnType<PickerBuilder['build']> | null = null
    const timer = setTimeout(() => stop(new PickerUnavailableError('never-loaded', which)), PICKER_WAIT_MS)
    const stop = (error: Error | null, value?: T) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (error) {
        try {
          handle?.setVisible(false)
          handle?.dispose?.()
        } catch {
          /* already gone */
        }
        reject(error)
      } else resolve(value as T)
    }
    builder.setCallback((data) => {
      if (done) return // a late "loaded" (or anything) after the notice was shown changes nothing
      if (data.action === (picker.Action.LOADED ?? 'loaded')) {
        clearTimeout(timer) // it opened: from here the person takes as long as they like
        return
      }
      const r = onData(data)
      if (r) stop(null, r.value)
    })
    try {
      handle = builder.build()
      handle.setVisible(true)
    } catch {
      stop(new PickerUnavailableError('start-failed', which))
    }
  })
}

/** The Google Cloud project number is the first part of the OAuth client id. */
export const projectNumber = (clientId: string) => clientId.split('-')[0] ?? ''

/**
 * Lets the user choose a Drive folder to save new files in. Choosing a folder gives this app access to that folder
 * (the `drive.file` scope), so files can be created inside it.
 */
export async function pickDriveFolder(opts: { token: string; apiKey: string | undefined; clientId: string | undefined }): Promise<PickedFile | null> {
  if (!opts.apiKey || !opts.clientId) {
    throw new DriveError('config', 'Choosing a folder needs a Google API key. Add VITE_GOOGLE_API_KEY (see the setup notes).')
  }
  const picker = await loadPicker('folder')
  {
    const view = new picker.DocsView(picker.ViewId.FOLDERS)
    view.setIncludeFolders(true)
    view.setSelectFolderEnabled(true)
    view.setMimeTypes('application/vnd.google-apps.folder')
    const builder = new picker.PickerBuilder().addView(view).setOAuthToken(opts.token).setDeveloperKey(opts.apiKey as string).setAppId(projectNumber(opts.clientId as string)).setTitle('Choose a folder in Google Drive')
    return present<PickedFile | null>(picker, 'folder', builder, (data) =>
      data.action === picker.Action.PICKED ? { value: data.docs?.[0] ? { id: data.docs[0].id, name: data.docs[0].name } : null } : data.action === picker.Action.CANCEL ? { value: null } : null
    )
  }
}

export interface OpenedDoc {
  id: string
  name: string
  mimeType?: string
  sizeBytes?: number
}

export const OPEN_PICKER_TITLE = 'Open from Google Drive. Tip: type .emmx or .wishtaa in the search box to narrow the list.'

/**
 * "Open from Google Drive": My Drive, Shared with me, Recent and shared drives, folders you can browse into, several files at
 * once. The Picker cannot filter by file extension, and Drive gives a file uploaded from a computer an unpredictable type, so NO
 * type filter is set: every file is listed and the caller checks every pick by name and content. Picking a file gives this app
 * access to that one file (the `drive.file` scope). `api` is only for tests.
 */
export async function pickOpenableFiles(opts: { token: string; apiKey: string | undefined; clientId: string | undefined }, api?: PickerApi): Promise<OpenedDoc[]> {
  if (!opts.apiKey || !opts.clientId) {
    throw new DriveError('config', 'Choosing files from Drive needs a Google API key. Add VITE_GOOGLE_API_KEY (see the setup notes).')
  }
  const picker = api ?? (await loadPicker('open-map'))
  {
    // No text query: it would stop folder browsing.
    const view = (viewId: unknown, label: string, setup?: (v: DocsViewApi) => void) => {
      const v = new picker.DocsView(viewId)
      v.setIncludeFolders(true)
      v.setSelectFolderEnabled(false)
      v.setLabel?.(label)
      setup?.(v)
      return v
    }
    const builder = new picker.PickerBuilder()
      .addView(view(picker.ViewId.DOCS, 'My Drive', (v) => v.setOwnedByMe?.(true)))
      .addView(view(picker.ViewId.DOCS, 'Shared with me', (v) => v.setOwnedByMe?.(false)))
    if (picker.ViewId.RECENTLY_PICKED) builder.addView(view(picker.ViewId.RECENTLY_PICKED, 'Recent'))
    builder.addView(view(picker.ViewId.DOCS, 'Shared drives', (v) => v.setEnableDrives?.(true)))
    builder.enableFeature(picker.Feature.MULTISELECT_ENABLED)
    if (picker.Feature.SUPPORT_DRIVES) builder.enableFeature(picker.Feature.SUPPORT_DRIVES)
    builder.setOAuthToken(opts.token).setDeveloperKey(opts.apiKey as string).setAppId(projectNumber(opts.clientId as string)).setTitle(OPEN_PICKER_TITLE)
    return present<OpenedDoc[]>(picker, 'open-map', builder, (data) =>
      data.action === picker.Action.PICKED ? { value: (data.docs ?? []).map((d) => ({ id: d.id, name: d.name, mimeType: d.mimeType, sizeBytes: d.sizeBytes })) } : data.action === picker.Action.CANCEL ? { value: [] } : null
    )
  }
}

/**
 * "Insert a PDF from Google Drive": its own Picker, set up for PDFs (the .wishtaa and .emmx picker above is not used). My Drive, Shared with
 * me, Recent and shared drives, with folders to browse, and several PDFs can be chosen. Picking a file gives this app access to that one
 * file (the `drive.file` scope), so it can be downloaded. A PDF uploaded from a computer is sometimes typed as a generic binary file, so a
 * last tab lists every file for those; each pick is checked by its content afterwards. `api` is only for tests.
 */
export async function pickPdfFiles(opts: { token: string; apiKey: string | undefined; clientId: string | undefined }, api?: PickerApi): Promise<OpenedDoc[]> {
  if (!opts.apiKey || !opts.clientId) {
    throw new DriveError('config', 'Choosing a PDF from Drive needs a Google API key. Add VITE_GOOGLE_API_KEY (see the setup notes).')
  }
  const picker = api ?? (await loadPicker('pdf'))
  {
    const view = (viewId: unknown, label: string, setup?: (v: DocsViewApi) => void, pdfOnly = true) => {
      const v = new picker.DocsView(viewId)
      if (pdfOnly) v.setMimeTypes('application/pdf')
      v.setIncludeFolders(true)
      v.setSelectFolderEnabled(false)
      v.setLabel?.(label)
      setup?.(v)
      return v
    }
    const builder = new picker.PickerBuilder()
      .addView(view(picker.ViewId.DOCS, 'My Drive', (v) => v.setOwnedByMe?.(true)))
      .addView(view(picker.ViewId.DOCS, 'Shared with me', (v) => v.setOwnedByMe?.(false)))
    if (picker.ViewId.RECENTLY_PICKED) builder.addView(view(picker.ViewId.RECENTLY_PICKED, 'Recent'))
    builder.addView(view(picker.ViewId.DOCS, 'Shared drives', (v) => v.setEnableDrives?.(true)))
    builder.addView(view(picker.ViewId.DOCS, 'Any file (.pdf)', undefined, false))
    builder.enableFeature(picker.Feature.MULTISELECT_ENABLED)
    if (picker.Feature.SUPPORT_DRIVES) builder.enableFeature(picker.Feature.SUPPORT_DRIVES)
    builder.setOAuthToken(opts.token).setDeveloperKey(opts.apiKey as string).setAppId(projectNumber(opts.clientId as string)).setTitle('Insert a PDF from Google Drive')
    return present<OpenedDoc[]>(picker, 'pdf', builder, (data) =>
      data.action === picker.Action.PICKED ? { value: (data.docs ?? []).map((d) => ({ id: d.id, name: d.name, mimeType: d.mimeType, sizeBytes: d.sizeBytes })) } : data.action === picker.Action.CANCEL ? { value: [] } : null
    )
  }
}
