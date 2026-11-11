import { NoteListPopover } from './NoteList'

/** Where the small lists and popups of notes and tasks are drawn (one place, mounted once in the editor). */
export function ItemsHost() {
  return (
    <>
      <NoteListPopover />
    </>
  )
}
