import { useEditor } from '@/editor/store'
import { Cloud } from './icons'
import { useFiles } from './FilesContext'
import { useDriveAuth } from './useDrive'

/** Where the open file saves, shown next to the save status, so it is never a guess. Moving it is a separate, explicit action. */
export function SaveLocation() {
  const fileId = useEditor((s) => s.fileId)
  const { files } = useFiles()
  const auth = useDriveAuth()
  const file = fileId ? files.find((f) => f.id === fileId) : undefined
  if (!file) return null

  const drive = file.storage === 'drive'
  const account = auth.account ?? null
  const label = drive ? `Google Drive${account ? ` · ${account}` : ''}` : 'This browser'
  const tip = drive
    ? `Saves to Google Drive${account ? ` (${account})` : ''}, with a copy kept in this browser. To change this, use the file menu: Move to this browser.`
    : 'Saves in this browser only. To keep it in Google Drive, use the file menu: Move to Google Drive.'
  return (
    <span data-testid="save-location" title={tip} className="flex min-w-0 max-w-[14rem] shrink items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-muted">
      <Cloud size={13} aria-hidden="true" className={`shrink-0 ${drive ? 'text-brand' : ''}`} />
      <span className="hidden truncate sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </span>
  )
}
