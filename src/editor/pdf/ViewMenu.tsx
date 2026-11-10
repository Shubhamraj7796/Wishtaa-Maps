import { useEffect, useState, useSyncExternalStore } from 'react'
import { Icon } from '@/ui/icons'
import { useEditor } from '../store'
import { setViewOf } from './actions'
import { liveViewOf, subscribeViews, viewsVersion } from './spreadState'
import { TWO_MIN_PANE, twoNote } from './spreads'
import { DEFAULT_VIEW } from './workspace'

const ZOOMS = [0.5, 0.75, 1.25, 1.5, 2, 3]

const row = 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-brand/15 [@media(pointer:coarse)]:min-h-11'

/**
 * The View menu of one PDF (in the panel's tool row, and in each pane of a split view): Single or Two pages, Show cover page,
 * Enable scrolling, right to left, and the zoom. The choices belong to this PDF on this device.
 */
export function ViewMenu({ sourceId, compact = false }: { sourceId: string; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const v = useEditor((s) => s.pdfPanel.views[sourceId]) ?? DEFAULT_VIEW
  useSyncExternalStore(subscribeViews, viewsVersion)
  const live = liveViewOf(sourceId)
  const two = v.two === true
  const paged = v.paged === true
  const set = (change: Parameters<typeof setViewOf>[1]) => setViewOf(sourceId, change)
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

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="View options"
        title="View: Single or Two pages, cover page, scrolling, zoom"
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
          <div role="menu" aria-label="View" data-view-menu className="absolute right-0 top-full z-50 mt-1 w-72 max-w-[85vw] rounded-ui border border-line bg-surface py-1 text-ink shadow-xl sm:left-0 sm:right-auto">
            {radio(!two, 'Single-page view', () => set({ two: false }))}
            {radio(two, 'Two-page view', () => set({ two: true }), 'Two pages of this PDF side by side, like an open book')}
            {note && (
              <p role="status" data-view-note className="mx-3 mb-1 rounded bg-brand/10 px-2 py-1.5 text-xs text-ink">
                {note}
              </p>
            )}
            {check(v.cover === true, 'Show cover page', () => set({ cover: v.cover !== true }), 'Page 1 alone, then 2-3, 4-5 (off: 1-2, 3-4). Used in Two-page view')}
            {check(!paged, 'Enable scrolling', () => set({ paged: !paged }), 'On: scroll through the pages. Off: one page or spread at a time (page buttons and arrow keys)')}
            {check(v.rtl === true, 'Right-to-left reading', () => set({ rtl: v.rtl !== true }), 'The first page of a spread on the right')}
            <hr className="my-1 border-line" />
            {radio(percent === null && (v.fit ?? 'width') === 'width', 'Fit width', () => set({ zoom: null, fit: 'width' }))}
            {radio(percent === null && v.fit === 'page', 'Fit page', () => set({ zoom: null, fit: 'page' }))}
            {radio(percent === 100, 'Actual size (100%)', () => set({ zoom: 1 }))}
            <div role="group" aria-label="Zoom" className="flex flex-wrap gap-1 px-3 py-1.5">
              {ZOOMS.map((z) => (
                <button key={z} type="button" aria-pressed={percent === Math.round(z * 100)} onClick={() => set({ zoom: z })} className={`rounded border px-2 py-1 text-xs [@media(pointer:coarse)]:min-h-11 ${percent === Math.round(z * 100) ? 'border-brand bg-brand/15 font-semibold' : 'border-line hover:bg-bg'}`}>
                  {Math.round(z * 100)}%
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
