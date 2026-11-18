import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { timeAgo } from '@/app/format'
import { setNote } from '@/core/model/content'
import { deleteNote, noteEntry, noteLabel, patchNote } from '@/core/model/notes'
import { tasksOfNote } from '@/core/model/tasks'
import { noteText } from '@/core/sanitize'
import { IconButton } from '@/ui/IconButton'
import { BRAND_FAB_ICON } from '@/ui/iconSize'
import { ItemPopup, type PopupSize } from '@/ui/ItemPopup'
import { mapDoc } from '../mapdoc'
import { showNotice } from '../notice'
import { useEditor } from '../store'
import { useTopicNotes } from './NoteList'
import { NoteTaskChip, NoteTaskPanel } from './NoteTask'
import { usePanelInset } from './panelInset'
import { RichNoteEditor, type NoteEditorHandle } from './RichNoteEditor'
import { closeNote, closePopup, minimizeNote, onLeave, openNote, toggleList, useItems } from './state'

/** The height (px) kept free at the bottom of the window for the tray of minimized notes: its chips, the gap and the status bar below them. */
export const TRAY_STRIP = 96
const SIZE_KEY = 'wishtaa.noteSize'
const SIZES: PopupSize[] = ['normal', 'wide', 'full']
/** The size the note popup was last left at on this device. */
export function loadNoteSize(): PopupSize {
  try {
    const v = localStorage.getItem(SIZE_KEY)
    return SIZES.includes(v as PopupSize) ? (v as PopupSize) : 'normal'
  } catch {
    return 'normal'
  }
}
/** The size button steps Normal, Wide, Full screen, Normal; its name says what the next press does. */
const NEXT: Record<PopupSize, { to: PopupSize; label: string; icon: 'expand' | 'fullscreen' | 'shrink' }> = {
  normal: { to: 'wide', label: 'Wider', icon: 'expand' },
  wide: { to: 'full', label: 'Full screen', icon: 'fullscreen' },
  full: { to: 'normal', label: 'Narrower', icon: 'shrink' },
}

/**
 * A note in its popup: a title (the first note of a topic has none), the rich-text editor with its icon toolbar, and when it was
 * created and edited. It autosaves; closing it saves what was typed first. A new note that was left completely empty is removed again.
 */
export function NotePopup({ id, minimized = false }: { id: string; minimized?: boolean }) {
  const topics = useEditor((s) => s.topics)
  const notes = useEditor((s) => s.notes)
  const readOnly = useEditor((s) => s.readOnly)
  const entry = useMemo(() => noteEntry(topics, notes, id), [topics, notes, id])
  const handle = useRef<NoteEditorHandle | null>(null)
  const titleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [title, setTitle] = useState(entry?.title ?? '')
  const titleRef = useRef(title)
  titleRef.current = title
  const tasks = useEditor((s) => s.tasks)
  const [taskPanel, setTaskPanel] = useState(false)
  const linked = useMemo(() => tasksOfNote(tasks, id), [tasks, id])
  const task = linked[0] ?? null
  const gone = !entry
  const [size, setSizeState] = useState<PopupSize>(loadNoteSize)
  const next = NEXT[size]
  const setSize = (v: PopupSize) => {
    setSizeState(v)
    try {
      localStorage.setItem(SIZE_KEY, v)
    } catch {
      // Storage blocked: the size still works until the popup is closed.
    }
  }

  // The note was removed (undo, another device): say so and close.
  useEffect(() => {
    if (gone) {
      showNotice('That note is no longer there.')
      closeNote(id, false)
    }
  }, [gone, id])

  // Restored from the tray: the text is put back at its scroll position and the cursor is where it was left (a hidden popup loses both).
  const wasMinimized = useRef(minimized)
  useLayoutEffect(() => {
    if (wasMinimized.current && !minimized) handle.current?.restore()
    wasMinimized.current = minimized
  }, [minimized])
  // While the tray has notes in it the popup leaves its strip at the bottom free (the tray is drawn there, on the map, not under a dim layer).
  const trayShown = useItems((s) => s.minimized.length > 0)

  // The title changed from outside while it is not being typed.
  useEffect(() => {
    if (entry && !titleTimer.current) setTitle(entry.title)
  }, [entry?.title]) // eslint-disable-line react-hooks/exhaustive-deps

  // Where this note stands among the notes of its topic ("Note 2 of 5"), for Previous and Next.
  const siblings = useTopicNotes(entry?.topicId ?? '')
  const at = siblings.findIndex((e) => e.id === id)
  // The side panel (with the Notes list) beside the popup: the popup stays off it. Without room for it (a phone) the header gets a list icon.
  const inset = usePanelInset()
  // Leaving this popup for another note (the side list, Previous or Next): what was typed is saved first, at once.
  const leave = useRef<() => void>(() => undefined)
  useEffect(() => onLeave(id, () => leave.current()), [id])

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
  /** Saves what was typed and removes a new note that was left completely empty (never one with text, a title or a task). */
  const settle = () => {
    writeTitle()
    handle.current?.flush()
    const now = noteEntry(useEditor.getState().topics, useEditor.getState().notes, entry.id)
    if (now && !readOnly && !now.legacy && !now.title.trim() && !noteText(now.html) && !tasksOfNote(useEditor.getState().tasks, now.id).length) deleteNote(mapDoc, now.id)
  }
  leave.current = settle
  /** What was typed is written now (a minimized note keeps autosaving anyway; this only makes the saved copy current at once). */
  const settleTyping = () => {
    writeTitle()
    handle.current?.flush()
  }
  const close = () => {
    settle()
    closePopup()
  }
  const prev = at > 0 ? siblings[at - 1] : undefined
  const nextNote = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined
  const remove = () => {
    writeTitle()
    handle.current?.flush()
    deleteNote(mapDoc, entry.id)
    closePopup()
    showNotice(task ? 'Note deleted. Its task is kept.' : 'Note deleted.', 8000, { label: 'Undo', run: () => mapDoc.undo.undo() })
  }

  return (
    <ItemPopup
      label={entry.legacy ? 'Note' : `Note: ${entry.title || 'untitled'}`}
      onClose={close}
      size={size}
      inset={inset}
      bottomInset={trayShown ? TRAY_STRIP : 0}
      minimized={minimized}
      onMinimize={() => {
        settleTyping()
        minimizeNote(id)
      }}
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
          <div data-note-position className="truncate px-1 text-xs text-muted">
            {at >= 0 ? `Note ${at + 1} of ${siblings.length} · ` : ''}Topic: {topicText}
          </div>
        </div>
      }
      actions={
        <>
          {siblings.length > 1 && (
            <>
              <IconButton icon="chevronLeft" label="Previous note" disabled={!prev} onClick={() => prev && openNote(prev.id)} className="[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11" />
              <IconButton icon="chevronRight" label="Next note" disabled={!nextNote} onClick={() => nextNote && openNote(nextNote.id)} className="[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11" />
            </>
          )}
          {/* No room for the side panel beside the popup (a phone): the list of this topic's notes opens from here, on top. */}
          {inset === 0 && <IconButton icon="notes" label="Notes of this topic" aria-haspopup="menu" data-notes-list-button onClick={(e) => toggleList('notes', entry.topicId, e.currentTarget)} className="[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11" />}
          <IconButton icon="minus" label="Minimize" keys="F8" data-note-minimize onClick={() => { settleTyping(); minimizeNote(id) }} className="[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11" />
          {/* On a phone the popup is always a full sheet, so the size button is not shown there. */}
          <IconButton icon={next.icon} label={next.label} data-note-size-button={size} onClick={() => setSize(next.to)} className="max-sm:hidden [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11" />
          {!readOnly && <IconButton icon="trash" label="Delete this note" onClick={remove} className="text-bad [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11" />}
        </>
      }
    >
      <RichNoteEditor
        html={entry.html}
        onSave={save}
        label="Note text"
        readOnly={readOnly}
        autoFocus={!readOnly}
        handle={handle}
        belowToolbar={task ? <NoteTaskChip task={task} extra={linked.length - 1} readOnly={readOnly} onOpen={() => setTaskPanel((o) => !o)} /> : undefined}
        floating={
          <>
            {!readOnly && (
              <IconButton
                icon="task"
                label={task ? 'Edit task details' : 'Add task details'}
                data-note-task-button
                aria-expanded={taskPanel}
                selected={taskPanel}
                onClick={() => setTaskPanel((o) => !o)}
                className={`absolute bottom-3 left-3 z-10 h-11 w-11 rounded-full ${BRAND_FAB_ICON}`}
              />
            )}
            {taskPanel && (!readOnly || task) && (
              <NoteTaskPanel
                key={task?.id ?? 'new'}
                task={task}
                noteId={entry.id}
                topicId={entry.topicId}
                defaultTitle={noteLabel(entry) === 'Note' ? '' : noteLabel(entry)}
                readOnly={readOnly}
                onClose={() => setTaskPanel(false)}
                onCreated={() => setTaskPanel(false)}
              />
            )}
          </>
        }
      />
      <div className="shrink-0 border-t border-line px-3 py-1.5 text-xs text-muted">
        {entry.createdAt !== null && entry.updatedAt !== null ? `Created ${timeAgo(entry.createdAt)} · Edited ${timeAgo(entry.updatedAt)}` : 'The first note of this topic'}
      </div>
    </ItemPopup>
  )
}
