import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PageInfo, PdfHandle } from '@/core/pdf/engine'
import { rectToShown } from '@/core/pdf/geometry'
import type { PageLines } from '@/core/pdf/text'
import { editKey, NO_EDIT, type PdfSource, type Rect, type Turn } from '@/core/pdf/types'
import { offsets, rowAt, windowFor } from '../outlineLayout'
import { useEditor } from '../store'
import { setPdfPage, setPdfZoom } from './actions'
import { PageView, shownPx, type PageBox } from './PageView'
import { PageLayers } from './layers'
import { SelectionBar } from './SelectionBar'

const GUTTER = 12
const GAP = 14
/** One CSS pixel per point at 100% would be small on a screen (a point is 1/72 inch); this makes 100% about the size on paper. */
const PX_PER_POINT = 96 / 72

const A4: PageInfo = { w: 595, h: 842, own: 0 }

/** The pages of one PDF as a long scrolling column. Only the pages near the screen exist; the rest are empty space of the right height. */
export function Viewer({ source, handle, showHidden }: { source: PdfSource; handle: PdfHandle; showHidden: boolean }) {
  const panel = useEditor((s) => s.pdfPanel)
  const edits = useEditor((s) => s.pdf.pageEdits)
  const tool = useEditor((s) => s.pdfPanel.tool)
  const scroller = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ w: 0, h: 0 })
  const [scrollTop, setScrollTop] = useState(0)
  const [noText, setNoText] = useState(false)
  useEffect(() => {
    let live = true
    setNoText(false)
    void handle.hasText().then((has) => live && setNoText(!has)).catch(() => undefined)
    return () => {
      live = false
    }
  }, [handle])
  const [infos, setInfos] = useState<Map<number, PageInfo>>(new Map())

  // The size of every page, learned in batches in the background (until then a page is taken to be the size of the first).
  useEffect(() => {
    let live = true
    const known = new Map<number, PageInfo>()
    void (async () => {
      for (let n = 1; n <= handle.pages && live; n++) {
        known.set(n, await handle.info(n).catch(() => A4))
        if (n === 1 || n % 25 === 0 || n === handle.pages) {
          if (live) setInfos(new Map(known))
          await new Promise((r) => setTimeout(r, 0))
        }
      }
    })()
    return () => {
      live = false
    }
  }, [handle])

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () => setView({ w: el.clientWidth, h: el.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const viewH = view.h || 700
  const viewW = view.w || 480

  const rotationOf = (n: number): Turn => edits[editKey(source.id, n)]?.rotation ?? 0
  const hiddenOf = (n: number) => (edits[editKey(source.id, n)] ?? NO_EDIT).hidden
  const first = infos.get(1) ?? A4
  const firstShown = rotationOf(1) % 180 ? { w: first.h, h: first.w } : { w: first.w, h: first.h }
  const fit = Math.max(0.2, (viewW - GUTTER * 2) / firstShown.w)
  const scale = panel.zoom ? panel.zoom * PX_PER_POINT : fit

  const pages = useMemo(() => {
    const out: { n: number; box: PageBox; hidden: boolean }[] = []
    for (let n = 1; n <= handle.pages; n++) {
      const hidden = hiddenOf(n)
      if (hidden && !showHidden) continue
      const info = infos.get(n) ?? first
      out.push({ n, hidden, box: { w: info.w, h: info.h, scale, rotation: rotationOf(n) } })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, infos, edits, scale, showHidden, source.id])
  const starts = useMemo(() => offsets(pages.map((p) => shownPx(p.box).h + GAP)), [pages])
  const total = starts[starts.length - 1] as number
  const { start, end } = windowFor(starts, scrollTop, viewH, viewH)

  const frame = useRef(0)
  const lastPage = useRef(1)
  const onScroll = () => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const el = scroller.current
      if (!el) return
      setScrollTop(el.scrollTop)
      const i = Math.min(pages.length - 1, rowAt(starts, el.scrollTop + viewH / 3))
      const n = pages[i]?.n
      if (n && n !== lastPage.current) {
        lastPage.current = n
        setPdfPage(n)
      }
    })
  }
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  // The page was changed from outside (the page box, a link): go there.
  const goTo = (n: number, withinPage = 0) => {
    const el = scroller.current
    const i = pages.findIndex((p) => p.n === n)
    if (!el || i < 0) return
    lastPage.current = n
    el.scrollTop = Math.max(0, (starts[i] as number) + withinPage - GAP / 2)
    setScrollTop(el.scrollTop)
  }
  useEffect(() => {
    if (panel.page !== lastPage.current) goTo(panel.page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.page, pages.length])

  // Following a source link: scroll so the passage is in the upper part of the view, and mark it for a moment.
  const [marked, setMarked] = useState<{ page: number; rect: Rect; at: number } | null>(null)
  useEffect(() => {
    const f = panel.focus
    if (!f || f.sourceId !== source.id) return
    const i = pages.findIndex((p) => p.n === f.page)
    const p = pages[i]
    if (!p) return
    const within = f.rect ? rectToShown(f.rect, p.box.rotation).y * shownPx(p.box).h - viewH / 4 : 0
    goTo(f.page, Math.max(0, within))
    if (f.rect) {
      setMarked({ page: f.page, rect: f.rect, at: f.at })
      const t = setTimeout(() => setMarked((m) => (m?.at === f.at ? null : m)), 3500)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.focus?.at, pages.length])

  // Ctrl + wheel zooms the PDF (not the browser page).
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const now = (panel.zoom ?? fit / PX_PER_POINT) * Math.exp(-e.deltaY * 0.0025)
      setPdfZoom(now)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [panel.zoom, fit])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
    {noText && (
      <p role="status" className="shrink-0 border-b border-line bg-surface px-3 py-1.5 text-xs text-muted">
        This PDF has no text to select (it looks scanned or handwritten). Use <b>Capture area</b> to take a part of a page as a picture.
      </p>
    )}
    <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto bg-neutral-200 dark:bg-neutral-800" data-pdf-scroller aria-label={`${source.name}, ${handle.pages} pages`}>
      <div className="relative" style={{ height: total + GAP, width: Math.max(viewW, ...pages.map((p) => shownPx(p.box).w + GUTTER * 2).slice(start, end)) }}>
        {pages.slice(start, end).map((p, k) => {
          const i = start + k
          return (
            <div key={p.n} className="absolute left-0 right-0" style={{ top: (starts[i] as number) + GAP / 2 }} data-slot={p.n}>
              {p.hidden && <div className="mb-1 text-center text-xs text-muted">Page {p.n} is hidden</div>}
              <Slot source={source} handle={handle} n={p.n} box={p.box} marked={marked?.page === p.n ? marked.rect : null} tool={tool} dim={p.hidden} />
            </div>
          )
        })}
      </div>
    </div>
    <SelectionBar sourceId={source.id} root={scroller} />
    </div>
  )
}

/** One page in the column: it loads the page's text when it comes into view. */
function Slot({ source, handle, n, box, marked, tool, dim }: { source: PdfSource; handle: PdfHandle; n: number; box: PageBox; marked: Rect | null; tool: string; dim: boolean }) {
  const [lines, setLines] = useState<PageLines | null>(null)
  useEffect(() => {
    let live = true
    void handle.text(n).then((l) => live && setLines(l)).catch(() => undefined)
    return () => {
      live = false
    }
  }, [handle, n])
  return (
    <div className={dim ? 'opacity-40' : ''}>
      <PageView handle={handle} n={n} box={box} lines={lines} selectable={tool === 'select' || tool === 'highlight' || tool === 'underline' || tool === 'strike'} focus={marked}>
        <PageLayers source={source} handle={handle} n={n} box={box} lines={lines} />
      </PageView>
    </div>
  )
}
