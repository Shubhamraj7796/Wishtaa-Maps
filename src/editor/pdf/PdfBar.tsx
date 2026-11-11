import { useEffect, useState, useSyncExternalStore } from 'react'
import type { PdfSource } from '@/core/pdf/types'
import { IconTile } from '@/ui/IconButton'
import { Icon } from '@/ui/icons'
import { Tooltip } from '@/ui/Tooltip'
import { useEditor } from '../store'
import { chooseLayout, closePdfPanel, collapsePdf, takeFocusBar, openPdfFromDrive, openPdfTab, pickPdfFromDevice, removePdfFromDevice, removePdfSource, setAutoCollapse, setPdfFocusMode, setPdfMarkupBar, setPdfOutlineColumn, setPdfPage, setPdfSize, setPdfSync, setPdfTab, setPdfThumbs, setPdfTool, splitPdf, turnPdf, unsplitPdf } from './actions'
import { downloadMarkedPdf, saveCopyToDrive } from './exportActions'
import { Menu, MenuCheck, MenuItem } from './menus'
import { nextSize, SIZE_LABEL } from './layout'
import { liveViewOf, subscribeViews, viewsVersion } from './spreadState'
import { nearestRow } from './spreads'
import { useTouchFriendly } from '../pictures/touch'
import { loadPdfUi } from './uiPrefs'
import { OpenPdfButton } from './OpenPdf'
import { ViewMenu } from './ViewMenu'

/**
 * Widths of the panel under which a button of the top bar moves into the "..." menu, in the order they leave as the panel gets narrower:
 * Focus, Split, the page arrows, the two-pages book, Close, and LAST of all Open a PDF. Collapse, the file name, the page box, View, Capture,
 * Markup, "..." and the size button never leave. A touch screen has bigger buttons, so Close and Open a PDF go a little sooner there. The
 * file name keeps at least about 96 px at every width (measured in the browser tests).
 */
export const BAR_AT = { focus: 680, split: 640, arrows: 600, book: 560, close: 500, closeTouch: 560, open: 440, openTouch: 500, compact: 560 }

/**
 * The one thin bar above the pages: close, the PDF's name (a drop-down of the open PDFs), the page ("3 of 12", type a number to jump),
 * the View menu, Capture, Split, Markup, Focus, "..." and the size button. What does not fit goes into the "..." menu, which also holds
 * the rare settings, so nothing is lost.
 */
export function PdfBar({ mode, panelW, source, list, readOnly, showHidden, setShowHidden, hiddenCount, onOutline }: { mode: 'side' | 'sheet'; panelW: number; source: PdfSource | undefined; list: PdfSource[]; readOnly: boolean; showHidden: boolean; setShowHidden: (b: boolean) => void; hiddenCount: number; onOutline: () => void }) {
  const [menu, setMenu] = useState<'source' | 'more' | null>(null)
  const panel = useEditor((s) => s.pdfPanel)
  const { size, other, sourceId, tool, markupBar, thumbs, tabs } = panel
  const full = size === 'full'
  const twoOn = useEditor((s) => (source ? s.pdfPanel.views[source.id]?.two === true : false))
  const second = tabs.find((t) => t !== source?.id) ?? list.find((s) => s.id !== source?.id)?.id
  const close = () => setMenu(null)
  const touch = useTouchFriendly()
  const showFocus = panelW >= BAR_AT.focus
  const showSplit = panelW >= BAR_AT.split
  const showBook = panelW >= BAR_AT.book
  const showClose = panelW >= (touch ? BAR_AT.closeTouch : BAR_AT.close)
  const showOpen = !readOnly && panelW >= (touch ? BAR_AT.openTouch : BAR_AT.open)
  const compact = panelW < BAR_AT.compact
  const paged = useEditor((s) => (source ? s.pdfPanel.views[source.id]?.paged === true : false))
  const [autoOn, setAutoOn] = useState(() => loadPdfUi().autoCollapse)
  const doThenClose = (fn: () => void) => () => (fn(), close())

  // After the PDF was opened again from its tab, the focus is on the collapse button, where the person's hand was.
  useEffect(() => {
    if (takeFocusBar()) (document.querySelector('[data-collapse-pdf]') as HTMLElement | null)?.focus()
  }, [])

  return (
    <div data-pdf-bar className="relative z-30 flex h-11 shrink-0 items-center gap-0.5 border-b border-line px-1">
      <IconTile icon={mode === 'side' ? 'panelLeftClose' : 'panelBottomClose'} label="Collapse PDF" keys="Alt+Shift+F" data-collapse-pdf="" onClick={() => collapsePdf()} />
      {showClose && (
        <IconTile icon="close" label="Close the PDF panel" onClick={closePdfPanel} />
      )}

      <div className="relative min-w-0 flex-1">
        <Tooltip label={source?.name ?? 'Choose a PDF'}>
          <button type="button" aria-haspopup="menu" aria-expanded={menu === 'source'} onClick={() => setMenu(menu === 'source' ? null : 'source')} className="flex w-full items-center gap-1 truncate rounded px-2 py-1 text-left text-sm font-medium hover:bg-bg [@media(pointer:coarse)]:min-h-11">
            <span className="truncate">{source?.name ?? 'No PDF'}</span>
            <Icon name="chevronDown" size={14} />
          </button>
        </Tooltip>
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

      {source && <PageControls source={source} compact={compact} arrows={panelW >= BAR_AT.arrows || paged} />}
      {showOpen && <OpenPdfButton />}
      {source && showBook && (
        <IconTile icon="pageTwo" label="Two pages side by side" data-two-toggle="" selected={twoOn} onClick={() => chooseLayout(source.id, { two: !twoOn })} />
      )}
      {source && <ViewMenu sourceId={source.id} />}
      {source && (
        <IconTile icon="camera" label="Capture area" selected={tool === 'capture'} disabled={readOnly} onClick={() => setPdfTool(tool === 'capture' ? 'select' : 'capture')} />
      )}
      {source && showSplit && (
        <IconTile icon="split" label={other ? 'One PDF' : 'Split'} selected={!!other} disabled={!other && !second} onClick={() => (other ? unsplitPdf() : second && splitPdf(second, 'right'))} />
      )}
      {source && !readOnly && (
        <IconTile icon="edit" label="Markup" data-markup-toggle="" selected={markupBar} onClick={() => setPdfMarkupBar(!markupBar)} />
      )}
      {source && showFocus && (
        <IconTile icon="focus" label="Focus mode" data-focus-button="" onClick={() => setPdfFocusMode(true)} />
      )}

      <div className="relative">
        <IconTile icon="more" label="More PDF options" data-more="" aria-haspopup="menu" aria-expanded={menu === 'more'} selected={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')} />
        {menu === 'more' && (
          <Menu onClose={close} right label="More">
            {!readOnly && (
              <>
                <MenuItem onClick={doThenClose(pickPdfFromDevice)}>Open a PDF from this device…</MenuItem>
                <MenuItem onClick={doThenClose(() => void openPdfFromDrive())}>Open a PDF from Google Drive…</MenuItem>
                <hr className="my-1 border-line" />
              </>
            )}
            {!showSplit && source && (
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
            {!showFocus && source && <MenuItem onClick={doThenClose(() => setPdfFocusMode(true))}>Focus mode (hide every control)</MenuItem>}
            {showFocus && source && <MenuItem onClick={doThenClose(() => setPdfFocusMode(true))}>Focus mode</MenuItem>}
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
            {!showClose && <MenuItem onClick={doThenClose(closePdfPanel)}>Close the PDF (it stays in the map)</MenuItem>}
            <MenuItem onClick={doThenClose(() => setPdfSize(nextSize(size)))}>{full ? 'Restore the PDF to its normal size' : `Make the PDF bigger (${SIZE_LABEL[nextSize(size)]})`}</MenuItem>
            <MenuItem onClick={doThenClose(() => collapsePdf())}>Collapse PDF (the PDF stays open)</MenuItem>
          </Menu>
        )}
      </div>

      <IconTile
        icon={full ? 'shrink' : 'expand'}
        label={full ? 'Restore the PDF to its normal size' : `Make the PDF bigger (now ${SIZE_LABEL[size]}; next ${SIZE_LABEL[nextSize(size)]})`}
        keys={full ? 'Esc' : undefined}
        data-expand=""
        onClick={() => setPdfSize(nextSize(size))}
      />
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
      {arrows && <IconTile icon="chevronLeft" label={shown ? 'Previous spread' : 'Previous page'} onClick={() => turnPdf(-1)} disabled={atStart} />}
      <label className="flex items-center gap-1">
        <span className="sr-only">Page</span>
        <input value={text} onChange={(e) => setText(e.target.value)} onBlur={go} onKeyDown={(e) => e.key === 'Enter' && go()} inputMode="numeric" aria-label="Page number" className="w-10 rounded border border-line bg-surface px-1 py-0.5 text-center text-ink [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-12" />
        {!compact && <span>of {source.pages}</span>}
        {shown && !compact && <span data-spread-label>(showing {shown})</span>}
      </label>
      {arrows && <IconTile icon="chevronRight" label={shown ? 'Next spread' : 'Next page'} onClick={() => turnPdf(1)} disabled={atEnd} />}
    </div>
  )
}
