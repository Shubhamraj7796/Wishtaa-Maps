import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FOLDER_MIME, type DriveFileMeta } from '@/core/drive/client'
import { nameFromDrive } from '@/core/drive/format'
import { useCreate } from '../createFlow'
import { useImportEmmx } from '../importFlow'
import { driveAuth } from '../drive'
import { FileKindIcon } from '../FileBrowser'
import { useFiles } from '../FilesContext'
import { timeAgo } from '../format'
import { BookOpen, Cloud, Folder, FolderPlus, Info, Network, RotateCcw, Upload } from '../icons'
import { buttonPrimary, buttonSecondary } from '../Modal'
import { driveRepository } from '../repo'
import { EmptyState, Page, PageHeader } from '../ui'
import { useDriveActions, useDriveAuth } from '../useDrive'

interface Crumb {
  id: string | undefined
  name: string
}

/** The part of Google Drive this app can see: the "Wishtaa Maps" folder and whatever the user opened with it. */
function DriveBrowser({ initialFolder }: { initialFolder: { id: string; name: string } | null }) {
  const actions = useDriveActions()
  const create = useCreate()
  const importer = useImportEmmx()
  const [trail, setTrail] = useState<Crumb[]>([{ id: undefined, name: 'Wishtaa Maps' }, ...(initialFolder ? [initialFolder] : [])])
  const [items, setItems] = useState<DriveFileMeta[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const auth = useDriveAuth()
  const here = trail[trail.length - 1] as Crumb

  const load = useCallback(async () => {
    setItems(null)
    setError(null)
    try {
      const out = await driveRepository.browse(here.id)
      setItems(out.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load Google Drive.')
    }
  }, [here.id])

  // Only look when a sign-in is live; otherwise ask the user first (so no sign-in window opens by itself).
  const ready = auth.status === 'connected' && driveAuth.ready()
  useEffect(() => {
    if (ready) void load()
  }, [ready, load])

  if (!ready) {
    return (
      <EmptyState icon={<Cloud size={26} aria-hidden="true" />} title="Sign in to see your Drive files">
        Your files are safe in this browser. Sign in again to browse and sync with Google Drive.
        <div className="mt-4 flex justify-center">
          <button type="button" className={buttonPrimary} onClick={() => void actions.connect()}>
            <Cloud size={16} aria-hidden="true" /> Reconnect Google Drive
          </button>
        </div>
      </EmptyState>
    )
  }

  // Creating here puts the new file or folder in the Drive folder being viewed, without asking.
  const make = (item: 'map' | 'kb' | 'folder') =>
    create.start(item, { source: 'drive', driveFolder: here.id ? { id: here.id, name: here.name } : null, onFolderCreated: () => void load() })

  return (
    <section aria-label="Google Drive files">
      <div role="group" aria-label={`Create in ${here.name}`} className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Create in {here.name}:</span>
        <button type="button" className={buttonSecondary} onClick={() => make('map')}><Network size={15} aria-hidden="true" /> New mind map</button>
        <button type="button" className={buttonSecondary} onClick={() => make('kb')}><BookOpen size={15} aria-hidden="true" /> New knowledge base</button>
        <button type="button" className={buttonSecondary} onClick={() => make('folder')}><FolderPlus size={15} aria-hidden="true" /> New folder</button>
        <button type="button" className={buttonSecondary} onClick={() => importer.pick({ source: 'drive', driveFolder: here.id ? { id: here.id, name: here.name } : null, onDone: () => void load() })}><Upload size={15} aria-hidden="true" /> Import .emmx</button>
      </div>
      <nav aria-label="Drive folders" className="mb-3 flex flex-wrap items-center gap-1 text-sm text-muted">
        {trail.map((c, i) => (
          <span key={`${c.id ?? 'root'}`} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden="true">/</span>}
            {i === trail.length - 1 ? (
              <span aria-current="page" className="px-1 font-medium text-ink">{c.name}</span>
            ) : (
              <button type="button" onClick={() => setTrail(trail.slice(0, i + 1))} className="rounded px-1 hover:text-ink hover:underline">{c.name}</button>
            )}
          </span>
        ))}
        <button type="button" onClick={() => void load()} aria-label="Refresh" title="Refresh" className="ml-auto grid h-8 w-8 place-items-center rounded-ui hover:bg-bg">
          <RotateCcw size={16} aria-hidden="true" />
        </button>
      </nav>

      {error && (
        <div role="alert" className="mb-3 rounded-ui border border-bad/50 bg-bad/10 px-3 py-2 text-sm">{error}</div>
      )}
      {items === null && !error && <p role="status" className="py-8 text-center text-sm text-muted">Loading…</p>}
      {items?.length === 0 && (
        <EmptyState icon={<Folder size={26} aria-hidden="true" />} title="Nothing here yet">
          Use Move to Google Drive on a file in All files, or Open from Google Drive to add one you already have.
        </EmptyState>
      )}
      {items && items.length > 0 && (
        <ul aria-label="Drive files" className="divide-y divide-line overflow-hidden rounded-ui border border-line bg-surface">
          {items.map((it) => {
            const folder = it.mimeType === FOLDER_MIME
            const linked = !folder && actions.isInDrive(it.id)
            return (
              <li key={it.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-ui bg-brand/15 text-brand">
                  {folder ? <Folder size={18} aria-hidden="true" /> : <FileKindIcon type="map" size={18} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{folder ? it.name : nameFromDrive(it.name)}</span>
                  <span className="block truncate text-xs text-muted">
                    {folder ? 'Folder' : 'Wishtaa Maps file'} · {timeAgo(Date.parse(it.modifiedTime))}
                    {linked ? ' · In your files' : ''}
                  </span>
                </span>
                {folder ? (
                  <button type="button" className={buttonSecondary} onClick={() => setTrail([...trail, { id: it.id, name: it.name }])}>Open folder</button>
                ) : (
                  <button type="button" className={buttonSecondary} onClick={() => void actions.openDriveFile(it.id)} aria-label={`Open ${nameFromDrive(it.name)}`}>Open</button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default function Drive() {
  const auth = useDriveAuth()
  const actions = useDriveActions()
  const { files } = useFiles()
  const [params] = useSearchParams()
  const folderParam = params.get('folder')
  const connected = auth.status === 'connected' || auth.status === 'reconnect'
  const stored = files.filter((f) => f.storage === 'drive' && !f.trashed).length

  return (
    <Page>
      <PageHeader title="Google Drive" subtitle="Keep your maps in your own Google Drive.">
        {connected && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={buttonPrimary} onClick={() => void actions.openFromGoogleDrive()}>
              <Cloud size={16} aria-hidden="true" /> Open from Google Drive
            </button>
            <button type="button" className={buttonSecondary} onClick={() => void actions.disconnect()}>Disconnect</button>
          </div>
        )}
      </PageHeader>

      {!actions.configured && (
        <EmptyState icon={<Cloud size={26} aria-hidden="true" />} title="Google Drive is not set up on this site yet">
          The site owner needs to add a Google client ID. Until then, files are saved in this browser only.
          <p className="mt-2 text-xs">Setup steps: <code>docs/google-drive-setup.md</code> (variable <code>VITE_GOOGLE_CLIENT_ID</code>).</p>
        </EmptyState>
      )}

      {actions.configured && !connected && (
        <div className="mx-auto max-w-xl rounded-ui border border-line bg-surface p-6 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-brand/15 text-brand"><Cloud size={26} aria-hidden="true" /></span>
          <h2 className="text-base font-semibold">Connect Google Drive</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Save maps and knowledge bases in a “Wishtaa Maps” folder in your Drive and open them on any device.
          </p>
          <ul className="mx-auto mt-3 max-w-md space-y-1 text-left text-xs text-muted">
            <li className="flex gap-2"><Info size={14} aria-hidden="true" className="mt-0.5 shrink-0" /> Wishtaa Maps can only see files it creates, or that you choose to open with it. It never sees the rest of your Drive.</li>
            <li className="flex gap-2"><Info size={14} aria-hidden="true" className="mt-0.5 shrink-0" /> Files are always kept in this browser too, so editing works offline and syncs when you are back.</li>
            <li className="flex gap-2"><Info size={14} aria-hidden="true" className="mt-0.5 shrink-0" /> You can disconnect at any time.</li>
          </ul>
          {auth.message && <p role="alert" className="mx-auto mt-3 max-w-md rounded-ui bg-warn/10 px-3 py-2 text-sm">{auth.message}</p>}
          <button type="button" disabled={auth.status === 'connecting'} onClick={() => void actions.connect()} className={`${buttonPrimary} mt-4`}>
            <Cloud size={16} aria-hidden="true" /> {auth.status === 'connecting' ? 'Connecting…' : 'Connect Google Drive'}
          </button>
        </div>
      )}

      {actions.configured && connected && (
        <>
          <p className="mb-4 text-sm text-muted">
            Connected{auth.account ? ` as ${auth.account}` : ''}. {stored === 0 ? 'No files are stored in Drive yet.' : `${stored} ${stored === 1 ? 'file is' : 'files are'} stored in Drive.`}
          </p>
          <DriveBrowser key={folderParam ?? 'root'} initialFolder={folderParam ? { id: folderParam, name: params.get('name') ?? 'Folder' } : null} />
        </>
      )}
    </Page>
  )
}
