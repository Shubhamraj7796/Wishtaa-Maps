import { useState } from 'react'
import { Cloud } from '../icons'
import { Modal, buttonPrimary, buttonSecondary } from '../Modal'
import { useDriveActions, useDriveAuth } from '../useDrive'
import { auth, useAuth } from '../account'
import { Alert } from './parts'

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Right after "Sign in with Google": the second half of ONE flow. Signing in proved who the person is; this asks Google, in the same
 * account (the address is passed as a hint, so there is no account picking), for the narrow Drive permission. It is a button because
 * browsers only open Google's window from a click.
 */
export function DriveAllowDialog({ email, onClose }: { email: string | null; onClose: () => void }) {
  const actions = useDriveActions()
  const [busy, setBusy] = useState(false)
  const allow = async () => {
    setBusy(true)
    const ok = await actions.connect()
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Modal title="Allow Google Drive?" onClose={onClose}>
      <p className="text-sm">
        You are signed in{email ? <> as <strong className="break-all">{email}</strong></> : ''}. One more step lets you keep your maps in your own Google Drive and open them on any device.
      </p>
      <p className="mt-3 text-sm font-medium">Allow Wishtaa Maps to create and open only the files it creates or you pick.</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
        <li>It cannot see anything else in your Drive.</li>
        <li>{email ? `Google will open a small window already set to ${email}.` : 'Google will open a small window.'}</li>
        <li>You can remove the access at any time from the Account page.</li>
      </ul>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={buttonSecondary} disabled={busy} onClick={onClose}>Not now</button>
        <button type="button" className={buttonPrimary} disabled={busy} onClick={() => void allow()}>
          <Cloud size={16} aria-hidden="true" /> {busy ? 'Waiting for Google…' : 'Allow Google Drive'}
        </button>
      </div>
    </Modal>
  )
}

/**
 * "Connect Google Drive" for someone who signed in by email code or password. Google's account chooser is always shown, and the
 * account that was picked is shown back, with a plain note when it is not the address they signed in with (which is allowed).
 */
export function DriveChooseDialog({ onClose }: { onClose: () => void }) {
  const actions = useDriveActions()
  const drive = useDriveAuth()
  const me = useAuth().user
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const connect = async () => {
    setBusy(true)
    const ok = await actions.connect({ chooseAccount: true })
    setBusy(false)
    if (ok) setDone(true)
  }
  const linked = drive.account
  const differs = !!linked && !!me?.email && !same(linked, me.email) && !same(linked, me.googleEmail)

  return (
    <Modal title="Connect Google Drive" onClose={onClose}>
      {!done ? (
        <>
          <p className="text-sm">Choose the Google account whose Drive should hold your maps.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
            <li>It can be a different address from the one you signed in to Wishtaa Maps with{me?.email ? ` (${me.email})` : ''}. That is allowed.</li>
            <li>Wishtaa Maps can only create and open the files it creates or you pick. It cannot see the rest of your Drive.</li>
          </ul>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className={buttonSecondary} disabled={busy} onClick={onClose}>Cancel</button>
            <button type="button" className={buttonPrimary} disabled={busy} onClick={() => void connect()}>
              <Cloud size={16} aria-hidden="true" /> {busy ? 'Waiting for Google…' : 'Choose a Google account'}
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <Alert tone="ok">Google Drive is connected{linked ? <> as <strong className="break-all">{linked}</strong></> : ''}.</Alert>
          {differs && (
            <Alert tone="info">
              This is a different address from the one you signed in with ({me?.email}). That is fine: your account stays {me?.email}, and your maps will be saved in the Drive of {linked}.
            </Alert>
          )}
          <div className="flex justify-end"><button type="button" className={buttonPrimary} onClick={onClose}>Done</button></div>
        </div>
      )}
    </Modal>
  )
}

/** Opens the right "connect Drive" step for how the person signed in. */
export function connectDriveFor(open: (d: { kind: 'drive-allow'; email: string | null } | { kind: 'drive-choose' }) => void) {
  const u = auth.state.user
  if (u?.googleEmail) open({ kind: 'drive-allow', email: u.googleEmail })
  else open({ kind: 'drive-choose' })
}
