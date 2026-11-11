import { useEffect, useRef, type MutableRefObject } from 'react'
import { EditorContent, useEditor as useTiptap, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { sanitizeNote } from '@/core/sanitize'
import type { IconName } from '@/ui/icons'
import { IconTile } from '@/ui/IconButton'

export interface NoteEditorHandle {
  /** Writes what has been typed so far, now (before the popup closes). */
  flush: () => void
}

/** One toolbar button: an icon with the shared tooltip, chosen = highlighted. The text selection stays in the editor while it is used. */
function Tool({ icon, label, active, onClick, disabled, toggle = true }: { icon: IconName; label: string; active?: boolean; onClick: () => void; disabled?: boolean; toggle?: boolean }) {
  return (
    <IconTile
      icon={icon}
      label={label}
      selected={!!active}
      disabled={disabled}
      aria-pressed={toggle ? !!active : undefined}
      size={18}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    />
  )
}

const sep = <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />

/** The formatting icons: bold, italic, underline, strikethrough, headings, lists, quote, code, link, undo and redo. Every one has a name (tooltip, aria-label). */
export function NoteToolbar({ editor }: { editor: Editor | null }) {
  const c = () => editor?.chain().focus()
  const setLink = () => {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Web address', prev ?? 'https://')
    if (url === null) return
    if (url.trim() === '') editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else if (/^(https?:\/\/|mailto:)/i.test(url.trim())) editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-2 py-1" role="toolbar" aria-label="Note formatting">
      <Tool icon="bold" label="Bold" active={editor?.isActive('bold')} onClick={() => c()?.toggleBold().run()} />
      <Tool icon="italic" label="Italic" active={editor?.isActive('italic')} onClick={() => c()?.toggleItalic().run()} />
      <Tool icon="underline" label="Underline" active={editor?.isActive('underline')} onClick={() => c()?.toggleUnderline().run()} />
      <Tool icon="strike" label="Strikethrough" active={editor?.isActive('strike')} onClick={() => c()?.toggleStrike().run()} />
      {sep}
      <Tool icon="h1" label="Heading 1" active={editor?.isActive('heading', { level: 1 })} onClick={() => c()?.toggleHeading({ level: 1 }).run()} />
      <Tool icon="h2" label="Heading 2" active={editor?.isActive('heading', { level: 2 })} onClick={() => c()?.toggleHeading({ level: 2 }).run()} />
      <Tool icon="bulletList" label="Bulleted list" active={editor?.isActive('bulletList')} onClick={() => c()?.toggleBulletList().run()} />
      <Tool icon="orderedList" label="Numbered list" active={editor?.isActive('orderedList')} onClick={() => c()?.toggleOrderedList().run()} />
      <Tool icon="quote" label="Quote" active={editor?.isActive('blockquote')} onClick={() => c()?.toggleBlockquote().run()} />
      <Tool icon="code" label="Code" active={editor?.isActive('code')} onClick={() => c()?.toggleCode().run()} />
      {sep}
      <Tool icon="link" label="Link" active={editor?.isActive('link')} onClick={setLink} />
      <Tool icon="unlink" label="Remove link" toggle={false} disabled={!editor?.isActive('link')} onClick={() => c()?.unsetLink().run()} />
      {sep}
      <Tool icon="undo" label="Undo typing" toggle={false} disabled={!editor?.can().undo()} onClick={() => c()?.undo().run()} />
      <Tool icon="redo" label="Redo typing" toggle={false} disabled={!editor?.can().redo()} onClick={() => c()?.redo().run()} />
    </div>
  )
}

/**
 * The rich-text note editor (TipTap) with its icon toolbar: the same one wherever a note is written. `html` is what is stored; `onSave`
 * gets the cleaned HTML 500 ms after typing stops (and at once on `handle.flush()` and when the editor goes away), and is told nothing
 * when the text did not change. The editor follows `html` when it changes from outside (undo, another device) without losing typing.
 * With `readOnly` there is no toolbar and nothing is saved.
 */
export function RichNoteEditor({ html, onSave, label, placeholder = 'Write a note…', readOnly = false, autoFocus = false, handle }: { html: string; onSave: (html: string) => void; label: string; placeholder?: string; readOnly?: boolean; autoFocus?: boolean; handle?: MutableRefObject<NoteEditorHandle | null> }) {
  const saved = useRef(html)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const save = useRef(onSave)
  save.current = onSave

  const editor = useTiptap({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'], HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } } }),
      Placeholder.configure({ placeholder }),
    ],
    content: html,
    editable: !readOnly,
    autofocus: autoFocus ? 'end' : false,
    editorProps: { attributes: { 'aria-label': label, class: 'note-editor min-h-40 px-3 py-2 text-sm outline-none' } },
    onUpdate: ({ editor: ed }) => {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => write(ed), 500)
    },
  })

  function write(ed: Editor) {
    clearTimeout(timer.current)
    timer.current = undefined
    const next = ed.isEmpty ? '' : sanitizeNote(ed.getHTML())
    if (next === saved.current) return
    saved.current = next
    save.current(next)
  }

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!readOnly)
  }, [editor, readOnly])

  // The stored text changed from outside (undo, another device): load it, unless typing is waiting to be saved.
  useEffect(() => {
    if (!editor || timer.current) return
    if (html !== saved.current || editor.getHTML() !== html) {
      if (html === saved.current && (editor.isEmpty ? '' : sanitizeNote(editor.getHTML())) === html) return
      saved.current = html
      editor.commands.setContent(html, { emitUpdate: false })
    }
  }, [html, editor])

  useEffect(() => {
    if (!handle) return
    handle.current = { flush: () => editor && !readOnly && write(editor) }
    return () => {
      handle.current = null
    }
  }, [editor, readOnly, handle])

  // Whatever was typed is saved when the editor goes away.
  useEffect(
    () => () => {
      if (timer.current && editor && !readOnly) write(editor)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!readOnly && <NoteToolbar editor={editor} />}
      <div className="min-h-0 flex-1 overflow-y-auto" data-note-body>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
