import { useMemo, useState } from 'react'
import type { PdfHandle } from '@/core/pdf/engine'
import { editKey, type MarkupKind, type MarkupObject, type PdfSource } from '@/core/pdf/types'
import { Icon } from '@/ui/icons'
import { useEditor } from '../store'
import { showSource } from './actions'
import { boundsOf, deleteMarkup, markupByPage, selectMarkup, sendHighlightsToOutline, topicFromMarkup, updateMarkup, wordsOf } from './markup'
import { PALETTE } from './toolPrefs'

const KIND_NAME: Record<MarkupKind, string> = { highlight: 'Highlight', underline: 'Underline', strike: 'Strikethrough', pen: 'Pen drawing', text: 'Text box', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow', whiteout: 'Whiteout', link: 'Link' }

const tap = 'grid h-9 min-w-9 shrink-0 place-items-center rounded-ui px-1.5 text-sm hover:bg-bg disabled:opacity-40 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-11'

/** What can be done to the markup that was clicked: its colour, a note, a topic from it, delete. */
export function SelectedMarkup() {
  const id = useEditor((s) => s.pdfPanel.markId)
  const m = useEditor((s) => (id ? s.pdf.markup[id] : undefined))
  const [noting, setNoting] = useState(false)
  const [note, setNote] = useState('')
  if (!id || !m) return null
  return (
    <div className="absolute inset-x-2 top-2 z-20 flex flex-wrap items-center gap-1 rounded-ui border border-line bg-surface px-2 py-1 text-xs shadow-lg" role="group" aria-label={`${KIND_NAME[m.kind]} selected`} data-selected-markup>
      <span className="font-medium">{KIND_NAME[m.kind]}</span>
      {m.kind !== 'whiteout' && m.kind !== 'link' && (
        <div role="radiogroup" aria-label="Change colour" className="flex items-center">
          {PALETTE.slice(0, 9).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={m.color.toLowerCase() === c} aria-label={`Colour ${c}`} onClick={() => updateMarkup(id, { color: c })} className="grid h-8 w-7 place-items-center [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-9">
              <span className={`h-4 w-4 rounded-full border ${m.color.toLowerCase() === c ? 'border-ink ring-2 ring-brand' : 'border-line'}`} style={{ background: c }} />
            </button>
          ))}
        </div>
      )}
      {noting ? (
        <>
          <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (updateMarkup(id, { note: note.trim() || undefined }), setNoting(false))} aria-label="Note" placeholder="Note" className="min-w-0 flex-1 rounded border border-line bg-surface px-1.5 py-1 text-sm text-ink" />
          <button type="button" className={tap} onClick={() => (updateMarkup(id, { note: note.trim() || undefined }), setNoting(false))}>
            Save
          </button>
        </>
      ) : (
        <button type="button" className={tap} onClick={() => (setNote(m.note ?? ''), setNoting(true))}>
          {m.note ? 'Edit note' : 'Add note'}
        </button>
      )}
      {m.kind === 'highlight' && wordsOf(m) && (
        <button type="button" className={tap} onClick={() => topicFromMarkup(id)}>
          Make topic
        </button>
      )}
      <button type="button" className={`${tap} text-bad`} aria-label="Delete this markup" onClick={() => deleteMarkup(id)}>
        <Icon name="trash" size={16} />
      </button>
      <button type="button" className={tap} aria-label="Done" onClick={() => selectMarkup(null)}>
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}

const excerpt = (m: MarkupObject) => wordsOf(m) || m.note || (m.link ? ('page' in m.link ? `Link to page ${m.link.page}` : `Link to ${m.link.url}`) : '')

/** Every piece of markup of the PDF, by page: click one to go to it; make a topic from a highlight; send all highlights to the outline. */
export function MarkupTab({ source }: { source: PdfSource; handle: PdfHandle }) {
  const all = useEditor((s) => s.pdf.markup)
  const edits = useEditor((s) => s.pdf.pageEdits)
  const readOnly = useEditor((s) => s.readOnly)
  const selected = useEditor((s) => s.pdfPanel.markId)
  const byPage = useMemo(() => markupByPage(all, source.id), [all, source.id])
  const pages = [...byPage.keys()].sort((a, b) => a - b)
  const total = pages.reduce((n, p) => n + (byPage.get(p)?.length ?? 0), 0)
  const highlights = [...byPage.values()].flat().filter((m) => m.kind === 'highlight' && wordsOf(m) && !m.topicId).length
  if (!total) {
    return (
      <div className="p-4 text-sm text-muted">
        <p>No markup on this PDF yet.</p>
        {!readOnly && <p className="mt-1 text-xs">Choose Highlight, Pen or another tool on the Pages tab and mark the page. Highlights and notes are listed here by page.</p>}
      </div>
    )
  }
  return (
    <div className="min-h-0 flex-1 overflow-auto" data-markup-list>
      {!readOnly && (
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface px-3 py-2 text-xs">
          <span className="text-muted">{total} item{total === 1 ? '' : 's'}</span>
          <button type="button" disabled={!highlights} className="ml-auto rounded-ui border border-line px-2.5 py-1.5 text-sm font-medium hover:bg-bg disabled:opacity-40 [@media(pointer:coarse)]:min-h-11" onClick={() => sendHighlightsToOutline(source.id)}>
            Send all highlights to outline{highlights ? ` (${highlights})` : ''}
          </button>
        </div>
      )}
      {pages.map((p) => (
        <section key={p} aria-label={`Page ${p}`}>
          <h3 className="bg-bg px-3 py-1 text-xs font-semibold text-muted">
            Page {p}
            {edits[editKey(source.id, p)]?.hidden ? ' (hidden)' : ''}
          </h3>
          <ul>
            {(byPage.get(p) ?? []).map((m) => (
              <li key={m.id} className={`flex items-start gap-2 border-b border-line px-3 py-2 text-sm ${selected === m.id ? 'bg-brand/10' : ''}`}>
                <span className="mt-1 h-3 w-3 shrink-0 rounded-full border border-line" style={{ background: m.color }} aria-hidden="true" />
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    selectMarkup(m.id)
                    showSource({ sourceId: m.sourceId, page: m.page, ...(boundsOf(m) ? { rect: boundsOf(m) as never } : {}) })
                  }}
                >
                  <span className="block text-xs text-muted">{KIND_NAME[m.kind]}</span>
                  <span className="line-clamp-3 break-words">{excerpt(m) || <i className="text-muted">No words</i>}</span>
                  {m.note && wordsOf(m) && <span className="mt-0.5 block text-xs italic text-muted">Note: {m.note}</span>}
                </button>
                {!readOnly && m.kind === 'highlight' && wordsOf(m) && !m.topicId && (
                  <button type="button" className="shrink-0 rounded-ui border border-line px-2 py-1 text-xs hover:bg-bg [@media(pointer:coarse)]:min-h-11" onClick={() => topicFromMarkup(m.id)}>
                    Make topic
                  </button>
                )}
                {m.topicId && <span className="shrink-0 text-xs text-muted">In outline</span>}
                {!readOnly && (
                  <button type="button" aria-label="Delete" className="shrink-0 rounded px-1.5 py-1 text-muted hover:bg-bg hover:text-bad [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11" onClick={() => deleteMarkup(m.id)}>
                    <Icon name="trash" size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
