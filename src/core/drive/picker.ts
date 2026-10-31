import { DriveError } from './errors'

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
  build(): { setVisible(v: boolean): void }
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
  Action: { PICKED: string; CANCEL: string }
}

const SCRIPT = 'https://apis.google.com/js/api.js'
let apiPromise: Promise<PickerApi> | null = null

function loadPicker(): Promise<PickerApi> {
  apiPromise ??= new Promise<PickerApi>((resolve, reject) => {
    const w = window as unknown as { gapi?: { load(name: string, cb: () => void): void }; google?: { picker?: PickerApi } }
    const finish = () => {
      w.gapi?.load('picker', () => {
        const p = w.google?.picker
        if (p) resolve(p)
        else reject(new DriveError('other', 'Google Picker did not load.'))
      })
    }
    if (w.gapi) return finish()
    const s = document.createElement('script')
    s.src = SCRIPT
    s.async = true
    s.onload = finish
    s.onerror = () => {
      apiPromise = null
      reject(new DriveError('offline', 'Could not reach Google. Check your connection and try again.'))
    }
    document.head.appendChild(s)
  })
  return apiPromise
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
  const picker = await loadPicker()
  return new Promise((resolve) => {
    const view = new picker.DocsView(picker.ViewId.FOLDERS)
    view.setIncludeFolders(true)
    view.setSelectFolderEnabled(true)
    view.setMimeTypes('application/vnd.google-apps.folder')
    new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(opts.token)
      .setDeveloperKey(opts.apiKey as string)
      .setAppId(projectNumber(opts.clientId as string))
      .setTitle('Choose a folder in Google Drive')
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) resolve(data.docs?.[0] ? { id: data.docs[0].id, name: data.docs[0].name } : null)
        else if (data.action === picker.Action.CANCEL) resolve(null)
      })
      .build()
      .setVisible(true)
  })
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
  const picker = api ?? (await loadPicker())
  return new Promise((resolve) => {
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
    builder
      .setOAuthToken(opts.token)
      .setDeveloperKey(opts.apiKey as string)
      .setAppId(projectNumber(opts.clientId as string))
      .setTitle(OPEN_PICKER_TITLE)
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) resolve((data.docs ?? []).map((d) => ({ id: d.id, name: d.name, mimeType: d.mimeType, sizeBytes: d.sizeBytes })))
        else if (data.action === picker.Action.CANCEL) resolve([])
      })
      .build()
      .setVisible(true)
  })
}
