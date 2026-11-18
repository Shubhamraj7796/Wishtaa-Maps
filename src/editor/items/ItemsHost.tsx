import { useEffect } from 'react'
import { NoteListPopover } from './NoteList'
import { NotePopup } from './NotePopup'
import { TaskListPopover } from './TaskList'
import { TaskPopup } from './TaskPopup'
import { openTab } from '../content'
import { useEditor } from '../store'
import { useItems } from './state'

/** Where the small lists and popups of notes and tasks are drawn (one place, mounted once in the editor). */
export function ItemsHost() {
  const popup = useItems((s) => s.popup)
  const noteOpen = popup?.kind === 'note'
  // A note opened at 768 px or wider also opens the side panel on its Notes tab, so the list is beside the popup (it is not opened again
  // if it is closed while the note is open; the next note that opens does it again). Read mode has no Notes tab: nothing to open.
  useEffect(() => {
    if (!noteOpen) return
    const wide = window.matchMedia?.('(min-width: 768px)').matches ?? false
    const s = useEditor.getState()
    if (wide && !s.readOnly && !(s.panelOpen && s.panelTab === 'notes')) openTab('notes')
  }, [noteOpen])
  return (
    <>
      <NoteListPopover />
      <TaskListPopover />
      {popup?.kind === 'note' && <NotePopup key={popup.id} id={popup.id} />}
      {popup?.kind === 'task' && <TaskPopup key={popup.id} id={popup.id} />}
    </>
  )
}
