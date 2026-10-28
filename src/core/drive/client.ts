import { DriveError } from './errors'
import { WISHTAA_MIME } from './format'

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
export const FOLDER_MIME = 'application/vnd.google-apps.folder'
export const APP_FOLDER_NAME = 'Wishtaa Maps'
const FILE_FIELDS = 'id,name,mimeType,modifiedTime,version,trashed,parents'

export interface DriveFileMeta {
  id: string
  name: string
  mimeType: string
  modifiedTime: string
  version: string
  trashed?: boolean
  parents?: string[]
}

/** What the rest of the app needs from Google Drive. The real one is `DriveClient`; tests use an in-memory fake. */
export interface DriveApi {
  /** True when Drive can be used right now without asking the user anything (connected, with a live token). */
  available(): boolean
  /** Creates the "Wishtaa Maps" folder on first use and returns its id. */
  ensureAppFolder(): Promise<string>
  meta(id: string): Promise<DriveFileMeta>
  download(id: string): Promise<string>
  create(input: { name: string; parentId: string; body: string }): Promise<DriveFileMeta>
  update(id: string, input: { name?: string; body: string }): Promise<DriveFileMeta>
  list(parentId: string): Promise<DriveFileMeta[]>
  trash(id: string): Promise<void>
}

export interface TokenProvider {
  /** A valid access token, renewing it silently if it has expired. */
  getToken(): Promise<string>
  /** Forces a new token (after a 401). */
  refresh(): Promise<string>
  /** Linked to a Google account, with a token ready to use (no sign-in prompt needed). */
  ready(): boolean
}

export interface FolderCache {
  get(): string | null
  set(id: string | null): void
}

const escapeQuery = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

export async function toDriveError(res: Response): Promise<DriveError> {
  let reason = ''
  let message = ''
  try {
    const body = (await res.json()) as { error?: { message?: string; errors?: { reason?: string }[] } }
    reason = body.error?.errors?.[0]?.reason ?? ''
    message = body.error?.message ?? ''
  } catch {
    /* no body */
  }
  const s = res.status
  if (s === 401) return new DriveError('auth', 'Your Google sign-in expired. Reconnect Google Drive to keep saving.', s)
  if (s === 404) return new DriveError('notfound', 'That file is no longer in Google Drive.', s)
  if (s === 429 || ['userRateLimitExceeded', 'rateLimitExceeded', 'dailyLimitExceeded', 'sharingRateLimitExceeded'].includes(reason)) {
    return new DriveError('rate', 'Google Drive is busy. Trying again shortly.', s)
  }
  if (['storageQuotaExceeded', 'quotaExceeded', 'teamDriveFileLimitExceeded'].includes(reason)) {
    return new DriveError('quota', 'Your Google Drive is full. Free up space, or keep this file in this browser.', s)
  }
  if (s === 403) {
    return new DriveError('revoked', 'Wishtaa Maps no longer has access to this file in Google Drive. Reconnect, or open it again with Open from Drive.', s)
  }
  return new DriveError('other', s >= 500 ? 'Google Drive is having trouble. Trying again shortly.' : message || `Google Drive returned an error (${s}).`, s)
}

/** Talks to the Drive REST API with the user's token. Only the `drive.file` scope is ever used. */
export class DriveClient implements DriveApi {
  constructor(
    private tokens: TokenProvider,
    private folder: FolderCache,
    private fetchImpl: typeof fetch = (input, init) => fetch(input, init)
  ) {}

  available() {
    return this.tokens.ready()
  }

  private async request(url: string, init: RequestInit = {}, retried = false): Promise<Response> {
    const token = await this.tokens.getToken()
    let res: Response
    try {
      res = await this.fetchImpl(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } })
    } catch {
      throw new DriveError('offline', 'No connection to Google Drive. Changes are kept here and will sync when you are back online.')
    }
    if (res.status === 401 && !retried) {
      await this.tokens.refresh()
      return this.request(url, init, true)
    }
    if (!res.ok) throw await toDriveError(res)
    return res
  }

  private json = async <T>(url: string, init?: RequestInit): Promise<T> => (await this.request(url, init)).json() as Promise<T>

  async ensureAppFolder(): Promise<string> {
    const cached = this.folder.get()
    if (cached) {
      try {
        const m = await this.meta(cached)
        if (!m.trashed) return cached
      } catch (e) {
        if (!(e instanceof DriveError) || e.kind !== 'notfound') throw e
      }
      this.folder.set(null)
    }
    const q = `name='${escapeQuery(APP_FOLDER_NAME)}' and mimeType='${FOLDER_MIME}' and trashed=false`
    const found = await this.json<{ files: DriveFileMeta[] }>(`${API}/files?q=${encodeURIComponent(q)}&fields=files(${FILE_FIELDS})&pageSize=1`)
    let id = found.files[0]?.id
    if (!id) {
      const made = await this.json<DriveFileMeta>(`${API}/files?fields=${FILE_FIELDS}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: APP_FOLDER_NAME, mimeType: FOLDER_MIME }),
      })
      id = made.id
    }
    this.folder.set(id)
    return id
  }

  meta(id: string): Promise<DriveFileMeta> {
    return this.json<DriveFileMeta>(`${API}/files/${encodeURIComponent(id)}?fields=${FILE_FIELDS}`)
  }

  async download(id: string): Promise<string> {
    return (await this.request(`${API}/files/${encodeURIComponent(id)}?alt=media`)).text()
  }

  private multipart(metadata: object, body: string) {
    const boundary = `wishtaa${Math.random().toString(36).slice(2)}`
    const text =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${WISHTAA_MIME}\r\n\r\n${body}\r\n--${boundary}--`
    return { headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: text }
  }

  create({ name, parentId, body }: { name: string; parentId: string; body: string }): Promise<DriveFileMeta> {
    const m = this.multipart({ name, parents: [parentId], mimeType: WISHTAA_MIME }, body)
    return this.json<DriveFileMeta>(`${UPLOAD}/files?uploadType=multipart&fields=${FILE_FIELDS}`, { method: 'POST', ...m })
  }

  update(id: string, { name, body }: { name?: string; body: string }): Promise<DriveFileMeta> {
    const m = this.multipart(name ? { name } : {}, body)
    return this.json<DriveFileMeta>(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=multipart&fields=${FILE_FIELDS}`, { method: 'PATCH', ...m })
  }

  async list(parentId: string): Promise<DriveFileMeta[]> {
    const q = `'${escapeQuery(parentId)}' in parents and trashed=false and (mimeType='${FOLDER_MIME}' or name contains '.wishtaa')`
    const out: DriveFileMeta[] = []
    let pageToken = ''
    do {
      const url = `${API}/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(${FILE_FIELDS})&orderBy=folder,modifiedTime%20desc&pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
      const page = await this.json<{ files: DriveFileMeta[]; nextPageToken?: string }>(url)
      out.push(...page.files)
      pageToken = page.nextPageToken ?? ''
    } while (pageToken)
    return out
  }

  /** The signed-in Google account's email, if Drive will tell us (it is optional, only for display). */
  async account(): Promise<string | null> {
    try {
      const about = await this.json<{ user?: { emailAddress?: string; displayName?: string } }>(`${API}/about?fields=user(emailAddress,displayName)`)
      return about.user?.emailAddress ?? about.user?.displayName ?? null
    } catch {
      return null
    }
  }

  async trash(id: string): Promise<void> {
    await this.request(`${API}/files/${encodeURIComponent(id)}?fields=id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    })
  }
}
