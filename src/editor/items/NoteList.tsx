import { useMemo } from 'react'
import { timeAgo } from '@/app/format'
import { addNote, noteLabel, notesOf } from '@/core/model/notes'
import { checklistProgress, noteText } from '@/core/sanitize'
import { Icon } from '@/ui/icons'
import { IconButton } from '@/ui/IconButton'
import { Tooltip } from '@/ui/Tooltip'
import { Popover } from '@/ui/Popover'
import { mapDoc } from '../mapdoc'
import { useEditor } from '../store'
import { SELECTED } from '@/ui/iconSize'
import { closeList, openNote, useItems } from './state'

/** The notes of one topic in the order they are shown. */
export function useTopicNotes(topicId: string) {
  const topics = useEditor((s) => s.topics)
  const notes = useEditor((s) => s.notes)
  return useMemo(() => notesOf(topics, notes, topicId), [topics, notes, topicId])
}

/** Adds a note to a topic and opens it. */
export function addNoteAndOpen(topicId: string) {
  const id = addNote(mapDoc, topicId)
  if (id) openNote(id)
}

/** The rows of the notes of a topic (a title, the start of the text, a checklist count, when it was edited). A click opens the note. */
function NoteItems({ topicId, menu }: { topicId: string; menu: boolean }) {
  const entries = useTopicNotes(topicId)
  const role = menu ? 'menuitem' : undefined
  // The note that is open in the popup is highlighted, so the list says which note is being written.
  const active = useItems((s) => (s.popup?.kind === 'note' ? s.popup.id : null))
  return (
    <>
      <ul aria-label="Notes of this topic" className="max-h-[50vh] overflow-y-auto">
        {entries.map((e) => {
          const text = noteText(e.html)
          const progress = checklistProgress(e.html)
          return (
            <li key={e.id}>
              <button
                type="button"
                role={role}
                data-note-row={e.id}
                data-active={active === e.id ? 'true' : undefined}
                aria-current={active === e.id ? 'true' : undefined}
                onClick={() => openNote(e.id)}
                className={`flex w-full items-start gap-2 rounded-ui px-2 py-2 text-left focus-visible:bg-bg [@media(pointer:coarse)]:min-h-11 ${active === e.id ? SELECTED : 'hover:bg-bg'}`}
              >
                <Icon name="notes" size={16} className="mt-0.5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{noteLabel(e)}</span>
                  {text && <span className="line-clamp-2 block text-xs text-muted">{text.slice(0, 140)}</span>}
                  {e.updatedAt !== null && <span className="block text-[11px] text-muted">Edited {timeAgo(e.updatedAt)}</span>}
                </span>
                {progress.total > 0 && (
                  <Tooltip label={`${progress.done} of ${progress.total} done`}>
                    <span role="img" aria-label={`${progress.done} of ${progress.total} done`} data-checklist-progress className={`mt-0.5 shrink-0 rounded-full bg-brand/15 px-1.5 py-0.5 text-[11px] font-semibold text-ink ${progress.done === progress.total ? 'ring-1 ring-brand' : ''}`}>
                      {progress.done}/{progress.total}
                    </span>
                  </Tooltip>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {entries.length === 0 && <p className="px-3 py-3 text-sm text-muted">No notes yet.</p>}
    </>
  )
}

/**
 * The rows of a topic's notes and, under them, a small Add icon: the compact form used in the popover that opens from a topic's notes
 * icon. (The Notes tab of the side panel has its own, wider "Add a note" bar: see NotesTab below.)
 */
export function NoteRows({ topicId, menu = false }: { topicId: string; menu?: boolean }) {
  const readOnly = useEditor((s) => s.readOnly)
  return (
    <div className="w-[min(320px,88vw)]">
      <NoteItems topicId={topicId} menu={menu} />
      {!readOnly && (
        <div className="mt-1 flex items-center justify-end border-t border-line pt-1">
          <IconButton icon="plus" label="Add a note" role={menu ? 'menuitem' : undefined} onClick={() => addNoteAndOpen(topicId)} />
        </div>
      )}
    </div>
  )
}

/**
 * "Add a note" as a full-width bar (a plus icon and the words): the same action as the small icon, for the Notes tab. It is not drawn in
 * Read mode, as the icon was not. At least 44 px high on touch; Enter and Space work (it is a button); the focus ring is drawn inside it.
 */
export function AddNoteBar({ topicId }: { topicId: string }) {
  const readOnly = useEditor((s) => s.readOnly)
  if (readOnly) return null
  return (
    <Tooltip label="Add a note">
      <button
        type="button"
        aria-label="Add a note"
        data-add-note-bar
        onClick={() => addNoteAndOpen(topicId)}
        className="flex w-full shrink-0 items-center justify-center gap-2 border-t border-line bg-surface px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-bg active:bg-line focus-visible:bg-bg focus-visible:outline-offset-[-3px] [@media(pointer:coarse)]:min-h-11"
      >
        <Icon name="plus" size={18} />
        Add a note
      </button>
    </Tooltip>
  )
}

/** The Notes tab body: the list scrolls and the Add a note bar stays at the bottom, always in view. */
export function NotesTab({ topicId }: { topicId: string }) {
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="w-full">
          <NoteItems topicId={topicId} menu={false} />
        </div>
      </div>
      <AddNoteBar topicId={topicId} />
    </>
  )
}

/** The popover that opens from a topic's notes icon. */
export function NoteListPopover() {
  const list = useItems((s) => (s.list?.kind === 'notes' ? s.list : null))
  if (!list) return null
  return (
    <Popover anchor={list.anchor} label="Notes of this topic" onClose={closeList}>
      <NoteRows topicId={list.topicId} menu />
    </Popover>
  )
}
