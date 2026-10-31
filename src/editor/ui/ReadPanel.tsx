import { ancestorIds } from '@/core/model/tree'
import { sanitizeNote, noteText } from '@/core/sanitize'
import { Icon } from '@/ui/icons'
import * as A from '../actions'
import { followLink } from '../content'
import { showNotice } from '../notice'
import { useEditor } from '../store'

/** Everything about the selected topic, to read: its path, notes, tags, link and task. Nothing in it can be changed. */
export function ReadPanel() {
  const selected = useEditor((s) => s.selected)
  const topics = useEditor((s) => s.topics)
  const id = selected[selected.length - 1]
  const topic = id ? topics[id] : undefined

  const close = (
    <button type="button" aria-label="Close the details panel" onClick={() => A.togglePanel()} className="grid h-8 w-8 place-items-center rounded-ui hover:bg-bg">
      <Icon name="close" size={16} />
    </button>
  )

  return (
    <aside aria-label="Topic details (read only)" data-no-wheel className="absolute inset-y-0 right-0 z-30 flex w-[min(340px,100%)] shrink-0 flex-col border-l border-line bg-surface shadow-xl md:static md:z-auto md:w-80 md:shadow-none">
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Icon name="lock" size={14} /> Details
        </h2>
        {close}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3 text-sm">
        {!topic ? (
          <p className="text-muted">Select a topic to read its notes, tags and link.</p>
        ) : (
          <TopicDetails id={topic.id} />
        )}
      </div>
    </aside>
  )
}

function TopicDetails({ id }: { id: string }) {
  const topics = useEditor((s) => s.topics)
  const topic = topics[id]
  if (!topic) return null
  const path = [...ancestorIds(topics, id).reverse().map((a) => topics[a]).filter(Boolean), topic].map((t) => t?.text.trim() || 'Untitled')
  const note = topic.note ? sanitizeNote(topic.note) : ''
  const hasNote = noteText(topic.note) !== ''
  const tags = topic.tags ?? []
  const copy = () => void navigator.clipboard?.writeText(topic.text).then(() => showNotice('Text copied.'))

  return (
    <>
      <nav aria-label="Path" className="text-xs text-muted">
        {path.map((p, i) => (
          <span key={i}>
            {i > 0 && <span aria-hidden="true"> › </span>}
            {p}
          </span>
        ))}
      </nav>
      <div>
        <h3 className="whitespace-pre-wrap break-words text-base font-semibold">{topic.text || 'Untitled'}</h3>
        <button type="button" onClick={copy} className="mt-1 flex items-center gap-1 text-xs text-muted hover:text-ink">
          <Icon name="copy" size={13} /> Copy text
        </button>
      </div>
      {topic.inlineNote?.trim() && <p className="whitespace-pre-wrap italic text-muted">{topic.inlineNote}</p>}
      {topic.task && (
        <p>
          <strong>Task:</strong> {topic.task.done ? 'done' : 'open'}
          {topic.task.dueDate ? `, due ${topic.task.dueDate}` : ''}
          {topic.task.assignee ? `, ${topic.task.assignee}` : ''}
        </p>
      )}
      {tags.length > 0 && (
        <ul aria-label="Tags" className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <li key={t} className="rounded-full border border-line px-2 py-0.5 text-xs">
              {t}
            </li>
          ))}
        </ul>
      )}
      {topic.link && (
        <button type="button" onClick={() => followLink(id)} className="flex items-center gap-1.5 rounded-ui border border-line px-2.5 py-1.5 hover:bg-bg">
          <Icon name="link" size={14} /> Open the link
        </button>
      )}
      {hasNote ? (
        <section aria-label="Notes">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Notes</h4>
          <div className="prose-sm max-w-none break-words [&_a]:text-brand [&_a]:underline [&_li]:ml-4 [&_ol]:list-decimal [&_p]:my-1 [&_ul]:list-disc" dangerouslySetInnerHTML={{ __html: note }} />
        </section>
      ) : (
        !topic.inlineNote?.trim() && !topic.task && tags.length === 0 && !topic.link && <p className="text-muted">This topic has no notes, tags or link.</p>
      )}
    </>
  )
}
