import { useEffect, useRef } from 'react'
import { EditorContent, useEditor as useTiptap } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { setNote } from '@/core/model/content'
import { sanitizeNote } from '@/core/sanitize'
import { Icon, type IconName } from '@/ui/icons'
import { mapDoc } from '../mapdoc'
import { useEditor } from '../store'

function Tool({ icon, label, active, onClick, disabled }: { icon: IconName; label: string; active?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the text selection in the editor while a toolbar button is used.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-ui border transition-colors disabled:opacity-40 ${active ? 'border-brand bg-brand/15' : 'border-transparent hover:bg-bg'}`}
    >
      <Icon name={icon} size={16} />
    </button>
  )
}

/** Rich-text note for the selected topic (headings, lists, bold, italic, links, quotes, code). Saved as cleaned HTML. */
export default function NotesPanel() {
  const selected = useEditor((s) => s.selected)
  const id = selected[selected.length - 1]
  const stored = useEditor((s) => (id ? (s.topics[id]?.note ?? '') : ''))
  const title = useEditor((s) => (id ? s.topics[id]?.text : ''))
  const saved = useRef(stored)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const topicRef = useRef<string | undefined>(id)
  topicRef.current = id

  const editor = useTiptap({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'], HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } } }),
      Placeholder.configure({ placeholder: 'Write a note for this topic…' }),
    ],
    content: stored,
    editorProps: { attributes: { 'aria-label': 'Topic note', class: 'note-editor min-h-40 px-3 py-2 text-sm outline-none' } },
    onUpdate: ({ editor: ed }) => {
      const topic = topicRef.current
      if (!topic) return
      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        const html = ed.isEmpty ? '' : sanitizeNote(ed.getHTML())
        saved.current = html
        setNote(mapDoc, topic, html)
      }, 500)
    },
  })

  // Switching topics, or the note changing elsewhere (undo): load it into the editor.
  useEffect(() => {
    if (!editor) return
    clearTimeout(timer.current)
    if (stored !== saved.current || editor.getHTML() !== stored) {
      saved.current = stored
      editor.commands.setContent(stored, { emitUpdate: false })
    }
  }, [id, stored, editor])

  // Make sure the last keystrokes are saved when leaving the panel.
  useEffect(
    () => () => {
      if (timer.current && editor && topicRef.current) {
        clearTimeout(timer.current)
        const html = editor.isEmpty ? '' : sanitizeNote(editor.getHTML())
        if (html !== saved.current) setNote(mapDoc, topicRef.current, html)
      }
    },
    [editor]
  )

  if (!id) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted">
        <Icon name="notes" size={28} />
        Select a topic to write a note for it.
      </div>
    )
  }

  const setLink = () => {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Web address', prev ?? 'https://')
    if (url === null) return
    if (url.trim() === '') editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else if (/^(https?:\/\/|mailto:)/i.test(url.trim())) editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }
  const c = () => editor?.chain().focus()

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-sm">
        <Icon name="notes" size={16} />
        <span className="min-w-0 flex-1 truncate font-medium">{title || 'Untitled topic'}</span>
      </div>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-2 py-1" role="toolbar" aria-label="Note formatting">
        <Tool icon="bold" label="Bold" active={editor?.isActive('bold')} onClick={() => c()?.toggleBold().run()} />
        <Tool icon="italic" label="Italic" active={editor?.isActive('italic')} onClick={() => c()?.toggleItalic().run()} />
        <Tool icon="underline" label="Underline" active={editor?.isActive('underline')} onClick={() => c()?.toggleUnderline().run()} />
        <Tool icon="strike" label="Strikethrough" active={editor?.isActive('strike')} onClick={() => c()?.toggleStrike().run()} />
        <span className="mx-1 h-5 w-px bg-line" />
        <Tool icon="h1" label="Heading 1" active={editor?.isActive('heading', { level: 1 })} onClick={() => c()?.toggleHeading({ level: 1 }).run()} />
        <Tool icon="h2" label="Heading 2" active={editor?.isActive('heading', { level: 2 })} onClick={() => c()?.toggleHeading({ level: 2 }).run()} />
        <Tool icon="bulletList" label="Bulleted list" active={editor?.isActive('bulletList')} onClick={() => c()?.toggleBulletList().run()} />
        <Tool icon="orderedList" label="Numbered list" active={editor?.isActive('orderedList')} onClick={() => c()?.toggleOrderedList().run()} />
        <Tool icon="quote" label="Quote" active={editor?.isActive('blockquote')} onClick={() => c()?.toggleBlockquote().run()} />
        <Tool icon="code" label="Code" active={editor?.isActive('code')} onClick={() => c()?.toggleCode().run()} />
        <span className="mx-1 h-5 w-px bg-line" />
        <Tool icon="link" label="Link" active={editor?.isActive('link')} onClick={setLink} />
        <Tool icon="unlink" label="Remove link" disabled={!editor?.isActive('link')} onClick={() => c()?.unsetLink().run()} />
        <span className="mx-1 h-5 w-px bg-line" />
        <Tool icon="undo" label="Undo typing" disabled={!editor?.can().undo()} onClick={() => c()?.undo().run()} />
        <Tool icon="redo" label="Redo typing" disabled={!editor?.can().redo()} onClick={() => c()?.redo().run()} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
