import { Icon } from '@/ui/icons'
import { NoteRows } from '../items/NoteList'
import { useEditor } from '../store'

/**
 * The Notes tab of the side panel: the notes of the selected topic as a list (a click opens a note in its popup, the plus icon adds a
 * new one). Writing happens in the popup, so there is one editor for a note wherever it is opened from.
 */
export default function NotesPanel() {
  const selected = useEditor((s) => s.selected)
  const id = selected[selected.length - 1]
  const title = useEditor((s) => (id ? s.topics[id]?.text : ''))
  if (!id) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted">
        <Icon name="notes" size={28} />
        Select a topic to see its notes.
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-sm">
        <Icon name="notes" size={16} />
        <span className="min-w-0 flex-1 truncate font-medium">{title || 'Untitled topic'}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <NoteRows topicId={id} />
      </div>
    </div>
  )
}
