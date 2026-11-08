import { useEffect, useState } from 'react'
import type { DriveLinkRow } from '@/core/auth/types'
import { auth, useAuth } from '../account'
import { useAuthUi } from '../authUi'
import { driveAuth } from '../drive'
import { Cloud } from '../icons'
import { buttonPrimary, buttonSecondary } from '../Modal'
import { useDriveActions, useDriveAuth } from '../useDrive'
import { connectDriveFor } from './DriveDialogs'

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

/** Google Drive on the account page: which Google account is linked, whether it is the sign-in address, connect and disconnect. */
export function AccountDrive() {
  const drive = useDriveAuth()
  const actions = useDriveActions()
  const me = useAuth().user
  const open = useAuthUi((a) => a.openNow)
  const linked = drive.status === 'connected' || drive.status === 'reconnect'
  const [remote, setRemote] = useState<DriveLinkRow | null>(null)
  useEffect(() => {
    const uid = me?.id
    if (!uid) return
    let alive = true
    auth.backend().then((b) => b.db.getDriveLink(uid)).then((r) => alive && setRemote(r), () => undefined)
    return () => {
      alive = false
    }
  }, [me?.id, linked])

  const signInAddress = me?.googleEmail ?? me?.email
  const differs = linked && !!drive.account && !!signInAddress && !same(drive.account, me?.email) && !same(drive.account, me?.googleEmail)
  const onOtherDevice = !linked && remote?.status && remote.status !== 'disconnected' && remote.google_email

  return (
    <section aria-label="Google Drive" id="drive" className="mb-5 rounded-ui border border-line bg-surface p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Cloud size={16} aria-hidden="true" /> Google Drive</h2>
      {!actions.configured ? (
        <p className="text-sm text-muted">Google Drive is not set up for this site yet.</p>
      ) : linked ? (
        <>
          <p className="text-sm">Linked{drive.account ? <> as <strong className="break-all">{drive.account}</strong></> : ''}. Wishtaa Maps can only see files it creates or that you open with it.</p>
          {drive.status === 'reconnect' && <p className="mt-1 text-xs text-warn">Google asked you to confirm again. Choose Reconnect.</p>}
          {differs && (
            <p className="mt-2 rounded-ui border border-line bg-bg px-3 py-2 text-xs">
              This is a different address from your sign-in ({signInAddress}). That is allowed: your account is {me?.email}, and your maps are in the Drive of {drive.account}.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {drive.status === 'reconnect' && <button type="button" className={buttonPrimary} onClick={() => void actions.connect()}>Reconnect</button>}
            <button type="button" className={buttonSecondary} onClick={() => void actions.disconnect()}>Disconnect Google Drive</button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">Keep your maps in your own Google Drive and open them on any device.</p>
          {onOtherDevice && <p className="mt-1 text-xs text-muted">Your account has Google Drive linked as {remote?.google_email} on another device. Connect it here too.</p>}
          <div className="mt-3">
            <button type="button" className={buttonPrimary} disabled={drive.status === 'connecting'} onClick={() => (driveAuth.connected() ? void actions.connect() : connectDriveFor(open))}>
              {drive.status === 'connecting' ? 'Connecting…' : 'Connect Google Drive'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
