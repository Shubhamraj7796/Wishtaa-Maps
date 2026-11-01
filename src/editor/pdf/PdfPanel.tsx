import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { PdfSource } from '@/core/pdf/types'
import { Icon } from '@/ui/icons'
import { useEditor } from '../store'
import { addPdfFile, closePdfPanel, setPdfTool, openPdfFromDrive, pickPdfFromDevice, refetchFromDrive, removePdfFromDevice, removePdfSource, reopenPdf, setPdfPage, showSource, setPdfTab, setPdfZoom, showPdf } from './actions'
import { accessPdf, getDeviceVersion, subscribeDevice, type PdfAccess } from './runtime'
import { OutlineDialog } from './OutlineDialog'
import { Viewer } from './Viewer'
import { MarkupTab, Toolbar } from './tools'

const WIDTH_KEY = 'wishtaamaps:pdf-width'
const HEIGHT_KEY = 'wishtaamaps:pdf-height'
const read = (k: string, d: number) => {
  try {
    const v = Number(localStorage.getItem(k))
    return Number.isFinite(v) && v > 0 ? v : d
  } catch {
    return d
  }
}

const btn = 'grid h-8 min-w-8 shrink-0 place-items-center rounded px-1.5 text-sm hover:bg-bg [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-11'

/**
 * The PDF source panel: beside the Outline and the Map on a computer (drag its edge to resize), a sheet along the bottom on a tablet or
 * phone. It holds the PDF's pages, the markup tools, and the list of markup.
 */
export default function PdfPanel({ mode }: { mode: 'side' | 'sheet' }) {
  const panel = useEditor((s) => s.pdfPanel)
  const sources = useEditor((s) => s.pdf.sources)
  const readOnly = useEditor((s) => s.readOnly)
  const source = panel.sourceId ? sources[panel.sourceId] : undefined
  const list = Object.values(sources).sort((a, b) => a.addedAt - b.addedAt)
  const [size, setSize] = useState(() => (mode === 'side' ? read(WIDTH_KEY, 460) : read(HEIGHT_KEY, 360)))
  const [menu, setMenu] = useState<'open' | 'source' | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [outline, setOutline] = useState(false)
  // Choosing a topic that came from a PDF shows its passage.
  const lastSelected = useEditor((s) => s.selected[s.selected.length - 1])
  const linked = useEditor((s) => (lastSelected ? s.topics[lastSelected]?.source ?? null : null))
  useEffect(() => {
    if (linked && sources[linked.sourceId]) showSource(linked)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked])

  // Dragging the edge.
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault()
    const from = mode === 'side' ? e.clientX : e.clientY
    const was = size
    const move = (ev: PointerEvent) => {
      const d = (mode === 'side' ? ev.clientX : ev.clientY) - from
      const next = mode === 'side' ? Math.min(Math.max(280, was + d), Math.max(320, window.innerWidth - 360)) : Math.min(Math.max(200, was - d), window.innerHeight - 160)
      setSize(next)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      try {
        localStorage.setItem(mode === 'side' ? WIDTH_KEY : HEIGHT_KEY, String(Math.round(sizeRef.current)))
      } catch {
        /* not remembered */
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const sizeRef = useRef(size)
  sizeRef.current = size

  const style = mode === 'side' ? { width: size } : { height: size }
  return (
    <aside
      aria-label="PDF source"
      data-pdf-panel={mode}
      className={`relative flex min-h-0 shrink-0 flex-col bg-surface text-ink ${mode === 'side' ? 'border-r border-line' : 'absolute inset-x-0 bottom-0 z-30 border-t border-line shadow-2xl'}`}
      style={style}
    >
      {mode === 'sheet' && <div role="separator" aria-orientation="horizontal" aria-label="Drag to resize" onPointerDown={startResize} className="grid h-5 shrink-0 cursor-row-resize touch-none place-items-center"><span className="h-1 w-10 rounded-full bg-line" /></div>}
      <div className="flex shrink-0 items-center gap-1 border-b border-line px-1.5 py-1">
        <button type="button" className={btn} aria-label="Close the PDF panel" title="Close" onClick={closePdfPanel}>
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
                <MenuItem key={s.id} onClick={() => (showPdf(s.id), setMenu(null))} active={s.id === panel.sourceId}>
                  {s.name} <span className="text-xs text-muted">· {s.pages} pages</span>
                </MenuItem>
              ))}
              {!list.length && <div className="px-3 py-2 text-xs text-muted">No PDFs in this map yet.</div>}
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
      </div>

      {source && <Controls source={source} showHidden={showHidden} setShowHidden={setShowHidden} />}
      {source && !readOnly && <Toolbar source={source} />}
      <div role="tablist" aria-label="PDF panel" className="flex shrink-0 gap-1 border-b border-line px-2 py-1 text-xs">
        {(['pages', 'markup'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={panel.tab === t} onClick={() => setPdfTab(t)} className={`rounded px-2 py-1 ${panel.tab === t ? 'bg-brand/15 font-semibold' : 'hover:bg-bg'}`}>
            {t === 'pages' ? 'Pages' : 'Markup'}
          </button>
        ))}
      </div>
      <Body source={source} showHidden={showHidden} tab={panel.tab} />
      {outline && source && <OutlineLoader source={source} onClose={() => setOutline(false)} />}
      {mode === 'side' && <div role="separator" aria-orientation="vertical" aria-label="Drag to resize" onPointerDown={startResize} className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none hover:bg-brand/30" />}
    </aside>
  )
}

/** The page box and the zoom buttons. */
function Controls({ source, showHidden, setShowHidden }: { source: PdfSource; showHidden: boolean; setShowHidden: (b: boolean) => void }) {
  const page = useEditor((s) => s.pdfPanel.page)
  const zoom = useEditor((s) => s.pdfPanel.zoom)
  const tool = useEditor((s) => s.pdfPanel.tool)
  const readOnly = useEditor((s) => s.readOnly)
  const hiddenCount = useEditor((s) => Object.entries(s.pdf.pageEdits).filter(([k, v]) => v.hidden && k.startsWith(`${source.id}:`)).length)
  const [text, setText] = useState(String(page))
  useEffect(() => setText(String(page)), [page])
  const go = () => {
    const n = Math.min(source.pages, Math.max(1, Math.round(Number(text))))
    if (Number.isFinite(n)) setPdfPage(n)
    setText(String(Number.isFinite(n) ? n : page))
  }
  const percent = zoom === null ? null : Math.round(zoom * 100)
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line px-2 py-1 text-xs text-muted">
      <button type="button" className={btn} aria-label="Previous page" onClick={() => setPdfPage(page - 1)} disabled={page <= 1}>‹</button>
      <label className="flex items-center gap-1">
        <span className="sr-only">Page</span>
        <input value={text} onChange={(e) => setText(e.target.value)} onBlur={go} onKeyDown={(e) => e.key === 'Enter' && go()} inputMode="numeric" aria-label="Page number" className="w-10 rounded border border-line bg-surface px-1 py-0.5 text-center text-ink" />
        <span>of {source.pages}</span>
      </label>
      <button type="button" className={btn} aria-label="Next page" onClick={() => setPdfPage(Math.min(source.pages, page + 1))} disabled={page >= source.pages}>›</button>
      <span className="mx-1 h-4 w-px bg-line" />
      <button type="button" className={btn} aria-label="Zoom out" title="Zoom out" onClick={() => setPdfZoom((zoom ?? 1) / 1.25)}><Icon name="zoomOut" size={15} /></button>
      <button type="button" className="min-w-12 rounded px-1 py-1 hover:bg-bg" title="Fit to the width of the panel" onClick={() => setPdfZoom(null)} aria-label={percent === null ? 'Zoom: fit width' : `Zoom ${percent} percent. Click to fit the width`}>{percent === null ? 'Fit' : `${percent}%`}</button>
      <button type="button" className={btn} aria-label="Zoom in" title="Zoom in" onClick={() => setPdfZoom((zoom ?? 1) * 1.25)}><Icon name="zoomIn" size={15} /></button>
      <span className="mx-1 h-4 w-px bg-line" />
      <button type="button" className={`${btn} ${tool === 'capture' ? 'bg-brand/15 text-ink' : ''}`} aria-pressed={tool === 'capture'} title="Take part of a page as a picture (works on scans and handwriting)" disabled={readOnly} onClick={() => setPdfTool(tool === 'capture' ? 'select' : 'capture')}>
        <Icon name="camera" size={15} />
        <span className="ml-1 hidden sm:inline">Capture area</span>
      </button>
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
function Body({ source, showHidden, tab }: { source: PdfSource | undefined; showHidden: boolean; tab: 'pages' | 'markup' }) {
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
  return tab === 'pages' ? <Viewer source={source} handle={access.handle} showHidden={showHidden} /> : <MarkupTab source={source} handle={access.handle} />
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
        const f = e.dataTransfer.files[0]
        if (f && !readOnly) void addPdfFile(f)
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
