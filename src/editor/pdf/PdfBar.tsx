import { useEffect, useState, useSyncExternalStore } from 'react'
import type { PdfSource } from '@/core/pdf/types'
import { Icon } from '@/ui/icons'
import { useEditor } from '../store'
import { chooseLayout, closePdfPanel, openPdfFromDrive, openPdfTab, pickPdfFromDevice, removePdfFromDevice, removePdfSource, setAutoCollapse, setPdfCollapsed, setPdfFocusMode, setPdfMarkupBar, setPdfOutlineColumn, setPdfPage, setPdfSize, setPdfSync, setPdfTab, setPdfThumbs, setPdfTool, splitPdf, turnPdf, unsplitPdf } from './actions'
import { downloadMarkedPdf, saveCopyToDrive } from './exportActions'
import { btn, Menu, MenuCheck, MenuItem } from './menus'
import { nextSize, SIZE_LABEL } from './layout'
import { liveViewOf, subscribeViews, viewsVersion } from './spreadState'
import { nearestRow } from './spreads'
import { useTouchFriendly } from '../pictures/touch'
import { loadPdfUi } from './uiPrefs'
import { ViewMenu } from './ViewMenu'

/** Widths of the panel at which the less-used buttons of the top bar move into the "..." menu. */
const WIDE_BAR = 700
const MID_BAR = 560
/** A touch screen needs bigger buttons, so it goes slim sooner. */
const SLIM_BAR = 440
const SLIM_TOUCH = 560

/**
 * The one thin bar above the pages: close, the PDF's name (a drop-down of the open PDFs), the page ("3 of 12", type a number to jump),
 * the View menu, Capture, Split, Markup, Focus, "..." and the size button. What does not fit goes into the "..." menu, which also holds
 * the rare settings, so nothing is lost.
 */
export function PdfBar({ panelW, source, list, readOnly, showHidden, setShowHidden, hiddenCount, onOutline }: { panelW: number; source: PdfSource | undefined; list: PdfSource[]; readOnly: boolean; showHidden: boolean; setShowHidden: (b: boolean) => void; hiddenCount: number; onOutline: () => void }) {
  const [menu, setMenu] = useState<'source' | 'more' | null>(null)
  const panel = useEditor((s) => s.pdfPanel)
  const { size, other, sourceId, tool, markupBar, thumbs, tabs } = panel
  const full = size === 'full'
  const twoOn = useEditor((s) => (source ? s.pdfPanel.views[source.id]?.two === true : false))
  const second = tabs.find((t) => t !== source?.id) ?? list.find((s) => s.id !== source?.id)?.id
  const close = () => setMenu(null)
  const wide = panelW >= WIDE_BAR
  const mid = panelW >= MID_BAR
  const touch = useTouchFriendly()
  const slim = panelW < (touch ? SLIM_TOUCH : SLIM_BAR)
  const paged = useEditor((s) => (source ? s.pdfPanel.views[source.id]?.paged === true : false))
  const [autoOn, setAutoOn] = useState(() => loadPdfUi().autoCollapse)
  const doThenClose = (fn: () => void) => () => (fn(), close())

  return (
    <div data-pdf-bar className="relative z-30 flex h-11 shrink-0 items-center gap-0.5 border-b border-line px-1">
      {!slim && (
        <button type="button" className={btn} aria-label="Close the PDF panel" title="Close the PDF (it stays in the map)" onClick={closePdfPanel}>
          <Icon name="close" size={16} />
        </button>
      )}

      <div className="relative min-w-0 flex-1">
        <button type="button" aria-haspopup="menu" aria-expanded={menu === 'source'} onClick={() => setMenu(menu === 'source' ? null : 'source')} className="flex w-full items-center gap-1 truncate rounded px-2 py-1 text-left text-sm font-medium hover:bg-bg [@media(pointer:coarse)]:min-h-11" title={source?.name ?? 'Choose a PDF'}>
          <span className="truncate">{source?.name ?? 'No PDF'}</span>
          <Icon name="chevronDown" size={14} />
        </button>
        {menu === 'source' && (
          <Menu onClose={close} label="PDFs">
            {list.map((s) => (
              <MenuItem key={s.id} onClick={() => (openPdfTab(s.id), close())} active={s.id === sourceId || s.id === other}>
                {s.name} <span className="text-xs text-muted">· {s.pages} pages</span>
              </MenuItem>
            ))}
            {!list.length && <div className="px-3 py-2 text-xs text-muted">No PDFs in this map yet.</div>}
            {!readOnly && (
              <>
                <hr className="my-1 border-line" />
                <MenuItem onClick={doThenClose(pickPdfFromDevice)}>Open a PDF from this device…</MenuItem>
                <MenuItem onClick={doThenClose(() => void openPdfFromDrive())}>Open a PDF from Google Drive…</MenuItem>
              </>
            )}
            {list.length > 1 && (
              <>
                <hr className="my-1 border-line" />
                {other ? (
                  <MenuItem onClick={doThenClose(() => unsplitPdf())}>One PDF (merge the split view)</MenuItem>
                ) : (
                  list
                    .filter((s) => s.id !== sourceId)
                    .map((s) => (
                      <MenuItem key={`split-${s.id}`} onClick={doThenClose(() => splitPdf(s.id, 'right'))}>
                        Split view with {s.name}
                      </MenuItem>
                    ))
                )}
                {other && <MenuItem onClick={doThenClose(() => setPdfSync(!panel.sync))}>{panel.sync ? 'Turn off Sync scrolling' : 'Sync scrolling'}</MenuItem>}
              </>
            )}
            {size !== 'normal' && <MenuItem onClick={doThenClose(() => setPdfOutlineColumn(!panel.outlineColumn))}>{panel.outlineColumn ? 'Hide the Outline column' : 'Show the Outline beside the PDFs'}</MenuItem>}
            {source && (
              <>
                <hr className="my-1 border-line" />
                <MenuItem onClick={doThenClose(() => void downloadMarkedPdf(source.id))}>Download PDF with markup</MenuItem>
                <MenuItem onClick={doThenClose(() => void saveCopyToDrive(source.id))}>Save copy to Google Drive</MenuItem>
              </>
            )}
            {source && !readOnly && (
              <>
                <hr className="my-1 border-line" />
                <MenuItem onClick={doThenClose(onOutline)}>Start an outline from this PDF…</MenuItem>
                <MenuItem onClick={doThenClose(() => void removePdfFromDevice(source.hash))}>Remove from this device</MenuItem>
                <MenuItem danger onClick={doThenClose(() => removePdfSource(source.id))}>Remove from this map</MenuItem>
              </>
            )}
          </Menu>
        )}
      </div>

      {source && <PageControls source={source} compact={!mid} arrows={panelW >= 520 || paged} />}
      {source && !slim && (
        <button type="button" data-two-toggle className={`${btn} ${twoOn ? 'bg-brand/15 text-ink' : ''}`} aria-pressed={twoOn} aria-label="Two pages side by side" title={twoOn ? 'Back to one page' : 'Two pages side by side, like an open book (the panel goes full screen)'} onClick={() => chooseLayout(source.id, { two: !twoOn })}>
          <Icon name="openBook" size={15} />
        </button>
      )}
      {source && <ViewMenu sourceId={source.id} />}
      {source && (
        <button type="button" className={`${btn} ${tool === 'capture' ? 'bg-brand/15 text-ink' : ''}`} aria-pressed={tool === 'capture'} aria-label="Capture area" title="Take part of a page as a picture, as a new topic (works on scans and handwriting)" disabled={readOnly} onClick={() => setPdfTool(tool === 'capture' ? 'select' : 'capture')}>
          <Icon name="camera" size={15} />
          {wide && <span className="ml-1">Capture area</span>}
        </button>
      )}
      {source && wide && (
        <button type="button" className={`${btn} ${other ? 'bg-brand/15 text-ink' : ''}`} aria-pressed={!!other} disabled={!other && !second} title={other ? 'Back to one PDF' : second ? 'Show two PDFs side by side' : 'Open a second PDF to split the view'} onClick={() => (other ? unsplitPdf() : second && splitPdf(second, 'right'))}>
          <Icon name="split" size={15} />
          <span className="ml-1">{other ? 'One PDF' : 'Split'}</span>
        </button>
      )}
      {source && !readOnly && (
        <button type="button" data-markup-toggle className={`${btn} ${markupBar ? 'bg-brand/15 text-ink' : ''}`} aria-pressed={markupBar} aria-label="Markup" title="Markup: pen, highlighter, shapes (the tools float over the page)" onClick={() => setPdfMarkupBar(!markupBar)}>
          <Icon name="edit" size={15} />
          {wide && <span className="ml-1">Markup</span>}
        </button>
      )}
      {source && mid && (
        <button type="button" data-focus-button className={btn} aria-label="Focus mode" title="Focus: hide every control, only the page (Esc brings them back)" onClick={() => setPdfFocusMode(true)}>
          <Icon name="focus" size={15} />
        </button>
      )}

      <div className="relative">
        <button type="button" data-more className={btn} aria-haspopup="menu" aria-expanded={menu === 'more'} aria-label="More PDF options" title="More: open a PDF, split, Focus, thumbnails, markup list and settings" onClick={() => setMenu(menu === 'more' ? null : 'more')}>
          <span aria-hidden="true" className="text-base leading-none">⋯</span>
        </button>
        {menu === 'more' && (
          <Menu onClose={close} right label="More">
            {!readOnly && (
              <>
                <MenuItem onClick={doThenClose(pickPdfFromDevice)}>Open a PDF from this device…</MenuItem>
                <MenuItem onClick={doThenClose(() => void openPdfFromDrive())}>Open a PDF from Google Drive…</MenuItem>
                <hr className="my-1 border-line" />
              </>
            )}
            {!wide && source && (
              <>
                {other ? (
                  <MenuItem onClick={doThenClose(() => unsplitPdf())}>One PDF (merge the split view)</MenuItem>
                ) : (
                  <MenuItem onClick={doThenClose(() => second && splitPdf(second, 'right'))}>{second ? 'Split view' : 'Split view (open a second PDF first)'}</MenuItem>
                )}
              </>
            )}
            {other && (
              <MenuCheck on={panel.sync} onClick={() => setPdfSync(!panel.sync)}>
                Sync scrolling
              </MenuCheck>
            )}
            {!mid && source && <MenuItem onClick={doThenClose(() => setPdfFocusMode(true))}>Focus mode (hide every control)</MenuItem>}
            {mid && source && <MenuItem onClick={doThenClose(() => setPdfFocusMode(true))}>Focus mode</MenuItem>}
            {source && (
              <MenuCheck on={thumbs} onClick={() => setPdfThumbs(!thumbs)}>
                Page thumbnails
              </MenuCheck>
            )}
            {source && (
              <MenuItem onClick={doThenClose(() => setPdfTab(panel.tab === 'markup' ? 'pages' : 'markup'))}>{panel.tab === 'markup' ? 'Close the markup list' : 'Markup list…'}</MenuItem>
            )}
            {hiddenCount > 0 && (
              <MenuCheck on={showHidden} onClick={() => setShowHidden(!showHidden)}>
                Show {hiddenCount} hidden page{hiddenCount === 1 ? '' : 's'}
              </MenuCheck>
            )}
            {!readOnly && (
              <MenuCheck
                on={autoOn}
                onClick={() => {
                  setAutoOn(!autoOn)
                  setAutoCollapse(!autoOn)
                }}
              >
                Pen bar folds away when idle
              </MenuCheck>
            )}
            {size !== 'normal' && <MenuItem onClick={doThenClose(() => setPdfOutlineColumn(!panel.outlineColumn))}>{panel.outlineColumn ? 'Hide the Outline column' : 'Show the Outline beside the PDFs'}</MenuItem>}
            <hr className="my-1 border-line" />
            {slim && <MenuItem onClick={doThenClose(closePdfPanel)}>Close the PDF (it stays in the map)</MenuItem>}
            <MenuItem onClick={doThenClose(() => setPdfSize(nextSize(size)))}>{full ? 'Restore the PDF to its normal size' : `Make the PDF bigger (${SIZE_LABEL[nextSize(size)]})`}</MenuItem>
            <MenuItem onClick={doThenClose(() => setPdfCollapsed(true))}>Hide the PDF panel (the PDF stays open)</MenuItem>
          </Menu>
        )}
      </div>

      <button
        type="button"
        className={btn}
        data-expand
        aria-label={full ? 'Restore the PDF to its normal size' : `Make the PDF bigger (now ${SIZE_LABEL[size]}; next ${SIZE_LABEL[nextSize(size)]})`}
        title={full ? 'Restore (Esc)' : `${SIZE_LABEL[size]}. Click for ${SIZE_LABEL[nextSize(size)]}`}
        onClick={() => setPdfSize(nextSize(size))}
      >
        <Icon name={full ? 'shrink' : 'expand'} size={16} />
      </button>
    </div>
  )
}

/** The page: previous, the page box (type a number to jump), "of N", next. With two pages showing, the arrows step by spread. */
function PageControls({ source, compact, arrows }: { source: PdfSource; compact: boolean; arrows: boolean }) {
  const page = useEditor((s) => s.pdfPanel.page)
  const [text, setText] = useState(String(page))
  useEffect(() => setText(String(page)), [page])
  useSyncExternalStore(subscribeViews, viewsVersion)
  const rows = liveViewOf(source.id)?.rows
  const at = rows?.length ? nearestRow(rows, page) : -1
  const atStart = rows?.length ? at <= 0 : page <= 1
  const atEnd = rows?.length ? at >= rows.length - 1 : page >= source.pages
  const spread = rows?.[at]
  const shown = spread && spread.length > 1 ? `${spread[0]}–${spread[spread.length - 1]}` : null
  const go = () => {
    const n = Math.min(source.pages, Math.max(1, Math.round(Number(text))))
    if (Number.isFinite(n)) setPdfPage(n)
    setText(String(Number.isFinite(n) ? n : page))
  }
  return (
    <div className="flex shrink-0 items-center gap-0.5 text-xs text-muted">
      {arrows && <button type="button" className={btn} aria-label={shown ? 'Previous spread' : 'Previous page'} onClick={() => turnPdf(-1)} disabled={atStart}>‹</button>}
      <label className="flex items-center gap-1">
        <span className="sr-only">Page</span>
        <input value={text} onChange={(e) => setText(e.target.value)} onBlur={go} onKeyDown={(e) => e.key === 'Enter' && go()} inputMode="numeric" aria-label="Page number" className="w-10 rounded border border-line bg-surface px-1 py-0.5 text-center text-ink [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-12" />
        {!compact && <span>of {source.pages}</span>}
        {shown && !compact && <span data-spread-label>(showing {shown})</span>}
      </label>
      {arrows && <button type="button" className={btn} aria-label={shown ? 'Next spread' : 'Next page'} onClick={() => turnPdf(1)} disabled={atEnd}>›</button>}
    </div>
  )
}
