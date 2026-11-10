import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PageInfo, PdfHandle } from '@/core/pdf/engine'
import { rectToShown } from '@/core/pdf/geometry'
import type { PageLines } from '@/core/pdf/text'
import { editKey, NO_EDIT, type PdfSource, type Rect, type Turn } from '@/core/pdf/types'
import { offsets, rowAt, windowFor } from '../outlineLayout'
import { useEditor } from '../store'
import { reportView, setViewOf } from './actions'
import { buildRows, fitScale, nearestRow, rowIndexOf, rowShape, slotsOf, SPREAD_GAP, twoAllowed, type PageShape } from './spreads'
import { forgetView, publishView } from './spreadState'
import { ViewMenu } from './ViewMenu'
import { PageView, shownPx, type PageBox } from './PageView'
import { PageLayers } from './layers'
import { SelectionBar } from './SelectionBar'
import { FloatingTools } from './FloatingTools'
import { Thumbs } from './Thumbs'
import { hintSeen, markHintSeen } from './uiPrefs'
import { SelectedMarkup } from './tools'
import { pagePoint } from './layers'
import { deleteMarkup, markupAt, markupOfPage, selectMarkup } from './markup'

const GUTTER = 12
const GAP = 14
/** One CSS pixel per point at 100% would be small on a screen (a point is 1/72 inch); this makes 100% about the size on paper. */
const PX_PER_POINT = 96 / 72

const A4: PageInfo = { w: 595, h: 842, own: 0 }

interface Item {
  n: number
  hidden: boolean
  info: PageInfo
  rotation: Turn
  /** The page as shown (turned), in points. */
  shape: PageShape
}
/** One half of a row: a page (with its box), or an empty half (a lone cover or last page). */
interface Cell {
  n: number | null
  hidden: boolean
  box: PageBox | null
  /** Width on screen, in pixels. */
  w: number
}
/** What the viewer shows in one step: a page, or a spread of two. */
interface Row {
  pages: number[]
  cells: Cell[]
  /** Height and width on screen, in pixels. */
  h: number
  w: number
}

/**
 * The pages of one PDF: a long scrolling column (of pages, or of spreads when Two pages is on), or one page or spread at a time (Paged).
 * Only the rows near the screen exist; the rest are empty space of the right height.
 */
export function Viewer({ source, handle, showHidden, active = true }: { source: PdfSource; handle: PdfHandle; showHidden: boolean; active?: boolean }) {
  const panel = useEditor((s) => s.pdfPanel)
  // Each PDF has its own page, zoom, layout and place: this pane reads and writes only its own view.
  const mine = useEditor((s) => s.pdfPanel.views[source.id])
  const page = mine?.page ?? 1
  const zoom = mine?.zoom ?? null
  const paged = mine?.paged === true
  const cover = mine?.cover === true
  const rtl = mine?.rtl === true
  const fitKind = mine?.fit ?? 'width'
  const split = !!panel.other
  const sync = panel.sync && split
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
  // The "looks scanned" note is a small hint, once per PDF: it fades by itself, or can be dismissed.
  const [hint, setHint] = useState(false)
  useEffect(() => {
    if (!noText || hintSeen(source.hash)) return setHint(false)
    setHint(true)
    const t = setTimeout(() => (setHint(false), markHintSeen(source.hash)), 12_000)
    return () => clearTimeout(t)
  }, [noText, source.hash])
  const closeHint = () => (setHint(false), markHintSeen(source.hash))
  // The page chip ("Page 3 of 12") shows when the page changes and fades a moment later.
  const [chip, setChip] = useState(true)
  useEffect(() => {
    setChip(true)
    const t = setTimeout(() => setChip(false), 1800)
    return () => clearTimeout(t)
  }, [page, source.id])
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
  // Two pages as chosen, if the pane is wide enough (the View menu says so when it is not).
  const two = mine?.two === true && twoAllowed(viewW)

  const rotationOf = (n: number): Turn => edits[editKey(source.id, n)]?.rotation ?? 0
  const hiddenOf = (n: number) => (edits[editKey(source.id, n)] ?? NO_EDIT).hidden
  const first = infos.get(1) ?? A4

  const items = useMemo(() => {
    const out: Item[] = []
    for (let n = 1; n <= handle.pages; n++) {
      const hidden = hiddenOf(n)
      if (hidden && !showHidden) continue
      const info = infos.get(n) ?? first
      const rotation = rotationOf(n)
      out.push({ n, hidden, info, rotation, shape: rotation % 180 ? { w: info.h, h: info.w } : { w: info.w, h: info.h } })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, infos, edits, showHidden, source.id])
  const byN = useMemo(() => new Map(items.map((i) => [i.n, i])), [items])
  const rowPages = useMemo(() => buildRows(items.map((i) => i.n), two, cover), [items, two, cover])
  const shapeOf = (row: number[], index: number) => rowShape(slotsOf(row, index, two, cover, rtl).map((n) => (n === null ? null : byN.get(n)?.shape ?? null)))
  // Paged shows one row: the one holding the page.
  const current = paged ? Math.min(rowPages.length - 1, nearestRow(rowPages, page)) : -1
  // "Fit" fits the width of the first row (both pages of a spread), or the whole row when "Fit page" is chosen. Paged fits the row on show.
  const fitRow = paged && current >= 0 ? current : 0
  const fitShape = rowPages[fitRow] ? shapeOf(rowPages[fitRow] as number[], fitRow) : rowShape([{ w: first.w, h: first.h }])
  const fit = Math.max(0.2, fitScale(fitShape, fitKind, viewW, viewH, GUTTER, GAP))
  const scale = zoom ? zoom * PX_PER_POINT : fit

  const rows = useMemo(() => {
    const out: Row[] = rowPages.map((pages, index) => {
      const slots = slotsOf(pages, index, two, cover, rtl)
      const shape = shapeOf(pages, index)
      const cells: Cell[] = slots.map((n, k) => {
        const it = n === null ? undefined : byN.get(n)
        const w = (shape.widths[k] as number) * scale
        if (!it) return { n: null, hidden: false, box: null, w }
        return { n: it.n, hidden: it.hidden, w, box: { w: it.info.w, h: it.info.h, scale: scale * (shape.factors[k] as number), rotation: it.rotation } }
      })
      return { pages, cells, h: shape.h * scale, w: shape.w * scale + (cells.length === 2 ? SPREAD_GAP : 0) }
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowPages, byN, scale, two, cover, rtl])
  const boxes = useMemo(() => new Map(rows.flatMap((r) => r.cells.flatMap((c) => (c.n !== null && c.box ? [[c.n, c.box] as const] : [])))), [rows])
  const starts = useMemo(() => offsets(rows.map((r) => r.h + GAP)), [rows])
  const total = starts[starts.length - 1] as number
  // Paged shows one row; otherwise the rows near the screen.
  const { start, end } = paged ? { start: Math.max(0, current), end: Math.max(0, current) + (rows.length ? 1 : 0) } : windowFor(starts, scrollTop, viewH, viewH)
  const contentH = paged ? Math.max(viewH, (rows[current]?.h ?? 0) + GAP) : total + GAP
  const topOf = (i: number) => (paged ? Math.max(GAP / 2, (contentH - (rows[i]?.h ?? 0)) / 2) : (starts[i] as number) + GAP / 2)

  // What this pane shows, for the page buttons and the View menu.
  useEffect(() => {
    publishView(source.id, { rows: rowPages, paneW: viewW, two })
  }, [source.id, rowPages, viewW, two])
  useEffect(() => () => forgetView(source.id), [source.id])

  /** Paged: the previous or next page or spread. */
  const turn = (dir: 1 | -1) => {
    const t = rowPages[Math.max(0, current) + dir]
    if (t) reportView(source.id, { page: t[0] as number, anchor: { n: t[0] as number, frac: 0 } })
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement
    const id = useEditor.getState().pdfPanel.markId
    if (id && (e.key === 'Delete' || e.key === 'Backspace') && !target.closest('textarea,input')) {
      e.preventDefault()
      deleteMarkup(id)
    }
    if (e.key === 'Escape') selectMarkup(null)
    // Paged: the arrow keys turn the page when the page fits (zoomed in, they scroll it); Page Up and Down when it fits top to bottom.
    if (paged && !e.ctrlKey && !e.metaKey && !e.altKey && !target.closest('textarea,input,select')) {
      const el = scroller.current
      const fitsX = !el || el.scrollWidth <= el.clientWidth + 1
      const fitsY = !el || el.scrollHeight <= el.clientHeight + 1
      const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
      const back = rtl ? 'ArrowRight' : 'ArrowLeft'
      const dir = (e.key === forward && fitsX) || (e.key === 'PageDown' && fitsY) ? 1 : (e.key === back && fitsX) || (e.key === 'PageUp' && fitsY) ? -1 : 0
      if (dir) {
        e.preventDefault()
        e.stopPropagation() // the arrow keys turn this page; they do not move the selection in the map
        turn(dir)
      }
    }
  }

  // The place in the document (a page and how far down it), so a change of width, zoom or layout keeps the same spot in view.
  const anchor = useRef<{ n: number; frac: number } | null>(null)
  useEffect(() => {
    if (paged) anchor.current = { n: page, frac: 0 } // leaving Paged comes back to this page
  }, [paged, page])
  const placeAnchor = (a: { n: number; frac: number }) => {
    const el = scroller.current
    const i = rowIndexOf(rowPages, a.n)
    if (!el || i < 0) return
    el.scrollTop = (starts[i] as number) + a.frac * ((starts[i + 1] as number) - (starts[i] as number) - GAP)
    setScrollTop(el.scrollTop)
  }
  const prevScale = useRef(scale)
  useLayoutEffect(() => {
    const a = anchor.current
    if (prevScale.current === scale || !scroller.current || !a) {
      prevScale.current = scale
      return
    }
    prevScale.current = scale
    if (!paged) placeAnchor(a)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale])
  // A change of layout (Two pages, Show cover page, right to left, Paged): the same place, now in the new arrangement.
  const layoutKey = `${two}|${cover}|${rtl}|${paged}`
  const prevLayout = useRef(layoutKey)
  useLayoutEffect(() => {
    if (prevLayout.current === layoutKey) return
    prevLayout.current = layoutKey
    const el = scroller.current
    if (!el) return
    if (paged) {
      el.scrollTop = 0
      el.scrollLeft = 0
      setScrollTop(0)
      lastPage.current = page
    } else placeAnchor(anchor.current ?? { n: page, frac: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey])

  const readOnly = useEditor((s) => s.readOnly)
  const frame = useRef(0)
  const lastPage = useRef(1)
  const onScroll = () => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const el = scroller.current
      if (!el) return
      setScrollTop(el.scrollTop)
      if (paged) return // the page is the one that was turned to; scrolling only moves around a zoomed page
      const at = Math.min(rows.length - 1, rowAt(starts, el.scrollTop))
      const row = rows[at]
      if (row) anchor.current = { n: row.pages[0] as number, frac: Math.max(0, Math.min(1, (el.scrollTop - (starts[at] as number)) / Math.max(1, (starts[at + 1] as number) - (starts[at] as number) - GAP))) }
      const i = Math.min(rows.length - 1, rowAt(starts, el.scrollTop + viewH / 3))
      const n = rows[i]?.pages[0]
      const moved = performance.now() > quiet.current // a scroll this pane was told to make (Sync scrolling) is not reported back
      if (n && n !== lastPage.current) {
        lastPage.current = n
        reportView(source.id, { page: n })
      }
      // The place on the page is remembered when scrolling pauses (and at once while another pane follows this one).
      if (moved && anchor.current) {
        if (sync) reportView(source.id, { anchor: anchor.current })
        else {
          if (idle.current) clearTimeout(idle.current)
          const a = anchor.current
          idle.current = setTimeout(() => reportView(source.id, { anchor: a }), 250)
        }
      }
    })
  }
  const quiet = useRef(0)
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current)
      if (idle.current) clearTimeout(idle.current)
    },
    []
  )

  // Back in this tab (or after a reload): the place it was left, then Sync scrolling requests from the other pane.
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current || !rows.length || !scroller.current) return
    restored.current = true
    if (paged) return // the page is already the place
    const a = mine?.anchor
    if (a) goToAnchor(a.n, a.frac)
    else if (page > 1) {
      anchor.current = { n: page, frac: 0 }
      goTo(page)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length])
  const goToAnchor = (n: number, frac: number) => {
    const el = scroller.current
    const i = rowIndexOf(rowPages, n)
    if (!el || i < 0) return
    if (paged) {
      // Another pane (Sync scrolling) asks this one to show a page: turn to the spread that has it.
      const target = rowPages[i]?.[0] as number
      lastPage.current = target
      if (target !== page) setViewOf(source.id, { page: target, anchor: undefined })
      return
    }
    lastPage.current = n
    anchor.current = { n, frac } // so a change of width or zoom that follows (the pane is measured just after it appears) keeps this place
    el.scrollTop = (starts[i] as number) + frac * ((starts[i + 1] as number) - (starts[i] as number) - GAP)
    setScrollTop(el.scrollTop)
  }
  const syncAt = mine?.syncTo?.at
  useEffect(() => {
    const s = mine?.syncTo
    if (!s) return
    quiet.current = performance.now() + 200
    goToAnchor(s.n, s.frac)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncAt])

  // The page was changed from outside (the page box, the page buttons, a link): go there.
  const goTo = (n: number, withinPage = 0) => {
    const el = scroller.current
    const i = rowIndexOf(rowPages, n)
    if (!el || i < 0) return
    lastPage.current = n
    el.scrollTop = paged ? Math.max(0, withinPage) : Math.max(0, (starts[i] as number) + withinPage - GAP / 2)
    if (paged) el.scrollLeft = 0
    setScrollTop(el.scrollTop)
  }
  useEffect(() => {
    if (restored.current && page !== lastPage.current) goTo(page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, rows.length])

  // Following a source link: scroll so the passage is in the upper part of the view, and mark it for a moment.
  const [marked, setMarked] = useState<{ page: number; rect: Rect; at: number } | null>(null)
  useEffect(() => {
    const f = panel.focus
    if (!f || f.sourceId !== source.id) return
    const box = boxes.get(f.page)
    if (!box) return
    const within = f.rect ? rectToShown(f.rect, box.rotation).y * shownPx(box).h - viewH / 4 : 0
    goTo(f.page, Math.max(0, within))
    if (f.rect) {
      setMarked({ page: f.page, rect: f.rect, at: f.at })
      const t = setTimeout(() => setMarked((m) => (m?.at === f.at ? null : m)), 3500)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.focus?.at, rows.length])

  // Ctrl + wheel zooms the PDF (not the browser page).
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const now = (zoom ?? fit / PX_PER_POINT) * Math.exp(-e.deltaY * 0.0025)
      setViewOf(source.id, { zoom: Math.min(4, Math.max(0.25, now)) })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoom, fit, source.id])

  const here = rowPages[Math.max(0, nearestRow(rowPages, page))] ?? [page]
  const chipText = here.length > 1 ? `Pages ${here[0]}–${here[here.length - 1]} of ${handle.pages}` : `Page ${page} of ${handle.pages}`
  const thumbRatio = first.h / Math.max(1, first.w)

  return (
    <div className="relative flex min-h-0 flex-1 flex-row">
    {panel.thumbs && <Thumbs handle={handle} pages={items.map((i) => i.n)} page={page} ratio={thumbRatio} />}
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
    {noText && hint && (
      <p role="status" data-scan-hint className="absolute left-1/2 top-2 z-20 flex max-w-[92%] -translate-x-1/2 items-start gap-2 rounded-ui border border-line bg-surface px-3 py-1.5 text-xs text-muted shadow-lg">
        <span>
          This PDF has no text to select (it looks scanned or handwritten). Use <b>Capture area</b> to take a part of a page as a picture.
        </span>
        <button type="button" aria-label="Dismiss this hint" className="-my-1 grid h-7 w-7 shrink-0 place-items-center rounded hover:bg-bg [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" onClick={closeHint}>
          ✕
        </button>
      </p>
    )}
    <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto bg-neutral-200 dark:bg-neutral-800" data-pdf-scroller data-layout={two ? 'two' : 'single'} data-paged={paged ? 'true' : 'false'} tabIndex={0} onKeyDown={onKeyDown} aria-label={`${source.name}, ${handle.pages} pages`}>
      <div className="relative" style={{ height: contentH, width: Math.max(viewW, ...rows.slice(start, end).map((r) => r.w + GUTTER * 2)) }}>
        {rows.slice(start, end).map((r, k) => {
          const i = start + k
          return (
            <div key={r.pages.join('-')} className="absolute left-0 right-0 flex items-start justify-center" style={{ top: topOf(i), gap: r.cells.length === 2 ? SPREAD_GAP : 0 }} data-row={r.pages.join('-')}>
              {r.cells.map((c, j) =>
                c.n === null || !c.box ? (
                  <div key={`empty-${j}`} style={{ width: c.w }} aria-hidden="true" />
                ) : (
                  <div key={c.n} data-slot={c.n}>
                    {c.hidden && <div className="mb-1 text-center text-xs text-muted">Page {c.n} is hidden</div>}
                    <Slot source={source} handle={handle} n={c.n} box={c.box} marked={marked?.page === c.n ? marked.rect : null} tool={tool} dim={c.hidden} />
                  </div>
                )
              )}
            </div>
          )
        })}
      </div>
    </div>
    {split && (
      <div className="absolute right-4 top-2 z-20">
        <ViewMenu sourceId={source.id} compact />
      </div>
    )}
    <div aria-hidden="true" data-page-chip className={`pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/65 px-3 py-1 text-xs text-white shadow transition-opacity duration-500 ${chip ? 'opacity-100' : 'opacity-0'}`}>
      {chipText}
    </div>
    <SelectionBar sourceId={source.id} root={scroller} />
    {!readOnly && active && <SelectedMarkup />}
    {!readOnly && active && panel.markupBar && <FloatingTools source={source} />}
    </div>
    </div>
  )
}

/** One page of a row: it loads the page's text when it comes into view. */
function Slot({ source, handle, n, box, marked, tool, dim }: { source: PdfSource; handle: PdfHandle; n: number; box: PageBox; marked: Rect | null; tool: string; dim: boolean }) {
  const [lines, setLines] = useState<PageLines | null>(null)
  useEffect(() => {
    let live = true
    // A page flying past during a fast scroll does not load its text; one that stays does.
    const timer = setTimeout(() => void handle.text(n).then((l) => live && setLines(l)).catch(() => undefined), 140)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [handle, n])
  const all = useEditor((s) => s.pdf.markup)
  // Clicking a piece of markup (with the Select tool) chooses it; clicking elsewhere lets it go.
  const choose = (e: React.MouseEvent<HTMLDivElement>) => {
    if (tool !== 'select' || !window.getSelection()?.isCollapsed) return
    const el = e.currentTarget.querySelector('[data-page]')
    if (!el || (e.target as Element).closest('[data-link],button,textarea,input')) return
    const hit = markupAt(markupOfPage(all, source.id, n), pagePoint(e, el, box.rotation))
    selectMarkup(hit?.id ?? null)
  }
  return (
    <div className={dim ? 'opacity-40' : ''} onClick={choose}>
      <PageView handle={handle} n={n} box={box} lines={lines} selectable={tool === 'select' || tool === 'highlight' || tool === 'underline' || tool === 'strike'} focus={marked}>
        <PageLayers source={source} handle={handle} n={n} box={box} lines={lines} />
      </PageView>
    </div>
  )
}
