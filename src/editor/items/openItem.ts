import { noteEntry } from '@/core/model/notes'
import type { TaskEntry } from '@/core/model/tasks'
import { noteText } from '@/core/sanitize'
import { useEditor } from '../store'
import { openNote, openTask } from './state'

/**
 * Opens a task wherever it is listed (the Task view, a topic's task list, the details panel). A task that belongs to a note opens that
 * note (its details are on the note); a task with no note, or whose note is gone (a topic's first note counts only when it has text),
 * opens its own popup.
 */
export function openTaskEntry(e: Pick<TaskEntry, 'id' | 'noteId'>) {
  const { topics, notes } = useEditor.getState()
  const n = e.noteId ? noteEntry(topics, notes, e.noteId) : null
  if (n && (!n.legacy || noteText(n.html))) openNote(n.id)
  else openTask(e.id)
}
