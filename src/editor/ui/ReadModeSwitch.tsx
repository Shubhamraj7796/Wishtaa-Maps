import { Icon } from '@/ui/icons'
import { enterEditMode, enterReadMode } from '../readmode'
import { useEditor, type ReadReason } from '../store'

const WHY: Record<ReadReason, string> = {
  user: 'You switched to Read mode.',
  file: 'This file is set to open in Read mode.',
  preference: 'Your preference is to open files in Read mode.',
  drive: 'You can only view this file: you do not have permission to edit it in Google Drive.',
  link: 'Opened in Read mode.',
}

/** The Edit | Read switch, the "Read mode" badge, and the spoken announcement when the mode changes. */
export function ReadModeSwitch() {
  const readOnly = useEditor((s) => s.readOnly)
  const canEdit = useEditor((s) => s.canEdit)
  const reason = useEditor((s) => s.readReason)
  const said = useEditor((s) => s.modeAnnouncement)
  const seg = (on: boolean) => `px-2.5 py-1 text-xs font-medium transition-colors ${on ? 'bg-brand text-brand-ink' : 'text-muted hover:text-ink'}`

  return (
    <div className="flex shrink-0 items-center gap-2">
      <div role="group" aria-label="Mode" className="inline-flex overflow-hidden rounded-ui border border-line">
        {canEdit && (
          <button type="button" aria-pressed={!readOnly} onClick={() => enterEditMode()} title="Edit mode (Ctrl+Shift+R switches)" className={seg(!readOnly)}>
            Edit
          </button>
        )}
        <button type="button" aria-pressed={readOnly} onClick={() => void enterReadMode()} title="Read mode: nothing can be changed (Ctrl+Shift+R switches)" className={seg(readOnly)}>
          Read
        </button>
      </div>
      {readOnly && (
        <span data-testid="read-badge" title={reason ? WHY[reason] : undefined} className="flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-xs font-medium">
          <Icon name="lock" size={12} /> Read mode
        </span>
      )}
      {readOnly && !canEdit && <span className="hidden max-w-[16rem] truncate text-xs text-muted lg:inline">{WHY.drive}</span>}
      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  )
}
