import { useEffect, useState } from 'react'
import type { PdfHandle } from '@/core/pdf/engine'
import { detectHeadings, flattenBookmarks, type PageLines } from '@/core/pdf/text'
import type { PdfSource } from '@/core/pdf/types'
import { showNotice } from '../notice'
import { addOutlineTopics } from './topics'

interface Row {
  key: number
  on: boolean
  title: string
  level: number
  page: number | null
}

const field = 'rounded border border-line bg-surface px-1.5 py-1 text-sm text-ink'

/**
 * Starts the map's outline from the PDF: its own bookmarks, or headings guessed from the size of the text. Either is only a preview
 * to edit (rename, change the level, untick); nothing is added until "Add to map".
 */
export function OutlineDialog({ source, handle, onClose }: { source: PdfSource; handle: PdfHandle; onClose: () => void }) {
  const [mode, setMode] = useState<'bookmarks' | 'headings'>('bookmarks')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [progress, setProgress] = useState(0)
  const [none, setNone] = useState(false)

  useEffect(() => {
    let live = true
    setRows(null)
    setNone(false)
    setProgress(0)
    void (async () => {
      let found: Omit<Row, 'key' | 'on'>[] = []
      if (mode === 'bookmarks') {
        found = flattenBookmarks(await handle.bookmarks()).map((b) => ({ title: b.title, level: b.level, page: b.page }))
      } else {
        const pages: PageLines[] = []
        for (let n = 1; n <= handle.pages && live; n++) {
          pages.push(await handle.text(n))
          if (n % 10 === 0) {
            setProgress(n / handle.pages)
            await new Promise((r) => setTimeout(r, 0))
          }
        }
        found = detectHeadings(pages).map((h) => ({ title: h.title, level: h.level, page: h.page }))
      }
      if (!live) return
      setNone(!found.length)
      setRows(found.map((f, i) => ({ key: i, on: true, ...f })))
    })().catch(() => {
      if (!live) return
      setNone(true)
      setRows([])
    })
    return () => {
      live = false
    }
  }, [mode, handle])

  const change = (key: number, p: Partial<Row>) => setRows((r) => r?.map((x) => (x.key === key ? { ...x, ...p } : x)) ?? null)
  const chosen = rows?.filter((r) => r.on && r.title.trim()) ?? []
  const add = () => {
    const n = addOutlineTopics(source.id, chosen.map((r) => ({ title: r.title, level: r.level, page: r.page })))
    if (n) showNotice(`Added ${n} topic${n === 1 ? '' : 's'} from the PDF.`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-3" role="presentation" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Outline from the PDF" className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-ui border border-line bg-surface shadow-2xl">
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <h2 className="text-base font-semibold">Outline from {source.name}</h2>
          <button type="button" className="ml-auto rounded px-2 py-1 hover:bg-bg" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="flex gap-1 px-4 pt-3" role="tablist">
          {(['bookmarks', 'headings'] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`rounded-ui px-3 py-1.5 text-sm ${mode === m ? 'bg-brand/15 font-semibold' : 'hover:bg-bg'}`}>
              {m === 'bookmarks' ? 'PDF bookmarks' : 'Detect headings'}
            </button>
          ))}
        </div>
        <p className="px-4 pt-2 text-xs text-muted">
          {mode === 'bookmarks' ? 'The bookmarks saved inside the PDF.' : 'Guessed from the size of the text, so check it. Nothing is added until you press Add to map.'} Rename, change the level, or untick what you do not want.
        </p>
        <div className="min-h-[8rem] flex-1 overflow-auto px-4 py-2" data-outline-preview>
          {!rows && <progress className="w-full accent-[rgb(var(--c-brand))]" max={1} value={mode === 'headings' ? progress || undefined : undefined} aria-label="Reading the PDF" />}
          {none && <p className="py-4 text-sm text-muted">{mode === 'bookmarks' ? 'This PDF has no bookmarks. Try Detect headings.' : 'No headings were found.'}</p>}
          <ul className="space-y-1">
            {rows?.map((r) => (
              <li key={r.key} className="flex items-center gap-1.5" style={{ paddingLeft: (r.level - 1) * 14 }}>
                <input type="checkbox" checked={r.on} onChange={(e) => change(r.key, { on: e.target.checked })} aria-label={`Include ${r.title}`} />
                <input value={r.title} onChange={(e) => change(r.key, { title: e.target.value })} className={`${field} min-w-0 flex-1`} aria-label="Topic text" />
                <select value={r.level} onChange={(e) => change(r.key, { level: Number(e.target.value) })} className={field} aria-label="Level">
                  {[1, 2, 3, 4, 5, 6].map((l) => (
                    <option key={l} value={l}>
                      L{l}
                    </option>
                  ))}
                </select>
                <span className="w-9 shrink-0 text-right text-xs text-muted">{r.page ? `p. ${r.page}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
        <footer className="flex items-center gap-2 border-t border-line px-4 py-3">
          <span className="text-xs text-muted">{chosen.length} selected</span>
          <button type="button" className="ml-auto rounded-ui border border-line px-3 py-1.5 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" disabled={!chosen.length} className="rounded-ui bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink disabled:opacity-50" onClick={add}>
            Add to map
          </button>
        </footer>
      </div>
    </div>
  )
}
