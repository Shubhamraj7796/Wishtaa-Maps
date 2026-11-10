import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { PdfSource } from '@/core/pdf/types'
import { Icon } from '@/ui/icons'
import { useEditor } from '../store'
import { addPdfFiles, chooseLayout, closePdfPanel, focusPdfPane, openPdfFromDrive, openPdfTab, pickPdfFromDevice, refetchFromDrive, removePdfFromDevice, removePdfSource, reopenPdf, setPdfCollapsed, setPdfDrawer, setPdfFit, setPdfOutlineColumn, setPdfPage, setPdfRatio, setPdfSize, setPdfSync, setPdfTab, setPdfTool, setPdfZoom, showSource, splitPdf, turnPdf, unsplitPdf } from './actions'
import { ViewMenu } from './ViewMenu'
import { liveViewOf, subscribeViews, viewsVersion } from './spreadState'
import { nearestRow } from './spreads'
import { SplitDropZones, Tabs } from './Tabs'
import { CaptureBar } from './CaptureBar'
import { accessPdf, bumpDevice, getDeviceVersion, rememberPassword, subscribeDevice, type PdfAccess } from './runtime'
import { downloadMarkedPdf, saveCopyToDrive } from './exportActions'
import { OutlineDialog } from './OutlineDialog'
import { Viewer } from './Viewer'
import { MarkupTab } from './tools'
import { TOOL_KEYS } from './FloatingTools'
import { clampSide, loadSheetHeight, loadSideWidth, nextSize, saveSheetHeight, saveSideWidth, SIZE_LABEL, startingSize } from './layout'
import { useTouchFriendly } from '../pictures/touch'
import { OutlineView } from '../ui/OutlineView'

const btn = 'grid h-8 min-w-8 shrink-0 place-items-center rounded px-1.5 text-sm hover:bg-bg [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-11'

const typing = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input,textarea,select,[contenteditable="true"]')

/**
 * The PDF source panel: beside the Outline and the Map on a computer, a sheet along the bottom on a tablet or phone. It can be Normal,
 * Wide (about 70%) or Full screen (the Outline then slides over it as a drawer), or tucked away to a small tab without closing the PDF.
 * Its edge is a divider that can be dragged (mouse, finger, pen) or moved with the arrow keys; the width is remembered on this device.
 */
export default function PdfPanel({ mode }: { mode: 'side' | 'sheet' }) {
  const panel = useEditor((s) => s.pdfPanel)
  const sources = useEditor((s) => s.pdf.sources)
  const readOnly = useEditor((s) => s.readOnly)
  const touch = useTouchFriendly()
  const source = panel.sourceId ? sources[panel.sourceId] : undefined
  const list = Object.values(sources).sort((a, b) => a.addedAt - b.addedAt)
  const [side, setSide] = useState(() => loadSideWidth())
  const [sheet, setSheet] = useState(() => loadSheetHeight())
  const [menu, setMenu] = useState<'open' | 'source' | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [outline, setOutline] = useState(false)
  const aside = useRef<HTMLElement>(null)
  const size = panel.size
  const full = size === 'full'

  // Opening starts in the size that suits the device: full screen for a portrait touch screen.
  useEffect(() => {
    setPdfSize(startingSize(touch, typeof window !== 'undefined' && window.innerHeight > window.innerWidth))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Read mode shows the markup but has no tools.
  useEffect(() => {
    if (readOnly && panel.tool !== 'select') setPdfTool('select')
  }, [readOnly, panel.tool])
  // Choosing a topic that came from a PDF shows its passage.
  const lastSelected = useEditor((s) => s.selected[s.selected.length - 1])
  const linked = useEditor((s) => (lastSelected ? s.topics[lastSelected]?.source ?? null : null))
  useEffect(() => {
    if (linked && sources[linked.sourceId]) showSource(linked)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked])

  // Escape: close the drawer, then go back to Normal.
  useEffect(() => {
    if (size === 'normal' && !panel.drawer) return
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || typing(e.target) || document.querySelector('[role="dialog"][aria-modal="true"]') || document.querySelector('[data-flyout]')) return
      if (useEditor.getState().pdfPanel.tool === 'capture') return // Escape ends capture first (see the capture bar)
      if (panel.drawer) setPdfDrawer(false)
      else setPdfSize('normal')
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [size, panel.drawer])

  const room = () => (mode === 'side' ? (aside.current?.parentElement?.clientWidth ?? window.innerWidth) : (aside.current?.parentElement?.clientHeight ?? window.innerHeight))
  const setLength = (v: number, keep = false) => {
    if (mode === 'side') {
      const w = clampSide(v, room())
      setSide(w)
      if (!keep) saveSideWidth(w)
    } else {
      const h = Math.round(Math.min(Math.max(200, v), room() - 120))
      setSheet(h)
      if (!keep) saveSheetHeight(h)
    }
    if (size !== 'normal') setPdfSize('normal')
  }
  const lengthNow = () => (mode === 'side' ? (aside.current?.offsetWidth ?? side) : (aside.current?.offsetHeight ?? sheet))

  // Dragging the divider (a mouse, a finger or a pen).
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault()
    const from = mode === 'side' ? e.clientX : e.clientY
    const was = lengthNow()
    let last = was
    const move = (ev: PointerEvent) => {
      const d = (mode === 'side' ? ev.clientX : ev.clientY) - from
      last = mode === 'side' ? was + d : was - d
      setLength(last, true)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      setLength(last)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
  // The same with the arrow keys; double-click or Enter switches between Normal and Wide.
  const onDividerKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 96 : 24
    const grow = mode === 'side' ? 'ArrowRight' : 'ArrowUp'
    const shrink = mode === 'side' ? 'ArrowLeft' : 'ArrowDown'
    if (e.key === grow) setLength(lengthNow() + step)
    else if (e.key === shrink) setLength(lengthNow() - step)
    else if (e.key === 'Home') setLength(0)
    else if (e.key === 'End') setLength(9999)
    else if (e.key === 'Enter' || e.key === ' ') setPdfSize(size === 'wide' ? 'normal' : 'wide')
    else return
    e.preventDefault()
  }
  const toggleWide = () => setPdfSize(size === 'wide' ? 'normal' : 'wide')

  // Tool keys while the PDF has the focus.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (readOnly || panel.tab !== 'pages' || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return
    const t = TOOL_KEYS[e.key.toLowerCase()]
    if (t) {
      e.preventDefault()
      setPdfTool(t)
    }
  }

  const sizeStyle: React.CSSProperties = full
    ? { paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }
    : mode === 'side'
      ? { width: size === 'wide' ? '70%' : side }
      : { height: size === 'wide' ? '70%' : sheet, paddingBottom: 'env(safe-area-inset-bottom)' }
  const place = full ? 'absolute inset-0 z-[45]' : mode === 'side' ? 'relative z-[35]' : 'absolute inset-x-0 bottom-0 z-[45] border-t border-line shadow-2xl'

  if (panel.collapsed) {
    return (
      <aside aria-label="PDF source (hidden)" data-pdf-panel={mode} data-pdf-size="collapsed" className={mode === 'side' ? 'relative z-10 flex w-10 shrink-0 flex-col items-center border-r border-line bg-surface py-2' : 'absolute bottom-3 right-3 z-30'}>
        <button type="button" className={`${btn} ${mode === 'sheet' ? 'h-12 w-12 rounded-full border border-line bg-surface shadow-lg' : ''}`} aria-label="Show the PDF panel" title="Show the PDF panel" onClick={() => setPdfCollapsed(false)}>
          <Icon name="pdf" size={18} />
        </button>
        {mode === 'side' && <span className="mt-2 text-[10px] text-muted [writing-mode:vertical-rl]">{source?.name ?? 'PDF'}</span>}
      </aside>
    )
  }

  return (
    <aside
      ref={aside}
      aria-label="PDF source"
      data-pdf-panel={mode}
      data-pdf-size={size}
      onKeyDown={onKeyDown}
      className={`${place} flex min-h-0 shrink-0 flex-col bg-surface text-ink ${mode === 'side' && !full ? 'border-r border-line' : ''}`}
      style={sizeStyle}
    >
      {mode === 'sheet' && !full && (
        <div role="separator" tabIndex={0} aria-orientation="horizontal" aria-label="Resize the PDF panel (drag, or use the up and down arrow keys)" aria-valuenow={Math.round(sheet)} onKeyDown={onDividerKey} onDoubleClick={toggleWide} onPointerDown={startResize} className="grid h-6 shrink-0 cursor-row-resize touch-none place-items-center focus:bg-brand/20 [@media(pointer:coarse)]:h-7">
          <span className="h-1 w-10 rounded-full bg-line" />
        </div>
      )}
      <div className="flex shrink-0 items-center gap-1 border-b border-line px-1.5 py-1">
        <button type="button" className={btn} aria-label="Close the PDF panel" title="Close the PDF (it stays in the map)" onClick={closePdfPanel}>
          <Icon name="close" size={16} />
        </button>
        <div className="relative min-w-0 flex-1">
          <button type="button" aria-haspopup="menu" aria-expanded={menu === 'source'} onClick={() => setMenu(menu === 'source' ? null : 'source')} className="flex w-full items-center gap-1 truncate rounded px-2 py-1 text-left text-sm font-medium hover:bg-bg" title={source?.name ?? 'Choose a PDF'}>
            <span className="truncate">{source?.name ?? 'No PDF'}</span>
            <Icon name="chevronDown" size={14} />
          </button>
          {menu === 'source' && (
            <Menu onClose={() => setMenu(null)}>
              {list.map((s) => (
                <MenuItem key={s.id} onClick={() => (openPdfTab(s.id), setMenu(null))} active={s.id === panel.sourceId || s.id === panel.other}>
                  {s.name} <span className="text-xs text-muted">· {s.pages} pages</span>
                </MenuItem>
              ))}
              {!list.length && <div className="px-3 py-2 text-xs text-muted">No PDFs in this map yet.</div>}
              {list.length > 1 && (
                <>
                  <hr className="my-1 border-line" />
                  {panel.other ? (
                    <MenuItem onClick={() => (unsplitPdf(), setMenu(null))}>One PDF (merge the split view)</MenuItem>
                  ) : (
                    list
                      .filter((s) => s.id !== panel.sourceId)
                      .map((s) => (
                        <MenuItem key={`split-${s.id}`} onClick={() => (splitPdf(s.id, 'right'), setMenu(null))}>
                          Split view with {s.name}
                        </MenuItem>
                      ))
                  )}
                  {panel.other && <MenuItem onClick={() => (setPdfSync(!panel.sync), setMenu(null))}>{panel.sync ? 'Turn off Sync scrolling' : 'Sync scrolling'}</MenuItem>}
                </>
              )}
              {size !== 'normal' && (
                <MenuItem onClick={() => (setPdfOutlineColumn(!panel.outlineColumn), setMenu(null))}>{panel.outlineColumn ? 'Hide the Outline column' : 'Show the Outline beside the PDFs'}</MenuItem>
              )}
              {source && (
                <>
                  <hr className="my-1 border-line" />
                  <MenuItem onClick={() => (void downloadMarkedPdf(source.id), setMenu(null))}>Download PDF with markup</MenuItem>
                  <MenuItem onClick={() => (void saveCopyToDrive(source.id), setMenu(null))}>Save copy to Google Drive</MenuItem>
                </>
              )}
              {source && !readOnly && (
                <>
                  <hr className="my-1 border-line" />
                  <MenuItem onClick={() => (setOutline(true), setMenu(null))}>Start an outline from this PDF…</MenuItem>
                  <MenuItem onClick={() => (void removePdfFromDevice(source.hash), setMenu(null))}>Remove from this device</MenuItem>
                  <MenuItem danger onClick={() => (removePdfSource(source.id), setMenu(null))}>Remove from this map</MenuItem>
                </>
              )}
            </Menu>
          )}
        </div>
        {!readOnly && (
          <div className="relative">
            <button type="button" className={btn} aria-haspopup="menu" aria-expanded={menu === 'open'} aria-label="Open a PDF" title="Open a PDF" onClick={() => setMenu(menu === 'open' ? null : 'open')}>
              <Icon name="plus" size={16} />
            </button>
            {menu === 'open' && (
              <Menu onClose={() => setMenu(null)} right>
                <MenuItem onClick={() => (pickPdfFromDevice(), setMenu(null))}>From this device…</MenuItem>
                <MenuItem onClick={() => (void openPdfFromDrive(), setMenu(null))}>From Google Drive…</MenuItem>
              </Menu>
            )}
          </div>
        )}
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
        <button type="button" className={btn} aria-label="Hide the PDF panel (the PDF stays open)" title="Hide the panel, keep the PDF open" onClick={() => setPdfCollapsed(true)}>
          <Icon name={mode === 'side' ? 'chevronLeft' : 'chevronDown'} size={16} />
        </button>
      </div>

      <Tabs />
      {source && !readOnly && panel.tool === 'capture' && <CaptureBar />}
      {source && <Controls source={source} showHidden={showHidden} setShowHidden={setShowHidden} />}
      <div role="tablist" aria-label="PDF panel" className="flex shrink-0 gap-1 border-b border-line px-2 py-1 text-xs">
        {(['pages', 'markup'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={panel.tab === t} onClick={() => setPdfTab(t)} className={`rounded px-2 py-1 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:px-3 ${panel.tab === t ? 'bg-brand/15 font-semibold' : 'hover:bg-bg'}`}>
            {t === 'pages' ? 'Pages' : 'Markup'}
          </button>
        ))}
      </div>
      <Panes showHidden={showHidden} />
      {outline && source && <OutlineLoader source={source} onClose={() => setOutline(false)} />}
      {mode === 'side' && !full && (
        <div role="separator" tabIndex={0} aria-orientation="vertical" aria-label="Resize the PDF panel (drag, or use the left and right arrow keys; double-click for Wide)" aria-valuenow={Math.round(side)} onKeyDown={onDividerKey} onDoubleClick={toggleWide} onPointerDown={startResize} className="absolute inset-y-0 -right-1.5 z-10 w-3 cursor-col-resize touch-none hover:bg-brand/30 focus:bg-brand/40 [@media(pointer:coarse)]:-right-2.5 [@media(pointer:coarse)]:w-5" />
      )}
      {full && <OutlineDrawer />}
    </aside>
  )
}

/** In full screen: a small floating button that slides the Outline over the PDF, so topics can be added from highlights without leaving. */
function OutlineDrawer() {
  const open = useEditor((s) => s.pdfPanel.drawer)
  const toolSide = useEditor((s) => s.pdfPanel.toolSide)
  return (
    <>
      {!open && (
        <button type="button" data-outline-drawer-button className={`absolute bottom-16 z-40 flex h-11 items-center gap-1.5 ${toolSide === 'left' ? 'right-3' : 'left-3'} rounded-full border border-line bg-surface px-3 text-sm font-medium shadow-lg hover:bg-bg`} aria-label="Show the Outline over the PDF" title="Show the Outline" onClick={() => setPdfDrawer(true)}>
          <Icon name="outline" size={16} />
          Outline
        </button>
      )}
      {open && (
        <>
          <div className="absolute inset-0 z-40 bg-black/20" onPointerDown={() => setPdfDrawer(false)} />
          <div role="complementary" aria-label="Outline" data-outline-drawer className="absolute inset-y-0 right-0 z-50 flex w-[min(440px,92%)] flex-col border-l border-line bg-bg shadow-2xl" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2">
              <Icon name="outline" size={16} />
              <span className="flex-1 text-sm font-medium">Outline</span>
              <button type="button" className={btn} aria-label="Hide the Outline" onClick={() => setPdfDrawer(false)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className="relative min-h-0 flex-1 overflow-auto">
              <OutlineView />
            </div>
          </div>
        </>
      )}
    </>
  )
}

const OUTLINE_COL = 'wishtaamaps:pdf-outline-column'
const loadOutlineWidth = () => {
  try {
    const v = Number(localStorage.getItem(OUTLINE_COL))
    return Number.isFinite(v) && v >= 240 ? v : 340
  } catch {
    return 340
  }
}

/**
 * The PDF area: one PDF, or two side by side (one above the other when the area is narrow), each with its own page, zoom and scroll.
 * Clicking a pane makes it the active one, which the tools and the page box work on. On wide areas the Outline can be a third column.
 * The dividers are dragged with a mouse, finger or pen, or moved with the arrow keys.
 */
function Panes({ showHidden }: { showHidden: boolean }) {
  const p = useEditor((s) => s.pdfPanel)
  const sources = useEditor((s) => s.pdf.sources)
  const box = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 1000, h: 600 })
  const [outlineW, setOutlineW] = useState(loadOutlineWidth)
  const outlineWidthNow = useRef(outlineW)
  outlineWidthNow.current = outlineW
  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setDims({ w: el.clientWidth || 1000, h: el.clientHeight || 600 })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const stacked = dims.w < 560
  const wide = p.size !== 'normal' && dims.w >= 900
  const thirdColumn = p.outlineColumn && wide && p.tab === 'pages'
  const split = !!p.other && p.tab === 'pages' && !!sources[p.other]
  const left = p.activeSide === 'left' ? p.sourceId : p.other
  const right = p.activeSide === 'left' ? p.other : p.sourceId
  const order = split ? [left, right] : [p.sourceId]

  const drag = (axis: 'ratio' | 'outline') => (e: React.PointerEvent) => {
    e.preventDefault()
    const el = box.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const move = (ev: PointerEvent) => {
      if (axis === 'ratio') {
        const room = (thirdColumn ? rect.width - outlineW : rect.width) || 1
        setPdfRatio(stacked ? (ev.clientY - rect.top) / (rect.height || 1) : (ev.clientX - rect.left) / room)
      } else setOutlineW(Math.round(Math.min(560, Math.max(240, rect.right - ev.clientX))))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      try {
        localStorage.setItem(OUTLINE_COL, String(outlineWidthNow.current))
      } catch {
        /* not remembered */
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
  const keys = (axis: 'ratio' | 'outline') => (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.03
    const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0
    if (!dir) return
    e.preventDefault()
    if (axis === 'ratio') setPdfRatio(p.ratio + dir * step)
    else setOutlineW((w) => Math.round(Math.min(560, Math.max(240, w - dir * (e.shiftKey ? 60 : 20)))))
  }

  return (
    <div ref={box} data-pdf-area className={`relative flex min-h-0 flex-1 ${stacked ? 'flex-col' : 'flex-row'}`}>
      <div className={`relative flex min-h-0 min-w-0 flex-1 ${stacked ? 'flex-col' : 'flex-row'}`} data-pdf-panes>
        {order.map((id, i) => {
          const s = id ? sources[id] : undefined
          const isActive = id === p.sourceId
          return (
            <div key={id ?? 'none'} className="contents">
              {i === 1 && (
                <div
                  role="separator"
                  tabIndex={0}
                  aria-orientation={stacked ? 'horizontal' : 'vertical'}
                  aria-label="Resize the two PDFs (drag, or use the arrow keys)"
                  aria-valuenow={Math.round(p.ratio * 100)}
                  onPointerDown={drag('ratio')}
                  onKeyDown={keys('ratio')}
                  className={`z-10 shrink-0 touch-none bg-line hover:bg-brand/40 focus:bg-brand/50 ${stacked ? 'h-1.5 cursor-row-resize [@media(pointer:coarse)]:h-3' : 'w-1.5 cursor-col-resize [@media(pointer:coarse)]:w-3'}`}
                />
              )}
              <div
                data-pdf-pane={id ?? ''}
                data-active={isActive ? 'true' : 'false'}
                onPointerDownCapture={() => id && !isActive && focusPdfPane(id)}
                className={`relative flex min-h-0 min-w-0 flex-col ${split ? (isActive ? 'border-t-2 border-brand' : 'border-t-2 border-transparent') : ''}`}
                style={split ? { flex: `${i === 0 ? p.ratio : 1 - p.ratio} 1 0%` } : { flex: '1 1 0%' }}
              >
                <Body key={id ?? 'none'} source={s} showHidden={showHidden} tab={p.tab} active={isActive} />
              </div>
            </div>
          )
        })}
        <SplitDropZones />
      </div>
      {thirdColumn && (
        <>
          <div role="separator" tabIndex={0} aria-orientation="vertical" aria-label="Resize the Outline column (drag, or use the arrow keys)" aria-valuenow={outlineW} onPointerDown={drag('outline')} onKeyDown={keys('outline')} className="z-10 w-1.5 shrink-0 cursor-col-resize touch-none bg-line hover:bg-brand/40 focus:bg-brand/50 [@media(pointer:coarse)]:w-3" />
          <div role="complementary" aria-label="Outline" data-outline-column className="relative min-h-0 shrink-0 overflow-auto bg-bg" style={{ width: outlineW }}>
            <OutlineView />
          </div>
        </>
      )}
    </div>
  )
}

/** The page box and the zoom buttons. */
function Controls({ source, showHidden, setShowHidden }: { source: PdfSource; showHidden: boolean; setShowHidden: (b: boolean) => void }) {
  const page = useEditor((s) => s.pdfPanel.page)
  const zoom = useEditor((s) => s.pdfPanel.zoom)
  const tool = useEditor((s) => s.pdfPanel.tool)
  const readOnly = useEditor((s) => s.readOnly)
  const hiddenCount = useEditor((s) => Object.entries(s.pdf.pageEdits).filter(([k, v]) => v.hidden && k.startsWith(`${source.id}:`)).length)
  const other = useEditor((s) => s.pdfPanel.other)
  const tabs = useEditor((s) => s.pdfPanel.tabs)
  const sync = useEditor((s) => s.pdfPanel.sync)
  const [text, setText] = useState(String(page))
  useEffect(() => setText(String(page)), [page])
  const second = tabs.find((t) => t !== source.id)
  const go = () => {
    const n = Math.min(source.pages, Math.max(1, Math.round(Number(text))))
    if (Number.isFinite(n)) setPdfPage(n)
    setText(String(Number.isFinite(n) ? n : page))
  }
  const percent = zoom === null ? null : Math.round(zoom * 100)
  const fitKind = useEditor((s) => s.pdfPanel.views[source.id]?.fit ?? 'width')
  const twoOn = useEditor((s) => s.pdfPanel.views[source.id]?.two === true)
  // With two pages showing, the arrows step by spread.
  useSyncExternalStore(subscribeViews, viewsVersion)
  const rows = liveViewOf(source.id)?.rows
  const at = rows?.length ? nearestRow(rows, page) : -1
  const atStart = rows?.length ? at <= 0 : page <= 1
  const atEnd = rows?.length ? at >= rows.length - 1 : page >= source.pages
  const spread = rows?.[at]
  const shown = spread && spread.length > 1 ? `${spread[0]}–${spread[spread.length - 1]}` : null
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line px-2 py-1 text-xs text-muted">
      <button type="button" className={btn} aria-label={shown ? 'Previous spread' : 'Previous page'} onClick={() => turnPdf(-1)} disabled={atStart}>‹</button>
      <label className="flex items-center gap-1">
        <span className="sr-only">Page</span>
        <input value={text} onChange={(e) => setText(e.target.value)} onBlur={go} onKeyDown={(e) => e.key === 'Enter' && go()} inputMode="numeric" aria-label="Page number" className="w-10 rounded border border-line bg-surface px-1 py-0.5 text-center text-ink" />
        <span>of {source.pages}</span>
        {shown && <span data-spread-label>(showing {shown})</span>}
      </label>
      <button type="button" className={btn} aria-label={shown ? 'Next spread' : 'Next page'} onClick={() => turnPdf(1)} disabled={atEnd}>›</button>
      <span className="mx-1 h-4 w-px bg-line" />
      <button type="button" className={btn} aria-label="Zoom out" title="Zoom out" onClick={() => setPdfZoom((zoom ?? 1) / 1.25)}><Icon name="zoomOut" size={15} /></button>
      <button type="button" className="min-w-12 rounded px-1 py-1 hover:bg-bg" title="Fit to the width of the panel" onClick={() => setPdfFit('width')} aria-label={percent === null ? `Zoom: fit ${fitKind}` : `Zoom ${percent} percent. Click to fit the width`}>{percent === null ? (fitKind === 'page' ? 'Fit page' : fitKind === 'height' ? 'Fit height' : 'Fit') : `${percent}%`}</button>
      <button type="button" className={btn} aria-label="Zoom in" title="Zoom in" onClick={() => setPdfZoom((zoom ?? 1) * 1.25)}><Icon name="zoomIn" size={15} /></button>
      <button
        type="button"
        data-two-toggle
        className={`${btn} ${twoOn ? 'bg-brand/15 text-ink' : ''}`}
        aria-pressed={twoOn}
        aria-label="Two pages side by side"
        title={twoOn ? 'Back to one page' : 'Two pages side by side, like an open book (the panel goes full screen)'}
        onClick={() => chooseLayout(source.id, { two: !twoOn })}
      >
        <Icon name="openBook" size={15} />
      </button>
      <ViewMenu sourceId={source.id} />
      <span className="mx-1 h-4 w-px bg-line" />
      <button type="button" className={`${btn} ${tool === 'capture' ? 'bg-brand/15 text-ink' : ''}`} aria-pressed={tool === 'capture'} aria-label="Capture area" title="Take part of a page as a picture, as a new topic (works on scans and handwriting)" disabled={readOnly} onClick={() => setPdfTool(tool === 'capture' ? 'select' : 'capture')}>
        <Icon name="camera" size={15} />
        <span className="ml-1 hidden sm:inline">Capture area</span>
      </button>
      <span className="mx-1 h-4 w-px bg-line" />
      <button
        type="button"
        className={`${btn} ${other ? 'bg-brand/15 text-ink' : ''}`}
        aria-pressed={!!other}
        disabled={!other && !second}
        title={other ? 'Back to one PDF' : second ? 'Show two PDFs side by side' : 'Open a second PDF to split the view'}
        onClick={() => (other ? unsplitPdf() : second && splitPdf(second, 'right'))}
      >
        <Icon name="split" size={15} />
        <span className="ml-1 hidden sm:inline">{other ? 'One PDF' : 'Split'}</span>
      </button>
      {other && (
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={sync} onChange={(e) => setPdfSync(e.target.checked)} />
          Sync scrolling
        </label>
      )}
      {hiddenCount > 0 && (
        <label className="ml-auto flex items-center gap-1">
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
          Show {hiddenCount} hidden page{hiddenCount === 1 ? '' : 's'}
        </label>
      )}
    </div>
  )
}

function Menu({ children, onClose, right }: { children: React.ReactNode; onClose: () => void; right?: boolean }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onPointerDown={onClose} />
      <div role="menu" className={`absolute top-full z-50 mt-1 min-w-56 max-w-[min(20rem,80vw)] rounded-ui border border-line bg-surface py-1 text-sm shadow-xl ${right ? 'right-0' : 'left-0'}`}>
        {children}
      </div>
    </>
  )
}
function MenuItem({ children, onClick, active, danger }: { children: React.ReactNode; onClick: () => void; active?: boolean; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`block w-full px-3 py-2 text-left hover:bg-brand/15 ${active ? 'bg-brand/10 font-semibold' : ''} ${danger ? 'text-bad' : ''}`}>
      {children}
    </button>
  )
}

/** The pages (or the markup list) of the chosen PDF, or what to do when it is not here. */
function Body({ source, showHidden, tab, active }: { source: PdfSource | undefined; showHidden: boolean; tab: 'pages' | 'markup'; active: boolean }) {
  const version = useSyncExternalStore(subscribeDevice, getDeviceVersion)
  const [access, setAccess] = useState<PdfAccess | null>(null)
  const [fraction, setFraction] = useState(0)
  useEffect(() => {
    if (!source) return
    let live = true
    setAccess(null)
    setFraction(0)
    void accessPdf(source, (f) => live && setFraction(f)).then((a) => live && setAccess(a))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.hash, version])

  if (!source) return <Empty />
  if (!access) {
    return (
      <div role="status" className="grid flex-1 place-items-center p-6 text-sm text-muted">
        <div className="w-full max-w-xs text-center">
          <p>Opening {source.name}…</p>
          <progress className="mt-2 w-full accent-[rgb(var(--c-brand))]" max={1} value={fraction || undefined} aria-label="Opening the PDF" />
        </div>
      </div>
    )
  }
  if (access.state === 'missing') return <Missing source={source} />
  if (access.state === 'password') return <PasswordForm source={source} wrong={access.wrong} />
  if (access.state === 'error') {
    return (
      <div role="alert" className="grid flex-1 place-items-center p-6 text-center text-sm">
        <div>
          <p className="font-medium text-bad">{access.message}</p>
          <p className="mt-2 text-xs text-muted">Your links and markup are kept. Open the original again with the + button.</p>
        </div>
      </div>
    )
  }
  return tab === 'pages' ? <Viewer source={source} handle={access.handle} showHidden={showHidden} active={active} /> : <MarkupTab source={source} handle={access.handle} />
}

function Empty() {
  const readOnly = useEditor((s) => s.readOnly)
  const [over, setOver] = useState(false)
  return (
    <div
      className={`m-3 grid flex-1 place-items-center rounded-ui border-2 border-dashed p-6 text-center text-sm ${over ? 'border-brand bg-brand/10' : 'border-line'}`}
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (!readOnly) void addPdfFiles([...e.dataTransfer.files])
      }}
    >
      <div>
        <p className="font-medium">No PDF yet</p>
        <p className="mt-1 text-muted">{readOnly ? 'This map has no PDF.' : 'Drop a PDF here, or use the + button to choose one from this device or Google Drive.'}</p>
      </div>
    </div>
  )
}

/** The PDF is in the map but this device does not have the file (it was removed from the device, or the map was opened somewhere else). */
function Missing({ source }: { source: PdfSource }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="grid flex-1 place-items-center p-6 text-center text-sm">
      <div className="max-w-xs">
        <p className="font-medium">This device does not have “{source.name}”.</p>
        <p className="mt-1 text-xs text-muted">The map keeps its links and markup. Choose the same file again to see the pages.</p>
        <div className="mt-3 flex flex-col gap-2">
          <button type="button" className="rounded-ui bg-brand px-3 py-2 font-semibold text-brand-ink" onClick={() => input.current?.click()}>
            Reopen PDF
          </button>
          {source.driveId && (
            <button type="button" disabled={busy} className="rounded-ui border border-line px-3 py-2" onClick={() => (setBusy(true), void refetchFromDrive(source.id).finally(() => setBusy(false)))}>
              {busy ? 'Downloading…' : 'Download again from Google Drive'}
            </button>
          )}
        </div>
        <input ref={input} type="file" accept=".pdf,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && void reopenPdf(source.id, e.target.files[0])} />
      </div>
    </div>
  )
}

/** Gets the open PDF for the outline dialog (it is already open, so this is instant). */
function OutlineLoader({ source, onClose }: { source: PdfSource; onClose: () => void }) {
  const [access, setAccess] = useState<PdfAccess | null>(null)
  useEffect(() => {
    let live = true
    void accessPdf(source).then((a) => live && setAccess(a))
    return () => {
      live = false
    }
  }, [source])
  if (access?.state !== 'ready') return null
  return <OutlineDialog source={source} handle={access.handle} onClose={onClose} />
}

/** The PDF in the map needs its password (passwords are not saved, so it is asked again each session). */
function PasswordForm({ source, wrong }: { source: PdfSource; wrong: boolean }) {
  const [value, setValue] = useState('')
  return (
    <form
      className="grid flex-1 place-items-center p-6 text-center text-sm"
      onSubmit={(e) => {
        e.preventDefault()
        if (value) {
          rememberPassword(source.hash, value)
          bumpDevice()
        }
      }}
    >
      <div className="w-full max-w-xs">
        <p className="font-medium">“{source.name}” is password protected.</p>
        <p className="mt-1 text-xs text-muted">Enter the password. It is not saved.</p>
        <input type="password" autoComplete="off" autoFocus value={value} onChange={(e) => setValue(e.target.value)} aria-label="Password" className="mt-3 w-full rounded border border-line bg-surface px-2 py-2" />
        {wrong && <p role="alert" className="mt-1 text-bad">That password is not right. Try again.</p>}
        <button type="submit" disabled={!value} className="mt-3 w-full rounded-ui bg-brand px-3 py-2 font-semibold text-brand-ink disabled:opacity-50 [@media(pointer:coarse)]:min-h-11">
          Open
        </button>
      </div>
    </form>
  )
}
