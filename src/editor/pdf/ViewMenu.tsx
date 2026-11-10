import { useEffect, useState, useSyncExternalStore } from 'react'
import { Icon } from '@/ui/icons'
import { useEditor } from '../store'
import { chooseLayout, resetPdfLayout } from './actions'
import { liveViewOf, subscribeViews, viewsVersion } from './spreadState'
import { TWO_MIN_PANE, twoNote } from './spreads'
import { DEFAULT_VIEW } from './workspace'
import { DOC_COLOR_LABEL, DOC_COLORS, PAPER } from './docColor'

const ZOOMS = [0.5, 0.75, 1.25, 1.5, 2, 3]

const zoomBtn = 'grid h-8 min-w-8 place-items-center rounded border border-line px-1.5 hover:bg-bg [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-11'
const row = 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-brand/15 [@media(pointer:coarse)]:min-h-11'

/**
 * The View menu of one PDF (in the panel's tool row, and in each pane of a split view): Single or Two pages, First page alone,
 * Enable scrolling, right to left, and the zoom. The choices belong to this PDF on this device.
 */
export function ViewMenu({ sourceId, compact = false }: { sourceId: string; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const v = useEditor((s) => s.pdfPanel.views[sourceId]) ?? DEFAULT_VIEW
  useSyncExternalStore(subscribeViews, viewsVersion)
  const live = liveViewOf(sourceId)
  const two = v.two === true
  const paged = v.paged === true
  const set = (change: Parameters<typeof chooseLayout>[1]) => chooseLayout(sourceId, change)
  const note = twoNote(two, live?.paneW ?? TWO_MIN_PANE)
  const percent = v.zoom === null ? null : Math.round(v.zoom * 100)

  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      setOpen(false)
    }
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
  }, [open])

  const radio = (on: boolean, label: string, onClick: () => void, hint?: string) => (
    <button type="button" role="menuitemradio" aria-checked={on} onClick={onClick} className={`${row} ${on ? 'font-semibold' : ''}`} title={hint}>
      <span aria-hidden="true" className="w-4 text-brand">{on ? '●' : ''}</span>
      {label}
    </button>
  )
  const check = (on: boolean, label: string, onClick: () => void, hint?: string) => (
    <button type="button" role="menuitemcheckbox" aria-checked={on} onClick={onClick} className={row} title={hint}>
      <span aria-hidden="true" className="w-4 text-brand">{on ? '✓' : ''}</span>
      {label}
    </button>
  )

  const heading = (text: string) => (
    <div role="presentation" className="px-3 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted first:pt-1">
      {text}
    </div>
  )

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="View options"
        title="View: Single or Two pages, first page alone, scrolling, document colour, zoom"
        data-view-button
        onClick={() => setOpen(!open)}
        className={`flex h-8 shrink-0 items-center gap-1 rounded px-1.5 text-sm hover:bg-bg [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-11 ${compact ? 'border border-line bg-surface shadow' : ''} ${open ? 'bg-brand/15 text-ink' : ''}`}
      >
        <Icon name="openBook" size={15} />
        <span className={compact ? '' : 'hidden sm:inline'}>View</span>
        <Icon name="chevronDown" size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setOpen(false)} />
          <div role="menu" aria-label="View" data-view-menu className="absolute right-0 top-full z-50 mt-1 max-h-[75vh] w-72 max-w-[85vw] overflow-y-auto rounded-ui border border-line bg-surface py-1 text-ink shadow-xl sm:left-0 sm:right-auto">
            {heading('Pages on screen')}
            {radio(!two, 'Single-page view', () => set({ two: false }))}
            {radio(two, 'Two-page view', () => set({ two: true }), 'Two pages of this PDF side by side, like an open book')}
            {note && (
              <p role="status" data-view-note className="mx-3 mb-1 rounded bg-brand/10 px-2 py-1.5 text-xs text-ink">
                {note}
              </p>
            )}
            {check(v.cover === true, 'First page alone', () => set({ cover: v.cover !== true }), 'Page 1 alone, then 2-3, 4-5 (off: 1-2, 3-4). Used in Two-page view')}
            {heading('Reading')}
            {check(!paged, 'Enable scrolling', () => set({ paged: !paged }), 'On: scroll through the pages. Off: one page or spread at a time (page buttons and arrow keys)')}
            {two && check(v.flip1 === true, '1-page flipping', () => set({ flip1: v.flip1 !== true }), 'With scrolling off, a turn moves by one page (1-2, then 2-3), not a whole spread')}
            {check(v.rtl === true, 'Right-to-left reading', () => set({ rtl: v.rtl !== true }), 'The first page of a spread on the right')}
            {heading('Document colour')}
            <div role="group" aria-label="Document colour" className="grid grid-cols-4 gap-1 px-3 pb-1">
              {DOC_COLORS.map((c) => {
                const on = (v.color ?? 'light') === c
                return (
                  <button key={c} type="button" role="menuitemradio" aria-checked={on} data-doc-color-choice={c} onClick={() => set({ color: c })} title={`${DOC_COLOR_LABEL[c]}: how the pages look on screen. The PDF, markup, captured pictures and downloads keep their own colours`} className={`flex flex-col items-center gap-1 rounded border px-1 py-1.5 text-xs [@media(pointer:coarse)]:min-h-11 ${on ? 'border-brand bg-brand/15 font-semibold' : 'border-line hover:bg-bg'}`}>
                    <span aria-hidden="true" className="h-4 w-4 rounded-sm border border-line" style={{ background: PAPER[c], filter: c === 'grey' ? 'grayscale(1)' : undefined }} />
                    {DOC_COLOR_LABEL[c]}
                  </button>
                )
              })}
            </div>
            {heading('Zoom')}
            <div className="flex items-center gap-1 px-3 py-1" role="group" aria-label="Zoom">
              <button type="button" className={zoomBtn} aria-label="Zoom out" title="Zoom out" onClick={() => set({ zoom: Math.max(0.25, (v.zoom ?? 1) / 1.25) })}>
                <Icon name="zoomOut" size={15} />
              </button>
              <button type="button" className={`${zoomBtn} min-w-16 text-xs`} title="Fit to the width of the panel" onClick={() => set({ zoom: null, fit: 'width' })} aria-label={percent === null ? `Zoom: fit ${v.fit ?? 'width'}` : `Zoom ${percent} percent. Click to fit the width`}>
                {percent === null ? (v.fit === 'page' ? 'Fit page' : v.fit === 'height' ? 'Fit height' : 'Fit') : `${percent}%`}
              </button>
              <button type="button" className={zoomBtn} aria-label="Zoom in" title="Zoom in" onClick={() => set({ zoom: Math.min(4, (v.zoom ?? 1) * 1.25) })}>
                <Icon name="zoomIn" size={15} />
              </button>
            </div>
            {radio(percent === null && (v.fit ?? 'width') === 'width', 'Fit width', () => set({ zoom: null, fit: 'width' }))}
            {radio(percent === null && v.fit === 'page', 'Fit page', () => set({ zoom: null, fit: 'page' }))}
            {radio(percent === null && v.fit === 'height', 'Fit height', () => set({ zoom: null, fit: 'height' }), 'The page height fills the pane (a wide spread may then scroll sideways)')}
            {radio(percent === 100, 'Actual size (100%)', () => set({ zoom: 1 }))}
            <div role="group" aria-label="Zoom percentages" className="flex flex-wrap gap-1 px-3 py-1.5">
              {ZOOMS.map((z) => (
                <button key={z} type="button" aria-pressed={percent === Math.round(z * 100)} onClick={() => set({ zoom: z })} className={`rounded border px-2 py-1 text-xs [@media(pointer:coarse)]:min-h-11 ${percent === Math.round(z * 100) ? 'border-brand bg-brand/15 font-semibold' : 'border-line hover:bg-bg'}`}>
                  {Math.round(z * 100)}%
                </button>
              ))}
            </div>
            <hr className="my-1 border-line" />
            <button type="button" role="menuitem" aria-disabled="true" disabled data-presentation title="Full screen with the tools hidden: coming soon" className={`${row} cursor-not-allowed opacity-50`}>
              <span aria-hidden="true" className="w-4" />
              Presentation mode <span className="text-xs text-muted">(coming soon)</span>
            </button>
            <button type="button" role="menuitem" data-reset-layout onClick={() => (resetPdfLayout(sourceId), setOpen(false))} className={row} title="One page, scrolling, fit width, Light colour for this PDF, and new PDFs start that way again">
              <span aria-hidden="true" className="w-4" />
              Reset to default layout
            </button>
          </div>
        </>
      )}
    </div>
  )
}
