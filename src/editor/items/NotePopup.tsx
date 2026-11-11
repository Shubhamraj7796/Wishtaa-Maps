import { useEffect, useMemo, useRef, useState } from 'react'
import { timeAgo } from '@/app/format'
import { setNote } from '@/core/model/content'
import { deleteNote, noteEntry, patchNote } from '@/core/model/notes'
import { noteText } from '@/core/sanitize'
import { IconButton } from '@/ui/IconButton'
import { ItemPopup } from '@/ui/ItemPopup'
import { mapDoc } from '../mapdoc'
import { showNotice } from '../notice'
import { useEditor } from '../store'
import { RichNoteEditor, type NoteEditorHandle } from './RichNoteEditor'
import { closePopup } from './state'

/**
 * A note in its popup: a title (the first note of a topic has none), the rich-text editor with its icon toolbar, and when it was
 * created and edited. It autosaves; closing it saves what was typed first. A new note that was left completely empty is removed again.
 */
export function NotePopup({ id }: { id: string }) {
  const topics = useEditor((s) => s.topics)
  const notes = useEditor((s) => s.notes)
  const readOnly = useEditor((s) => s.readOnly)
  const entry = useMemo(() => noteEntry(topics, notes, id), [topics, notes, id])
  const handle = useRef<NoteEditorHandle | null>(null)
  const titleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [title, setTitle] = useState(entry?.title ?? '')
  const titleRef = useRef(title)
  titleRef.current = title
  const gone = !entry

  // The note was removed (undo, another device): say so and close.
  useEffect(() => {
    if (gone) {
      showNotice('That note is no longer there.')
      closePopup()
    }
  }, [gone])

  // The title changed from outside while it is not being typed.
  useEffect(() => {
    if (entry && !titleTimer.current) setTitle(entry.title)
  }, [entry?.title]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!entry) return null
  const topicText = topics[entry.topicId]?.text.trim() || 'Untitled topic'

  const writeTitle = () => {
    clearTimeout(titleTimer.current)
    titleTimer.current = undefined
    if (!entry.legacy && !readOnly) patchNote(mapDoc, entry.id, { title: titleRef.current })
  }
  const save = (html: string) => {
    if (readOnly) return
    if (entry.legacy) setNote(mapDoc, entry.topicId, html)
    else patchNote(mapDoc, entry.id, { html })
  }
  const close = () => {
    writeTitle()
    handle.current?.flush()
    const now = noteEntry(useEditor.getState().topics, useEditor.getState().notes, entry.id)
    // A new note that was left completely empty is not kept.
    if (now && !readOnly && !now.legacy && !now.title.trim() && !noteText(now.html)) deleteNote(mapDoc, now.id)
    closePopup()
  }
  const remove = () => {
    writeTitle()
    handle.current?.flush()
    deleteNote(mapDoc, entry.id)
    closePopup()
    showNotice('Note deleted.', 8000, { label: 'Undo', run: () => mapDoc.undo.undo() })
  }

  return (
    <ItemPopup
      label={entry.legacy ? 'Note' : `Note: ${entry.title || 'untitled'}`}
      onClose={close}
      header={
        <div className="min-w-0">
          {entry.legacy ? (
            <div className="truncate px-1 text-sm font-medium">First note of this topic</div>
          ) : (
            <input
              aria-label="Note title"
              value={title}
              readOnly={readOnly}
              maxLength={80}
              placeholder="Title (optional)"
              onChange={(e) => {
                setTitle(e.target.value)
                clearTimeout(titleTimer.current)
                titleTimer.current = setTimeout(writeTitle, 500)
              }}
              className="w-full rounded-ui bg-transparent px-1 py-1 text-sm font-medium outline-none placeholder:font-normal placeholder:text-muted focus:bg-bg"
            />
          )}
          <div className="truncate px-1 text-xs text-muted">Topic: {topicText}</div>
        </div>
      }
      actions={!readOnly ? <IconButton icon="trash" label="Delete this note" onClick={remove} className="text-bad [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11" /> : undefined}
    >
      <RichNoteEditor html={entry.html} onSave={save} label="Note text" readOnly={readOnly} autoFocus={!readOnly} handle={handle} />
      <div className="shrink-0 border-t border-line px-3 py-1.5 text-xs text-muted">
        {entry.createdAt !== null && entry.updatedAt !== null ? `Created ${timeAgo(entry.createdAt)} · Edited ${timeAgo(entry.updatedAt)}` : 'The first note of this topic'}
      </div>
    </ItemPopup>
  )
}
