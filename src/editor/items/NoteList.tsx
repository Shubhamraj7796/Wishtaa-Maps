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

/**
 * The rows of a topic's notes (a title, the start of the text, when it was edited) and an Add icon. Used in a popover on the map and
 * the Outline and in the Notes tab of the side panel. Clicking a row opens the note in its popup.
 */
export function NoteRows({ topicId, menu = false }: { topicId: string; menu?: boolean }) {
  const entries = useTopicNotes(topicId)
  const readOnly = useEditor((s) => s.readOnly)
  const role = menu ? 'menuitem' : undefined
  return (
    <div className="w-[min(320px,88vw)]">
      <ul aria-label="Notes of this topic" className="max-h-[50vh] overflow-y-auto">
        {entries.map((e) => {
          const text = noteText(e.html)
          const progress = checklistProgress(e.html)
          return (
            <li key={e.id}>
              <button type="button" role={role} data-note-row={e.id} onClick={() => openNote(e.id)} className="flex w-full items-start gap-2 rounded-ui px-2 py-2 text-left hover:bg-bg focus-visible:bg-bg [@media(pointer:coarse)]:min-h-11">
                <Icon name="notes" size={16} className="mt-0.5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{noteLabel(e)}</span>
                  {text && <span className="line-clamp-2 block text-xs text-muted">{text.slice(0, 140)}</span>}
                  {e.updatedAt !== null && <span className="block text-[11px] text-muted">Edited {timeAgo(e.updatedAt)}</span>}
                </span>
                {progress.total > 0 && (
                  <Tooltip label={`${progress.done} of ${progress.total} done`}>
                    <span role="img" aria-label={`${progress.done} of ${progress.total} done`} data-checklist-progress className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold bg-brand/15 text-ink ${progress.done === progress.total ? 'ring-1 ring-brand' : ''}`}>
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
      {!readOnly && (
        <div className="mt-1 flex items-center justify-end border-t border-line pt-1">
          <IconButton icon="plus" label="Add a note" role={menu ? 'menuitem' : undefined} onClick={() => addNoteAndOpen(topicId)} />
        </div>
      )}
    </div>
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
