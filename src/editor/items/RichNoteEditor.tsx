import { Fragment, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { EditorContent, useEditor as useTiptap, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { sanitizeNote } from '@/core/sanitize'
import { Icon, type IconName } from '@/ui/icons'
import { IconButton, IconTile } from '@/ui/IconButton'
import { SELECTED, UNSELECTED } from '@/ui/iconSize'
import { Popover } from '@/ui/Popover'

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

interface ToolDef {
  icon: IconName
  label: string
  active?: boolean
  toggle?: boolean
  disabled?: boolean
  run: () => void
  /** A divider is drawn before the first tool of each group. */
  group: number
}

/** About how wide one toolbar icon is (36 px box and the gap), and how much a divider and the padding take. */
const TOOL_PX = 38
const SEP_PX = 9
const PAD_PX = 16

/**
 * How many of `count` tools (in `groups` groups) fit in a toolbar `width` px wide. All of them when they fit or when the width is not
 * known; otherwise as many as fit beside the "More" icon, never fewer than two. The rest go into the More menu, so the bar never wraps.
 */
export function visibleTools(width: number, count: number, groups: number): number {
  if (!width || width - PAD_PX >= count * TOOL_PX + (groups - 1) * SEP_PX) return count
  return Math.max(2, Math.min(count - 1, Math.floor((width - PAD_PX - TOOL_PX) / TOOL_PX)))
}

/** The formatting icons: bold, italic, underline, strikethrough, headings, lists, quote, code, link, undo and redo. Every one has a name (tooltip, aria-label). */
export function NoteToolbar({ editor }: { editor: Editor | null }) {
  const bar = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [more, setMore] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const el = bar.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setWidth(Math.round(el.getBoundingClientRect().width)))
    ro.observe(el)
    setWidth(Math.round(el.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])
  const c = () => editor?.chain().focus()
  const setLink = () => {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Web address', prev ?? 'https://')
    if (url === null) return
    if (url.trim() === '') editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else if (/^(https?:\/\/|mailto:)/i.test(url.trim())) editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }
  const tools: ToolDef[] = [
    { group: 0, icon: 'bold', label: 'Bold', active: editor?.isActive('bold'), run: () => c()?.toggleBold().run() },
    { group: 0, icon: 'italic', label: 'Italic', active: editor?.isActive('italic'), run: () => c()?.toggleItalic().run() },
    { group: 0, icon: 'underline', label: 'Underline', active: editor?.isActive('underline'), run: () => c()?.toggleUnderline().run() },
    { group: 0, icon: 'strike', label: 'Strikethrough', active: editor?.isActive('strike'), run: () => c()?.toggleStrike().run() },
    { group: 1, icon: 'h1', label: 'Heading 1', active: editor?.isActive('heading', { level: 1 }), run: () => c()?.toggleHeading({ level: 1 }).run() },
    { group: 1, icon: 'h2', label: 'Heading 2', active: editor?.isActive('heading', { level: 2 }), run: () => c()?.toggleHeading({ level: 2 }).run() },
    { group: 1, icon: 'bulletList', label: 'Bulleted list', active: editor?.isActive('bulletList'), run: () => c()?.toggleBulletList().run() },
    { group: 1, icon: 'orderedList', label: 'Numbered list', active: editor?.isActive('orderedList'), run: () => c()?.toggleOrderedList().run() },
    { group: 1, icon: 'quote', label: 'Quote', active: editor?.isActive('blockquote'), run: () => c()?.toggleBlockquote().run() },
    { group: 1, icon: 'code', label: 'Code', active: editor?.isActive('code'), run: () => c()?.toggleCode().run() },
    { group: 2, icon: 'link', label: 'Link', active: editor?.isActive('link'), run: setLink },
    { group: 2, icon: 'unlink', label: 'Remove link', toggle: false, disabled: !editor?.isActive('link'), run: () => c()?.unsetLink().run() },
    { group: 3, icon: 'undo', label: 'Undo typing', toggle: false, disabled: !editor?.can().undo(), run: () => c()?.undo().run() },
    { group: 3, icon: 'redo', label: 'Redo typing', toggle: false, disabled: !editor?.can().redo(), run: () => c()?.redo().run() },
  ]
  const n = visibleTools(width, tools.length, 4)
  const shown = tools.slice(0, n)
  const hidden = tools.slice(n)
  return (
    <div ref={bar} className="flex flex-nowrap items-center gap-0.5 overflow-hidden border-b border-line px-2 py-1" role="toolbar" aria-label="Note formatting" data-note-toolbar data-tools-hidden={hidden.length}>
      {shown.map((t, i) => (
        <Fragment key={t.label}>
          {i > 0 && shown[i - 1]?.group !== t.group && sep}
          <Tool icon={t.icon} label={t.label} active={t.active} toggle={t.toggle} disabled={t.disabled} onClick={t.run} />
        </Fragment>
      ))}
      {hidden.length > 0 && (
        <>
          {sep}
          <IconButton icon="more" label="More formatting" aria-haspopup="menu" aria-expanded={!!more} selected={!!more} onMouseDown={(e) => e.preventDefault()} onClick={(e) => setMore(more ? null : e.currentTarget)} />
          {more && (
            <Popover anchor={more} onClose={() => setMore(null)} label="More formatting" className="w-48 p-1">
              {hidden.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  role="menuitem"
                  disabled={t.disabled}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    t.run()
                    setMore(null)
                  }}
                  className={`flex w-full items-center gap-2 rounded-ui px-2 py-1.5 text-left text-sm disabled:opacity-40 [@media(pointer:coarse)]:min-h-11 ${t.active ? SELECTED : UNSELECTED}`}
                >
                  <Icon name={t.icon} size={18} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{t.label}</span>
                </button>
              ))}
            </Popover>
          )}
        </>
      )}
    </div>
  )
}

/**
 * The rich-text note editor (TipTap) with its icon toolbar: the same one wherever a note is written. `html` is what is stored; `onSave`
 * gets the cleaned HTML 500 ms after typing stops (and at once on `handle.flush()` and when the editor goes away), and is told nothing
 * when the text did not change. The editor follows `html` when it changes from outside (undo, another device) without losing typing.
 * With `readOnly` there is no toolbar and nothing is saved.
 */
export function RichNoteEditor({ html, onSave, label, placeholder = 'Write a note…', readOnly = false, autoFocus = false, handle, belowToolbar, floating }: { html: string; onSave: (html: string) => void; label: string; placeholder?: string; readOnly?: boolean; autoFocus?: boolean; handle?: MutableRefObject<NoteEditorHandle | null>; belowToolbar?: ReactNode; floating?: ReactNode }) {
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
    if (ed.isDestroyed) return // a late timer after the editor went away
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
      {belowToolbar}
      {/* `floating` (a button over the lower-left corner of the writing area) is outside the scrolling part, so it stays put; the text keeps room under it. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className={`min-h-0 flex-1 overflow-y-auto ${floating ? 'pb-20' : ''}`} data-note-body>
          <EditorContent editor={editor} />
        </div>
        {floating}
      </div>
    </div>
  )
}
