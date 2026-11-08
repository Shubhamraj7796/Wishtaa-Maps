import { useDriveActions, useDriveAuth } from '../useDrive'
import { Cloud } from '../icons'
import { buttonPrimary, buttonSecondary } from '../Modal'

/** Google Drive on the account page: which Google account is linked, connect and disconnect. */
export function AccountDrive() {
  const drive = useDriveAuth()
  const actions = useDriveActions()
  const linked = drive.status === 'connected' || drive.status === 'reconnect'
  return (
    <section aria-label="Google Drive" id="drive" className="mb-5 rounded-ui border border-line bg-surface p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Cloud size={16} aria-hidden="true" /> Google Drive</h2>
      {!actions.configured ? (
        <p className="text-sm text-muted">Google Drive is not set up for this site yet.</p>
      ) : linked ? (
        <>
          <p className="text-sm">Linked{drive.account ? ` as ${drive.account}` : ''}. Wishtaa Maps can only see files it creates or that you open with it.</p>
          <div className="mt-2"><button type="button" className={buttonSecondary} onClick={() => void actions.disconnect()}>Disconnect Google Drive</button></div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">Keep your maps in your own Google Drive and open them on any device.</p>
          <div className="mt-2"><button type="button" className={buttonPrimary} disabled={drive.status === 'connecting'} onClick={() => void actions.connect()}>Connect Google Drive</button></div>
        </>
      )}
    </section>
  )
}
