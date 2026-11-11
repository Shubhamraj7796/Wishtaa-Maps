import { NoteListPopover } from './NoteList'
import { NotePopup } from './NotePopup'
import { useItems } from './state'

/** Where the small lists and popups of notes and tasks are drawn (one place, mounted once in the editor). */
export function ItemsHost() {
  const popup = useItems((s) => s.popup)
  return (
    <>
      <NoteListPopover />
      {popup?.kind === 'note' && <NotePopup key={popup.id} id={popup.id} />}
    </>
  )
}
