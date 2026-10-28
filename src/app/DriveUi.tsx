import { useEffect, useState } from 'react'
import { driveAuth } from './drive'
import { useFiles } from './FilesContext'
import { timeAgo } from './format'
import { Modal, buttonPrimary, buttonSecondary } from './Modal'
import { Cloud, Info, X } from './icons'
import { useDriveActions, useDriveAuth, useDriveConflicts } from './useDrive'

/** Shown when the same file changed in Google Drive and here. Nothing is overwritten until the user chooses. */
export function ConflictPrompt() {
  const conflicts = useDriveConflicts()
  const { files } = useFiles()
  const actions = useDriveActions()
  const [busy, setBusy] = useState(false)
  const [hidden, setHidden] = useState(false)
  const c = conflicts[0]
  const file = c ? files.find((f) => f.id === c.fileId) : undefined
  // A new conflict always asks again, even if the last one was put off.
  useEffect(() => setHidden(false), [conflicts.length, c?.fileId])
  if (!c || !file) return null
  if (hidden) {
    return (
      <div role="alert" className="flex items-center gap-3 border-b border-line bg-warn/10 px-4 py-2 text-sm">
        <Cloud size={16} aria-hidden="true" className="shrink-0 text-warn" />
        <p className="min-w-0 flex-1">"{file.name}" has two versions (here and in Google Drive). It is not syncing until you choose.</p>
        <button type="button" onClick={() => setHidden(false)} className="shrink-0 rounded-ui bg-brand px-3 py-1 text-xs font-semibold text-brand-ink hover:opacity-90">Choose</button>
      </div>
    )
  }

  const choose = async (choice: 'mine' | 'drive' | 'copy') => {
    setBusy(true)
    await actions.resolveConflict(c.fileId, choice)
    setBusy(false)
  }
  const option = (title: string, hint: string, choice: 'mine' | 'drive' | 'copy', primary = false) => (
    <button
      type="button"
      disabled={busy}
      onClick={() => void choose(choice)}
      className={`flex w-full flex-col rounded-ui border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${primary ? 'border-brand bg-brand/10 hover:bg-brand/20' : 'border-line hover:bg-bg'}`}
    >
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-xs text-muted">{hint}</span>
    </button>
  )

  return (
    <Modal title="Two versions of this file" onClose={() => setHidden(true)}>
      <p className="mb-1 text-sm">
        <strong>{file.name}</strong> was changed in Google Drive ({timeAgo(Date.parse(c.remote.modifiedTime))}) and also here ({timeAgo(file.modifiedAt)}). Choose which one to keep.
      </p>
      <p className="mb-3 text-xs text-muted">Nothing has been overwritten yet.</p>
      <div className="space-y-2">
        {option('Keep mine', 'Replace the version in Google Drive with the one here.', 'mine')}
        {option("Keep Drive's", 'Replace the one here with the version from Google Drive. Edits made here since the last sync are lost.', 'drive')}
        {option('Save a copy', 'Keep my version as a new file here, and take the version from Google Drive for this one.', 'copy', true)}
      </div>
    </Modal>
  )
}

/** A slim bar when Drive needs the user to sign in again (or access was removed). */
export function DriveBanner() {
  const auth = useDriveAuth()
  const actions = useDriveActions()
  const { files } = useFiles()
  const hasDriveFiles = files.some((f) => f.storage === 'drive' && !f.trashed)
  const needs = auth.status === 'reconnect' || (auth.status === 'disconnected' && !!auth.message && hasDriveFiles)
  if (!needs) return null
  return (
    <div role="alert" className="flex items-center gap-3 border-b border-line bg-warn/10 px-4 py-2 text-sm">
      <Cloud size={16} aria-hidden="true" className="shrink-0 text-warn" />
      <p className="min-w-0 flex-1">
        {auth.status === 'reconnect' ? 'Google Drive needs you to sign in again to keep syncing. Your changes are safe in this browser.' : auth.message}
      </p>
      <button type="button" onClick={() => void actions.connect()} className="shrink-0 rounded-ui bg-brand px-3 py-1 text-xs font-semibold text-brand-ink hover:opacity-90">
        {auth.status === 'reconnect' ? 'Reconnect' : 'Connect again'}
      </button>
      {auth.status === 'disconnected' && (
        <button type="button" onClick={() => driveAuth.dismissMessage()} aria-label="Dismiss" title="Dismiss" className="grid h-7 w-7 shrink-0 place-items-center rounded-ui hover:bg-bg">
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}


/** Storage settings: where files live, and Google Drive connect / disconnect. */
export function StorageSettings({ onClose }: { onClose: () => void }) {
  const auth = useDriveAuth()
  const actions = useDriveActions()
  const connected = auth.status === 'connected' || auth.status === 'reconnect'
  return (
    <Modal title="Storage" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="rounded-ui border border-line p-3">
          <p className="font-semibold">This browser</p>
          <p className="text-xs text-muted">Files are always kept here first, so editing is instant and works offline.</p>
        </div>
        <div className="rounded-ui border border-line p-3">
          <p className="flex items-center gap-2 font-semibold"><Cloud size={16} aria-hidden="true" /> Google Drive</p>
          {!actions.configured ? (
            <p className="mt-1 text-xs text-muted">Not set up for this site yet.</p>
          ) : connected ? (
            <>
              <p className="mt-1 text-xs text-muted">Connected{auth.account ? ` as ${auth.account}` : ''}. Wishtaa Maps can only see files it creates or that you open with it.</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className={buttonSecondary} onClick={() => void actions.disconnect()}>Disconnect</button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted">Keep files in your own Google Drive. Only files this app creates, or that you open with it, are visible to it.</p>
              <div className="mt-2">
                <button type="button" className={buttonPrimary} disabled={auth.status === 'connecting'} onClick={() => void actions.connect()}>
                  <Cloud size={16} aria-hidden="true" /> {auth.status === 'connecting' ? 'Connecting…' : 'Connect Google Drive'}
                </button>
              </div>
            </>
          )}
        </div>
        <p className="flex items-start gap-2 text-xs text-muted"><Info size={14} aria-hidden="true" className="mt-0.5 shrink-0" /> Our own cloud storage is coming later.</p>
      </div>
      <div className="mt-4 flex justify-end"><button type="button" className={buttonSecondary} onClick={onClose}>Close</button></div>
    </Modal>
  )
}
