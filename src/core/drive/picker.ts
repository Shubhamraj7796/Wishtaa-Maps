import { DriveError } from './errors'
import { WISHTAA_MIME } from './format'

export interface PickedFile {
  id: string
  name: string
}

interface PickerBuilder {
  addView(view: unknown): PickerBuilder
  setOAuthToken(t: string): PickerBuilder
  setDeveloperKey(k: string): PickerBuilder
  setAppId(id: string): PickerBuilder
  setCallback(cb: (data: PickerResponse) => void): PickerBuilder
  setTitle(t: string): PickerBuilder
  build(): { setVisible(v: boolean): void }
}
interface PickerResponse {
  action: string
  docs?: { id: string; name: string }[]
}
interface PickerApi {
  PickerBuilder: new () => PickerBuilder
  DocsView: new (viewId?: unknown) => { setMimeTypes(m: string): unknown; setIncludeFolders(b: boolean): unknown; setSelectFolderEnabled(b: boolean): unknown }
  ViewId: { DOCS: unknown }
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
 * Lets the user choose a `.wishtaa` file from their Drive. Picking a file gives this app access to that one file
 * (the `drive.file` scope), which is how files made elsewhere can be opened without full Drive access.
 */
export async function pickWishtaaFile(opts: { token: string; apiKey: string | undefined; clientId: string | undefined }): Promise<PickedFile | null> {
  if (!opts.apiKey || !opts.clientId) {
    throw new DriveError('config', 'Choosing files from Drive needs a Google API key. Add VITE_GOOGLE_API_KEY (see the setup notes).')
  }
  const picker = await loadPicker()
  return new Promise((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS)
    view.setMimeTypes(WISHTAA_MIME)
    view.setIncludeFolders(true)
    view.setSelectFolderEnabled(false)
    new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(opts.token)
      .setDeveloperKey(opts.apiKey as string)
      .setAppId(projectNumber(opts.clientId as string))
      .setTitle('Open a Wishtaa Maps file from Google Drive')
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) resolve(data.docs?.[0] ? { id: data.docs[0].id, name: data.docs[0].name } : null)
        else if (data.action === picker.Action.CANCEL) resolve(null)
      })
      .build()
      .setVisible(true)
  })
}
