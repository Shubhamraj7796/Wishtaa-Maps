import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { IconTile, IconToggleGroup, Swatch } from '@/ui/IconButton'
import { Tooltip } from '@/ui/Tooltip'
import { useEditor } from '../store'
import { chooseLayout, resetPdfLayout } from './actions'
import { DOC_COLOR_LABEL, DOC_COLORS, type DocColor } from './docColor'
import { liveViewOf, subscribeViews, viewsVersion } from './spreadState'
import { TWO_MIN_PANE, twoNote } from './spreads'
import { DEFAULT_VIEW } from './workspace'

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

/** The colour a swatch shows for each Document colour (the paper as it will look). */
const SWATCH: Record<DocColor, string> = { light: '#ffffff', dark: '#121212', grey: '#9ca3af', sepia: '#f4ecd8' }

function Row({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={caption} className="flex items-center gap-1 px-1 py-0.5">
      <span aria-hidden="true" className="w-12 shrink-0 text-[11px] text-muted">
        {caption}
      </span>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  )
}

/**
 * The View menu of one PDF (in the panel's top bar, and in each pane of a split view). Icons first (rule 8): every choice is an icon with
 * its name as a tooltip, the chosen one has a highlighted background, and the whole menu fits without scrolling. The zoom percentage
 * stays as text. The choices belong to this PDF on this device.
 */
export function ViewMenu({ sourceId, compact = false }: { sourceId: string; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [percents, setPercents] = useState(false)
  // The menu is 296 px wide: it opens to the right of its button, or to the left when that would run off the window.
  const [toLeft, setToLeft] = useState(false)
  const v = useEditor((s) => s.pdfPanel.views[sourceId]) ?? DEFAULT_VIEW
  useSyncExternalStore(subscribeViews, viewsVersion)
  const live = liveViewOf(sourceId)
  const two = v.two === true
  const paged = v.paged === true
  const set = (change: Parameters<typeof chooseLayout>[1]) => chooseLayout(sourceId, change)
  const note = twoNote(two, live?.paneW ?? TWO_MIN_PANE)
  const percent = v.zoom === null ? null : Math.round(v.zoom * 100)
  const shown = percent ?? live?.percent
  const fit = v.fit ?? 'width'

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

  return (
    <div className="relative">
      <IconTile
        icon="preview"
        label="View options"
        aria-haspopup="menu"
        aria-expanded={open}
        data-view-button=""
        selected={open}
        onClick={(e) => {
          setToLeft(e.currentTarget.getBoundingClientRect().left + 296 > window.innerWidth - 8)
          setOpen(!open)
        }}
        className={compact ? 'border border-line bg-surface shadow' : ''}
      />
      {open && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setOpen(false)} />
          <div role="menu" aria-label="View" data-view-menu className={`absolute top-full z-50 mt-1 max-h-[85vh] w-[18.5rem] max-w-[92vw] overflow-y-auto rounded-ui border border-line bg-surface p-1.5 text-ink shadow-xl ${toLeft ? 'right-0' : 'left-0'}`}>
            <Row caption="Pages">
              <IconToggleGroup
                label="Pages on screen"
                itemRole="menuitemradio"
                value={two ? 'two' : 'one'}
                onChange={(x) => set({ two: x === 'two' })}
                items={[
                  { value: 'one', icon: 'pageOne', label: 'Single-page view' },
                  { value: 'two', icon: 'pageTwo', label: 'Two-page view' },
                ]}
              />
              <IconTile role="menuitemcheckbox" icon="pageFirstAlone" label="First page alone" selected={v.cover === true} disabled={!two} onClick={() => set({ cover: v.cover !== true })} />
            </Row>
            {note && (
              <p role="status" data-view-note className="mx-1 my-1 rounded bg-brand/10 px-2 py-1.5 text-xs text-ink">
                {note}
              </p>
            )}
            <Row caption="Reading">
              <IconTile role="menuitemcheckbox" icon="scrolling" label="Enable scrolling" selected={!paged} onClick={() => set({ paged: !paged })} />
              <IconTile role="menuitemcheckbox" icon="flipOne" label="1-page flipping" selected={v.flip1 === true} disabled={!two} onClick={() => set({ flip1: v.flip1 !== true })} />
              <IconTile role="menuitemcheckbox" icon="rightToLeft" label="Right-to-left reading" selected={v.rtl === true} onClick={() => set({ rtl: v.rtl !== true })} />
            </Row>
            <Row caption="Colour">
              {DOC_COLORS.map((c) => (
                <Swatch key={c} role="menuitemradio" label={DOC_COLOR_LABEL[c]} color={SWATCH[c]} selected={(v.color ?? 'light') === c} onClick={() => set({ color: c })} data-doc-color-choice={c} />
              ))}
            </Row>
            <Row caption="Zoom">
              <IconTile icon="zoomOut" label="Zoom out" onClick={() => set({ zoom: Math.max(0.25, (v.zoom ?? (shown ? shown / 100 : 1)) / 1.25) })} />
              <Tooltip label="Zoom percentage: choose one">
                <button
                  type="button"
                  aria-label={shown ? `Zoom ${shown} percent. Choose a zoom` : 'Zoom percentage. Choose a zoom'}
                  aria-expanded={percents}
                  data-zoom-percent=""
                  onClick={() => setPercents(!percents)}
                  className={`h-9 min-w-14 rounded-ui px-2 text-sm font-medium tabular-nums hover:bg-bg [@media(pointer:coarse)]:h-11 ${percents ? 'bg-brand/20 ring-1 ring-brand/60' : ''}`}
                >
                  {shown ? `${shown}%` : '–'}
                </button>
              </Tooltip>
              <IconTile icon="zoomIn" label="Zoom in" onClick={() => set({ zoom: Math.min(4, (v.zoom ?? (shown ? shown / 100 : 1)) * 1.25) })} />
            </Row>
            {percents && (
              <div role="group" aria-label="Zoom percentages" className="flex flex-wrap gap-1 px-1 pb-1 pl-[3.25rem]">
                {ZOOMS.map((z) => (
                  <button
                    key={z}
                    type="button"
                    aria-pressed={percent === Math.round(z * 100)}
                    onClick={() => (set({ zoom: z }), setPercents(false))}
                    className={`rounded-ui px-2 py-1 text-xs tabular-nums [@media(pointer:coarse)]:min-h-11 ${percent === Math.round(z * 100) ? 'bg-brand/20 font-semibold ring-1 ring-brand/60' : 'hover:bg-bg'}`}
                  >
                    {Math.round(z * 100)}%
                  </button>
                ))}
              </div>
            )}
            <Row caption="Fit">
              <IconTile role="menuitemradio" icon="fitWidth" label="Fit width" selected={percent === null && fit === 'width'} onClick={() => set({ zoom: null, fit: 'width' })} />
              <IconTile role="menuitemradio" icon="fitPage" label="Fit page" selected={percent === null && fit === 'page'} onClick={() => set({ zoom: null, fit: 'page' })} />
              <IconTile role="menuitemradio" icon="fitHeight" label="Fit height" selected={percent === null && fit === 'height'} onClick={() => set({ zoom: null, fit: 'height' })} />
              <IconTile role="menuitemradio" icon="actualSize" label="Actual size (100%)" selected={percent === 100} onClick={() => set({ zoom: 1 })} />
            </Row>
            <div className="mt-0.5 flex items-center justify-between border-t border-line px-1 pt-1">
              <IconTile role="menuitem" icon="presentation" label="Presentation mode (coming soon)" disabled data-presentation="" />
              <IconTile role="menuitem" icon="reset" label="Reset to default layout" data-reset-layout="" onClick={() => (resetPdfLayout(sourceId), setOpen(false))} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
