import { NoteListPopover } from './NoteList'
import { NotePopup } from './NotePopup'
import { TaskListPopover } from './TaskList'
import { TaskPopup } from './TaskPopup'
import { useItems } from './state'

/** Where the small lists and popups of notes and tasks are drawn (one place, mounted once in the editor). */
export function ItemsHost() {
  const popup = useItems((s) => s.popup)
  return (
    <>
      <NoteListPopover />
      <TaskListPopover />
      {popup?.kind === 'note' && <NotePopup key={popup.id} id={popup.id} />}
      {popup?.kind === 'task' && <TaskPopup key={popup.id} id={popup.id} />}
    </>
  )
}
