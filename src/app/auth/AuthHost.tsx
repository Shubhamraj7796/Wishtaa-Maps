import { useCallback, useState } from 'react'
import { addGuestFilesToAccount, auth, markGuestOfferDone, setLocalRecents, useAuth } from '../account'
import { useAuthUi } from '../authUi'
import { useFiles } from '../FilesContext'
import { Info, X } from '../icons'
import { Modal, buttonPrimary, buttonSecondary } from '../Modal'
import { useDriveActions } from '../useDrive'
import { DriveAllowDialog, DriveChooseDialog, DriveProblemDialog, PickerProblemDialog } from './DriveDialogs'
import { Alert } from './parts'
import { SignInDialog } from './SignInDialog'

/** "Your sign-in expired" bar. Nothing is lost: files and unsent changes stay in this browser. */
export function ExpiredBar() {
  const s = useAuth()
  const open = useAuthUi((a) => a.open)
  if (s.status !== 'expired') return null
  return (
    <div role="alert" className="flex items-center gap-3 border-b border-line bg-warn/10 px-4 py-2 text-sm">
      <Info size={16} aria-hidden="true" className="shrink-0 text-warn" />
      <p className="min-w-0 flex-1">You were signed out. Sign in again to keep syncing. Your files and changes on this device are safe.</p>
      <button type="button" onClick={() => open({ kind: 'signin', reason: 'Sign in again with the same method as before. Your files on this device are untouched.' })} className="shrink-0 rounded-ui bg-brand px-3 py-1 text-xs font-semibold text-brand-ink hover:opacity-90">
        Sign in again
      </button>
      <button type="button" onClick={() => auth.dismissExpired()} aria-label="Continue without signing in" title="Continue without signing in" className="grid h-7 w-7 shrink-0 place-items-center rounded-ui hover:bg-bg">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

/** First sign-in on a browser that already holds files: asks what to do with them. Nothing is uploaded or deleted without a choice. */
function GuestFilesDialog({ count, onClose }: { count: number; onClose: () => void }) {
  const drive = useDriveActions()
  const f = useFiles()
  const uid = useAuth().user?.id
  const [toDrive, setToDrive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const done = useCallback(
    (remember: boolean) => {
      if (uid) {
        markGuestOfferDone(uid)
        if (!remember) setLocalRecents(uid, false)
      }
      onClose()
    },
    [uid, onClose]
  )

  const add = async () => {
    setBusy(true)
    setError(null)
    try {
      // The Drive sign-in window needs this click, so it is the first thing that happens.
      if (toDrive && !(await drive.ensureConnected())) {
        setError('Google Drive was not connected, so nothing was moved. You can add the files without moving them, or try again.')
        return
      }
      const n = await addGuestFilesToAccount()
      let moved = 0
      if (toDrive) {
        for (const file of f.files.filter((x) => !x.trashed && x.type !== 'folder' && x.storage === 'local')) {
          if (await drive.moveToDrive(file)) moved++
          else break
        }
      }
      f.notify(moved ? `Added ${n} ${n === 1 ? 'file' : 'files'} to your account and moved ${moved} to Google Drive.` : `Added ${n} ${n === 1 ? 'file' : 'files'} to your account.`)
      done(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Add my files to my account?" onClose={() => done(true)}>
      <p className="text-sm">
        You have <strong>{count} {count === 1 ? 'file' : 'files'}</strong> saved in this browser. You can list {count === 1 ? 'it' : 'them'} under your account so {count === 1 ? 'it shows' : 'they show'} up in your recent files on your other devices.
      </p>
      <p className="mt-2 text-xs text-muted">Only the file names are added to your account, never what is inside. Your files stay where they are, and nothing is deleted.</p>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={toDrive} onChange={(e) => setToDrive(e.target.checked)} disabled={busy || !drive.configured} className="mt-0.5" />
        <span>
          Also move them to my Google Drive
          <span className="block text-xs text-muted">{drive.configured ? 'So they can be opened on any device. You will be asked to allow Google Drive.' : 'Google Drive is not set up for this site yet.'}</span>
        </span>
      </label>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" className={buttonSecondary} disabled={busy} onClick={() => done(false)}>Keep them in this browser only</button>
        <button type="button" className={buttonPrimary} disabled={busy} onClick={() => void add()}>Add my files</button>
      </div>
    </Modal>
  )
}

/** Hosts the account dialogs. Mounted once, in the app shell. */
export function AuthHost() {
  const dialog = useAuthUi((a) => a.dialog)
  const close = useAuthUi((a) => a.close)
  if (!dialog) return null
  if (dialog.kind === 'signin') return <SignInDialog initial={dialog.view} reason={dialog.reason} onClose={close} />
  if (dialog.kind === 'guest-files') return <GuestFilesDialog count={dialog.count} onClose={close} />
  if (dialog.kind === 'drive-allow') return <DriveAllowDialog email={dialog.email} onClose={close} />
  if (dialog.kind === 'drive-choose') return <DriveChooseDialog onClose={close} />
  if (dialog.kind === 'picker-problem') return <PickerProblemDialog which={dialog.which} reason={dialog.reason} answer={dialog.answer} onClose={close} />
  if (dialog.kind === 'drive-problem') return <DriveProblemDialog problem={dialog.problem} expected={dialog.expected} onClose={close} />
  return null
}
