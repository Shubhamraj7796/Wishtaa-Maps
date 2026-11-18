import { noteEntry, noteLabel } from '@/core/model/notes'
import { Icon } from '@/ui/icons'
import { IconButton } from '@/ui/IconButton'
import { useEditor } from '../store'
import { usePanelBox } from './panelInset'
import { closeNote, restoreNote, useItems } from './state'

/** The bottom of the tray is this far above the window's bottom edge: the status bar of the editor is under it. */
const ABOVE_STATUS_BAR = 44

function Chip({ id }: { id: string }) {
  const topics = useEditor((s) => s.topics)
  const notes = useEditor((s) => s.notes)
  const entry = noteEntry(topics, notes, id)
  const title = entry ? (entry.legacy ? 'First note' : noteLabel(entry)) : 'Note'
  return (
    <div data-min-note={id} className="flex h-9 min-w-0 max-w-[15rem] shrink-0 items-center rounded-ui border border-line bg-surface text-ink shadow-lg [@media(pointer:coarse)]:h-11">
      <button
        type="button"
        data-min-restore={id}
        aria-label={`Restore note: ${title}`}
        onClick={() => restoreNote(id)}
        className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-l-ui pl-2.5 pr-1 text-left text-sm font-medium hover:bg-bg focus-visible:bg-bg focus-visible:outline-offset-[-3px]"
      >
        <Icon name="notes" size={16} className="shrink-0 text-muted" />
        <span className="min-w-0 truncate">{title}</span>
      </button>
      <IconButton icon="chevronUp" label="Restore" data-min-restore-icon={id} onClick={() => restoreNote(id)} className="h-full [@media(pointer:coarse)]:min-w-11" />
      <IconButton icon="close" label="Close the note" data-min-close={id} onClick={() => closeNote(id)} className="h-full rounded-l-none [@media(pointer:coarse)]:min-w-11" />
    </div>
  )
}

/**
 * The tray of minimized notes: one small bar per note (its title, a restore icon, a close icon; a click on the title restores it), up to
 * four, bottom left above the status bar. It stays out of the way of the side panel (beside the map, or a bottom sheet on a phone) and
 * of the floating buttons at the bottom right (on a narrow window its width stops 172 px short of the right edge: the Style pill and the PDF round button live there), and scrolls sideways if it ever overflows.
 */
export function MinimizedTray() {
  const ids = useItems((s) => s.minimized)
  const popupOpen = useItems((s) => s.popup !== null)
  const panel = usePanelBox()
  if (ids.length === 0) return null
  // A bottom sheet (a phone) is above the status bar: the tray sits on top of it, unless a popup covers the sheet anyway.
  const bottom = panel.bottom > 0 && !popupOpen ? panel.bottom + 8 : ABOVE_STATUS_BAR
  return (
    <div
      role="region"
      aria-label="Minimized notes"
      data-min-tray
      className="fixed left-3 z-[790] flex max-w-[calc(100vw-172px)] gap-2 overflow-x-auto md:max-w-[calc(100vw-var(--tray-right)-24px)]"
      style={{ bottom: `calc(env(safe-area-inset-bottom, 0px) + ${bottom}px)`, ['--tray-right' as string]: `${panel.right}px` }}
    >
      {ids.map((id) => (
        <Chip key={id} id={id} />
      ))}
    </div>
  )
}
