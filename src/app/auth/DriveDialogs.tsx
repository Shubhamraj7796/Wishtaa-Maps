import { useCallback, useState } from 'react'
import { expectedDriveEmail } from '@/core/drive/linkAccount'
import { Cloud } from '../icons'
import { Modal, buttonPrimary, buttonSecondary } from '../Modal'
import { useDriveActions, useDriveAuth } from '../useDrive'
import { auth, useAuth } from '../account'
import { driveProblemDetails, supportEmail, type DriveProblem } from '../driveConnect'
import { pickPdfFromDevice } from '@/editor/pdf/actions'
import type { PickerFailure, PickerKind } from '@/core/drive/errors'
import { useImportEmmx } from '../importFlow'
import { pickerDetails, type PickerChoice } from '../pickerNotice'
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
  // Signed in with Google, or with a Gmail address: it must be that same Google account, so no account choosing. Any other address: any Google account.
  const required = expectedDriveEmail(auth.state.user)
  if (required) open({ kind: 'drive-allow', email: required })
  else open({ kind: 'drive-choose' })
}

/**
 * Something went wrong connecting Drive that the person can fix:
 *  - the wrong Google account was chosen (the token was thrown away; "Try again" asks for the right one);
 *  - Google's window closed or was blocked before finishing (cancelled, or "Access blocked / app not verified / not a test user");
 *  - the browser would not open Google's window (a button opens it as a direct click).
 */
export function DriveProblemDialog({ problem, expected, onClose }: { problem: DriveProblem; expected?: string | null; onClose: () => void }) {
  const actions = useDriveActions()
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const retry = async () => {
    setBusy(true)
    onClose() // a new problem opens its own dialog; success shows a message
    await actions.connect({ expected })
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(driveProblemDetails(problem))
      setCopied(true)
    } catch {
      /* clipboard blocked */
    }
  }

  if (problem.kind === 'account') {
    return (
      <Modal title="Use the same Google account" onClose={onClose}>
        <Alert>
          {problem.reason === 'mismatch' ? (
            <>This Drive belongs to <strong className="break-all">{problem.actual}</strong>. Please use the same Google account you signed in with (<strong className="break-all">{problem.expected}</strong>).</>
          ) : (
            <>Could not confirm which Google account this Drive belongs to. Please try again with <strong className="break-all">{problem.expected}</strong>.</>
          )}
        </Alert>
        <p className="mt-3 text-xs text-muted">The other Google account was not connected and nothing was saved to it.</p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className={buttonSecondary} onClick={() => void copy()}>{copied ? 'Copied' : 'Copy details'}</button>
          <button type="button" className={buttonSecondary} onClick={onClose}>Cancel</button>
          <button type="button" className={buttonPrimary} disabled={busy} onClick={() => void retry()}>Try again with {problem.expected}</button>
        </div>
      </Modal>
    )
  }

  if (problem.kind === 'popup') {
    return (
      <Modal title="Your browser blocked Google's window" onClose={onClose}>
        <p className="text-sm">Google needs to open a small window to connect Drive, and your browser stopped it. Press the button below to open it yourself, or allow pop-ups for this site.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={buttonSecondary} onClick={onClose}>Cancel</button>
          <button type="button" className={buttonPrimary} disabled={busy} onClick={() => void retry()}>
            <Cloud size={16} aria-hidden="true" /> Open Google sign-in
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Google did not finish connecting Drive" onClose={onClose}>
      <p className="text-sm">The Google window closed before connecting. If you simply changed your mind, you can try again.</p>
      <div className="mt-3">
        <Alert tone="info">
          If Google said <strong>Access blocked</strong>, <strong>app not verified</strong> or <strong>not a test user</strong>, Wishtaa Maps is still being approved by Google and your account has not been added yet.
          {supportEmail ? <> Please write to <a className="underline" href={`mailto:${supportEmail}`}>{supportEmail}</a> and include the details below.</> : <> Please contact the person who gave you this link and send them the details below.</>}
        </Alert>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" className={buttonSecondary} onClick={() => void copy()}>{copied ? 'Copied' : 'Copy details'}</button>
        <button type="button" className={buttonSecondary} onClick={onClose}>Close</button>
        <button type="button" className={buttonPrimary} disabled={busy} onClick={() => void retry()}>Try again</button>
      </div>
    </Modal>
  )
}

/**
 * Some browsers (Brave, or any that blocks third-party cookies or frames) cannot show Google's file picker. One calm notice: copy the
 * link to open elsewhere, try again, or choose a file from this device instead (not offered for the save-to folder picker).
 */
export function PickerProblemDialog({ which, reason, answer, onClose }: { which: PickerKind; reason: PickerFailure; answer: (c: PickerChoice) => void; onClose: () => void }) {
  const importer = useImportEmmx()
  const [linkCopied, setLinkCopied] = useState(false)
  const [detailsCopied, setDetailsCopied] = useState(false)
  const giveUp = useCallback(() => {
    answer('close') // Escape, the x or a click outside: the picker's caller stops waiting
    onClose()
  }, [answer, onClose])
  const choose = (c: PickerChoice, then?: () => void) => {
    then?.() // the device chooser must open from this click
    answer(c)
    onClose()
  }
  const copy = async (text: string, done: () => void) => {
    try {
      await navigator.clipboard.writeText(text)
      done()
    } catch {
      /* clipboard blocked */
    }
  }
  return (
    <Modal title="Google Drive could not open in this browser" onClose={giveUp}>
      <p className="text-sm">Some browsers (for example Brave) block the Google file picker. Please open Wishtaa Maps in Chrome, Edge or Firefox to use Google Drive, or allow cookies for this site.</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <button type="button" className={buttonSecondary} onClick={() => void copy(location.href, () => setLinkCopied(true))}>
          {linkCopied ? 'Link copied' : 'Copy link to open in another browser'}
        </button>
        {which !== 'folder' && (
          <button type="button" className={buttonSecondary} onClick={() => choose('device', which === 'pdf' ? pickPdfFromDevice : () => importer.pick({ source: 'home' }))}>
            Choose a file from this device
          </button>
        )}
        <button type="button" className={buttonPrimary} onClick={() => choose('retry')}>Try again</button>
      </div>
      <p className="mt-3 text-xs">
        <button type="button" className="text-muted underline underline-offset-2 hover:text-ink" onClick={() => void pickerDetails(which, reason).then((t) => copy(t, () => setDetailsCopied(true)))}>
          {detailsCopied ? 'Details copied' : 'Copy details'}
        </button>
      </p>
    </Modal>
  )
}
