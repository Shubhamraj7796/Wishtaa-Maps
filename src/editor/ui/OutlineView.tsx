import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { addChild, addSibling, deleteTopics, moveTopic, reorder, setCollapsed, setText } from '@/core/model/commands'
import type { TopicImage } from '@/core/model/topic'
import { buildIndex, childrenOf } from '@/core/model/tree'
import { computeNumbers } from '@/core/numbering'
import { Icon } from '@/ui/icons'
import { selectOnly, setOutlineZoom, toggleFold } from '../actions'
import { showPreview } from '../content'
import { noteViewportActivity, removeImage, replaceImage, useImageUrl, usePictureColor, useUpgrade, useViewMoving } from '../images'
import { mapDoc } from '../mapdoc'
import { modeFor, resolveDrop, type DropMode } from '../outlineDrop'
import { offsets, pictureBox, rowAt, rowHeight, ROW_H, scrollToShow, windowFor, type PictureBox } from '../outlineLayout'
import { openAddPicture } from '../pictures/flow'
import { viewTopics } from '../scene'
import { useEditor } from '../store'
import { MarkBadge } from './MarkBadge'

interface Row {
  id: string
  depth: number
  hasKids: boolean
}

/** A line break in a topic's text is shown as a space here (the box below is one line); the stored text is not touched by it. */
export const oneLine = (text: string) => text.replace(/\s*\r?\n\s*/g, ' ')

interface RowProps {
  row: Row
  top: number
  height: number
  text: string
  image: TopicImage | null
  box: PictureBox | null
  marks: string[]
  collapsed: boolean
  number: string
  selected: boolean
  readOnly: boolean
  /** How big the outline is shown (1 = 100%). */
  zoom: number
  dragging: boolean
  onDragStart: (e: React.PointerEvent, id: string) => void
  register: (id: string, el: HTMLInputElement | null) => void
  onKey: (e: React.KeyboardEvent<HTMLInputElement>, row: Row) => void
}

/** The picture under a topic: the small version first, the full one only when it is shown large and the list is still. */
function OutlinePicture({ topicId, image, box, label, selected, readOnly, zoom }: { topicId: string; image: TopicImage; box: PictureBox; label: string; selected: boolean; readOnly: boolean; zoom: number }) {
  const moving = useViewMoving()
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  const wantsFull = box.w * zoom * dpr > 300 // the small version is 256 px wide
  const upgraded = useUpgrade(wantsFull && !moving)
  const { url, missing, pending } = useImageUrl(image.imageId, { thumb: !(wantsFull && upgraded) })
  const color = usePictureColor(image.imageId, true)
  const last = useRef<{ id: string; url: string } | null>(null)
  if (url) last.current = { id: image.imageId, url }
  const shown = url ?? (last.current?.id === image.imageId ? last.current.url : null)
  return (
    <div className="relative" style={{ width: box.w, height: box.h }} data-outline-picture={topicId}>
      <button
        type="button"
        aria-label={`Open picture: ${label}`}
        title="Open the picture larger"
        onClick={() => {
          selectOnly(topicId)
          useEditor.setState({ imageSelected: topicId })
          showPreview(image.imageId)
        }}
        className="block h-full w-full overflow-hidden rounded-md border border-line"
        style={{ backgroundColor: color ?? 'rgba(128,128,128,0.2)', contain: 'layout paint' }}
      >
        {shown ? (
          <img src={shown} alt={label} decoding="async" draggable={false} className="block h-full w-full object-contain" />
        ) : (
          <span className="grid h-full w-full place-items-center px-2 text-center text-xs text-muted">{missing ? 'Picture missing' : pending ? 'Picture is still uploading' : ''}</span>
        )}
      </button>
      {selected && !readOnly && (
        <div className="absolute right-1 top-1 flex gap-1">
          <button type="button" aria-label="Replace the picture" title="Replace the picture" onClick={() => void replaceImage(topicId)} className="grid h-7 w-7 place-items-center rounded-full bg-surface text-ink shadow">
            <Icon name="replace" size={14} />
          </button>
          <button type="button" aria-label="Delete the picture" title="Delete the picture" onClick={() => removeImage(topicId)} className="grid h-7 w-7 place-items-center rounded-full bg-surface text-bad shadow">
            <Icon name="trash" size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

const OutlineRow = memo(function OutlineRow({ row, top, height, text, image, box, marks, collapsed, number, selected, readOnly, zoom, dragging, onDragStart, register, onKey }: RowProps) {
  const shown = oneLine(text)
  const label = shown.trim() || 'Picture'
  return (
    <li
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={selected}
      aria-expanded={row.hasKids ? !collapsed : undefined}
      data-row={row.id}
      className={`absolute left-0 right-0 overflow-hidden rounded-ui ${selected ? 'bg-brand/10' : ''} ${dragging ? 'opacity-40' : ''}`}
      style={{ top, height }}
    >
      {/* The row is drawn at 100% and scaled as a whole, so text, buttons and pictures zoom together. */}
      <div style={{ width: `${100 / zoom}%`, transform: zoom === 1 ? undefined : `scale(${zoom})`, transformOrigin: '0 0', paddingLeft: row.depth * 22 + 4, paddingRight: 8 }}>
      <div className="flex items-center gap-1" style={{ height: ROW_H }}>
        {!readOnly && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Drag to reorder"
            title="Drag to reorder (or Alt+Up and Alt+Down)"
            data-drag-handle={row.id}
            onPointerDown={(e) => onDragStart(e, row.id)}
            className={`grid h-7 w-6 shrink-0 cursor-grab touch-none select-none place-items-center rounded text-muted hover:bg-bg [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-9 ${selected ? '' : 'opacity-40'}`}
          >
            ⠿
          </span>
        )}
        <button
          type="button"
          aria-label={row.hasKids ? (collapsed ? 'Expand' : 'Collapse') : 'No sub topics'}
          disabled={!row.hasKids}
          onClick={() => (readOnly ? toggleFold(row.id) : setCollapsed(mapDoc, [row.id], !collapsed))}
          className="grid h-7 w-6 shrink-0 place-items-center rounded text-muted hover:bg-bg disabled:opacity-0"
        >
          <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={15} />
        </button>
        <span className="grid h-7 w-4 shrink-0 place-items-center" aria-hidden="true">
          <span className="h-1.5 w-1.5 rounded-full bg-muted" />
        </span>
        {marks.map((m, i) => (
          <MarkBadge key={`${m}-${i}`} mark={m} size={16} />
        ))}
        {number && <span className="shrink-0 text-sm text-muted">{number}</span>}
        <input
          key={`${row.id}:${text}`}
          ref={(el) => register(row.id, el)}
          defaultValue={shown}
          readOnly={readOnly}
          placeholder={image ? 'Picture' : 'Empty topic'}
          aria-label={`Topic text, level ${row.depth + 1}`}
          onFocus={() => selectOnly(row.id)}
          onBlur={(e) => {
            if (!readOnly && e.currentTarget.value !== shown && e.currentTarget.value.trim()) setText(mapDoc, row.id, e.currentTarget.value)
          }}
          onKeyDown={(e) => onKey(e, row)}
          className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:italic placeholder:text-muted"
        />
        {selected && !readOnly && (
          <button
            type="button"
            aria-label={image ? 'Replace picture' : 'Add picture'}
            title={image ? 'Replace the picture' : 'Add a picture'}
            onClick={() => openAddPicture(image ? { kind: 'replace', id: row.id } : { kind: 'topic', id: row.id })}
            className="grid h-7 w-7 shrink-0 place-items-center rounded text-muted hover:bg-bg hover:text-ink"
          >
            <Icon name="image" size={15} />
          </button>
        )}
      </div>
      {image && box && (
        <div style={{ paddingLeft: 28 + 24 + 16 + 8, paddingTop: 2 }}>
          <OutlinePicture topicId={row.id} image={image} box={box} label={label} selected={selected} readOnly={readOnly} zoom={zoom} />
        </div>
      )}
      </div>
    </li>
  )
})

/** Where each file's outline was scrolled to, so switching to the map and back puts you where you were. */
const scrolled = new Map<string, number>()

/**
 * The whole map as an editable indented list, with the pictures of picture-only topics shown under them. It is the same data as
 * the map, never a copy: the order is the order of the children (a branch direction only changes where the map draws them), edits
 * show up in the map at once and the other way round, and the selection and the fold state are shared. Only the rows near the screen
 * are drawn, so a map with hundreds of pictures scrolls smoothly.
 */
export function OutlineView() {
  const saved = useEditor((s) => s.topics)
  const readOnly = useEditor((s) => s.readOnly)
  const folding = useEditor((s) => s.viewCollapsed)
  const topics = useMemo(() => viewTopics(saved, readOnly, folding), [saved, readOnly, folding])
  const rootId = useEditor((s) => s.rootId)
  const fileId = useEditor((s) => s.fileId) ?? ''
  const selected = useEditor((s) => s.selected)
  const numbering = useEditor((s) => s.settings.numbering)
  const zoom = useEditor((s) => s.outlineZoom)
  const refs = useRef(new Map<string, HTMLInputElement>())
  const scroller = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [view, setView] = useState({ h: 0, w: 0 })
  const [drag, setDrag] = useState<{ id: string; over: number; mode: DropMode } | null>(null)

  const { rows } = useMemo(() => {
    const idx = buildIndex(topics)
    const out: Row[] = []
    const walk = (id: string, depth: number) => {
      const kids = childrenOf(idx, id)
      out.push({ id, depth, hasKids: kids.length > 0 })
      if (!topics[id]?.collapsed) kids.forEach((k) => walk(k.id, depth + 1))
    }
    if (topics[rootId]) walk(rootId, 0)
    for (const f of childrenOf(idx, null)) if (f.id !== rootId) walk(f.id, 0)
    return { rows: out }
  }, [topics, rootId])
  const numbers = useMemo(() => (numbering ? computeNumbers(topics, rootId) : new Map<string, string>()), [numbering, topics, rootId])
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  // The size of the window and of the list (a phone shows pictures at the full width of the row).
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () => setView({ h: el.clientHeight, w: el.clientWidth })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const viewH = view.h || 800
  // The "page": 768 px wide at 100% (less on a phone: the width of the screen). Zooming scales the whole page, like a document viewer;
  // when it is wider than the window you scroll sideways, and when it is narrower it stays centred.
  const pageW = Math.min(768, Math.max(240, (view.w || 800) - 32))
  const contentW = Math.max(view.w || 0, pageW * zoom + 32)

  // Every row's height, and where each row starts. A picture row is as tall as its picture.
  const boxes = useMemo(() => rows.map((r) => {
    const image = topics[r.id]?.image
    return image ? pictureBox(image, pageW, r.depth) : null // laid out at 100% on the page, then the page is scaled
  }), [rows, topics, pageW])
  const starts = useMemo(() => offsets(boxes.map((b) => rowHeight(b) * zoom)), [boxes, zoom])
  const total = starts[starts.length - 1] as number
  const listTop = list.current?.offsetTop ?? 0
  const { start, end } = windowFor(starts, scrollTop - listTop, viewH)
  const indexOf = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows])

  // Scrolling: remember where it is, and tell the pictures the view is moving (small versions while it moves).
  const frame = useRef(0)
  const onScroll = () => {
    noteViewportActivity()
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const el = scroller.current
      if (!el) return
      setScrollTop(el.scrollTop)
      scrolled.set(fileId, el.scrollTop)
    })
  }
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  // Zooming keeps the point under the cursor (or between two fingers, or the middle of the window) where it is, like a document viewer.
  const lastZoom = useRef(zoom)
  const anchor = useRef<{ x: number; y: number } | null>(null)
  useLayoutEffect(() => {
    const el = scroller.current
    const was = lastZoom.current
    lastZoom.current = zoom
    if (!el || was === zoom) return
    const f = zoom / was
    const rect = el.getBoundingClientRect()
    const ax = anchor.current ? anchor.current.x - rect.left : el.clientWidth / 2
    const ay = anchor.current ? anchor.current.y - rect.top : el.clientHeight / 2
    anchor.current = null
    const viewW = el.clientWidth || view.w || 0
    const leftOf = (z: number) => (Math.max(viewW, pageW * z + 32) - pageW * z) / 2 // where the page starts (it is centred when narrower)
    el.scrollTop = Math.max(0, (el.scrollTop + ay - listTop) * f + listTop - ay)
    el.scrollLeft = Math.max(0, (el.scrollLeft + ax - leftOf(was)) * f + leftOf(zoom) - ax)
    setScrollTop(el.scrollTop)
    scrolled.set(fileId, el.scrollTop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom])

  // Ctrl + wheel (and a trackpad pinch, which arrives the same way) zooms. A plain wheel scrolls.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      anchor.current = { x: e.clientX, y: e.clientY }
      setOutlineZoom(useEditor.getState().outlineZoom * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.04 : 0.0025)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Two fingers on a touch screen zoom too.
  const pinch = useRef<{ d: number; z: number } | null>(null)
  const distance = (t: React.TouchList) => Math.hypot((t[0]?.clientX ?? 0) - (t[1]?.clientX ?? 0), (t[0]?.clientY ?? 0) - (t[1]?.clientY ?? 0))
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) pinch.current = { d: distance(e.touches), z: useEditor.getState().outlineZoom }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !pinch.current || pinch.current.d < 1) return
    anchor.current = { x: ((e.touches[0]?.clientX ?? 0) + (e.touches[1]?.clientX ?? 0)) / 2, y: ((e.touches[0]?.clientY ?? 0) + (e.touches[1]?.clientY ?? 0)) / 2 }
    setOutlineZoom((pinch.current.z * distance(e.touches)) / pinch.current.d)
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinch.current = null
  }

  // Back in the outline: where it was (unless the selected topic is out of sight; then it is shown).
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    el.scrollTop = scrolled.get(fileId) ?? 0
    setScrollTop(el.scrollTop)
  }, [fileId])

  const showRow = (id: string) => {
    const el = scroller.current
    const i = indexOf.get(id)
    if (!el || i === undefined) return
    const to = scrollToShow(starts, i, el.scrollTop - listTop, el.clientHeight || viewH)
    if (to !== null) {
      el.scrollTop = to + listTop
      setScrollTop(el.scrollTop)
      scrolled.set(fileId, el.scrollTop)
    }
  }

  // A topic selected in the map (or anywhere else) is selected here too, and scrolled into view. Typing in the outline does not jump.
  const sole = selected.length === 1 ? (selected[0] as string) : null
  useLayoutEffect(() => {
    if (!sole) return
    if (refs.current.get(sole) && refs.current.get(sole) === document.activeElement) return
    showRow(sole)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sole, rows.length])

  // Moving to a row with the keyboard: scroll it into view, then focus it once it is drawn.
  useEffect(() => {
    if (!pending) return
    const el = refs.current.get(pending)
    if (el) {
      showRow(pending)
      el.focus()
      el.select()
      setPending(null)
    } else if (indexOf.has(pending)) showRow(pending)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, rows, start, end])

  const register = useMemo(
    () => (id: string, el: HTMLInputElement | null) => {
      if (el) refs.current.set(id, el)
      else refs.current.delete(id)
    },
    []
  )

  const commit = (e: React.KeyboardEvent<HTMLInputElement>, id: string) => {
    const v = e.currentTarget.value
    const was = oneLine(topics[id]?.text ?? '')
    if (v.trim() && v !== was) setText(mapDoc, id, v)
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, row: Row) => {
    const t = topics[row.id]
    if (!t) return
    if (readOnly) {
      // Reading: the arrow keys still move through the topics, nothing else does anything.
      const at = rowsRef.current.findIndex((r) => r.id === row.id)
      const go = (to: number) => {
        const target = rowsRef.current[to]
        if (target) setPending(target.id)
      }
      if (e.key === 'ArrowUp') { e.preventDefault(); go(at - 1) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); go(at + 1) }
      else if (e.key === 'ArrowRight' && row.hasKids && t.collapsed) { e.preventDefault(); toggleFold(row.id) }
      else if (e.key === 'ArrowLeft' && row.hasKids && !t.collapsed) { e.preventDefault(); toggleFold(row.id) }
      else if (e.key === 'Escape') e.currentTarget.blur()
      return
    }
    const rowsNow = rowsRef.current
    const i = rowsNow.findIndex((r) => r.id === row.id)
    const idx = buildIndex(topics)
    const siblings = t.parentId && topics[t.parentId] ? childrenOf(idx, t.parentId) : []
    const pos = siblings.findIndex((s) => s.id === row.id)

    if (e.key === 'Enter') {
      e.preventDefault()
      commit(e, row.id)
      if (e.ctrlKey && row.hasKids) {
        setCollapsed(mapDoc, [row.id], !t.collapsed) // Ctrl+Enter folds or unfolds
        return
      }
      const id = row.id === rootId || !t.parentId ? addChild(mapDoc, row.id) : addSibling(mapDoc, row.id)
      if (id) setPending(id)
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      commit(e, row.id)
      const prev = siblings[pos - 1]
      if (prev && moveTopic(mapDoc, row.id, prev.id)) setPending(row.id)
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      commit(e, row.id)
      const parent = t.parentId ? topics[t.parentId] : undefined
      if (parent?.parentId) {
        const uncles = childrenOf(idx, parent.parentId)
        const at = uncles.findIndex((u) => u.id === parent.id)
        if (moveTopic(mapDoc, row.id, parent.parentId, at + 1)) setPending(row.id)
      }
    } else if (e.key === 'Backspace' && e.currentTarget.value === '' && row.id !== rootId && !row.hasKids) {
      e.preventDefault()
      deleteTopics(mapDoc, [row.id])
      const before = rowsNow[i - 1]
      if (before) setPending(before.id)
    } else if (e.key === 'ArrowUp' && !e.altKey) {
      e.preventDefault()
      commit(e, row.id)
      const target = rowsNow[i - 1]
      if (target) setPending(target.id)
    } else if (e.key === 'ArrowDown' && !e.altKey) {
      e.preventDefault()
      commit(e, row.id)
      const target = rowsNow[i + 1]
      if (target) setPending(target.id)
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey) {
      e.preventDefault()
      commit(e, row.id)
      if (reorder(mapDoc, row.id, e.key === 'ArrowUp' ? -1 : 1)) setPending(row.id)
    } else if (e.key === 'Escape') {
      e.currentTarget.blur()
    }
  }

  // Dragging a row by its grip (a mouse or a finger): a line shows where it will land, the list scrolls at its edges, and letting go
  // moves the topic: one undo step, the same command as in the map. Escape or a cancelled touch puts it back.
  const startsRef = useRef(starts)
  startsRef.current = starts
  const topicsRef = useRef(topics)
  topicsRef.current = topics
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const onDragStart = (e: React.PointerEvent, id: string) => {
    if (readOnly || e.button > 0) return
    e.preventDefault()
    e.stopPropagation()
    const box = scroller.current
    const ul = list.current
    if (!box || !ul) return
    let over = indexOf.get(id) ?? 0
    let mode: DropMode = 'before'
    let velocity = 0
    let frame2 = 0
    const point = (ev: PointerEvent) => {
      const r = ul.getBoundingClientRect()
      const y = ev.clientY - r.top - 8
      const i = Math.min(rowsRef.current.length - 1, Math.max(0, rowAt(startsRef.current, y)))
      const row = rowsRef.current[i]
      if (!row) return
      const z = zoomRef.current
      const line = ROW_H * z
      const inside = y - (startsRef.current[i] as number)
      const indent = (row.depth * 22 + 4 + 28 + 40) * z
      over = i
      mode = inside > line ? 'after' : modeFor(inside, line, ev.clientX - r.left - indent, 48 * z)
      setDrag({ id, over, mode })
      const b = box.getBoundingClientRect()
      velocity = ev.clientY - b.top < 56 ? -16 : b.bottom - ev.clientY < 56 ? 16 : 0
    }
    const scrollLoop = () => {
      if (velocity) box.scrollTop += velocity
      frame2 = requestAnimationFrame(scrollLoop)
    }
    frame2 = requestAnimationFrame(scrollLoop)
    const finish = (apply: boolean) => {
      window.removeEventListener('pointermove', point)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key, true)
      cancelAnimationFrame(frame2)
      setDrag(null)
      if (!apply) return
      const target = rowsRef.current[over]
      const drop = target ? resolveDrop(topicsRef.current, rootId, id, target.id, mode) : null
      if (drop && moveTopic(mapDoc, id, drop.parentId, drop.index)) selectOnly(id)
    }
    const up = () => finish(true)
    const cancel = () => finish(false)
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation()
        finish(false)
      }
    }
    window.addEventListener('pointermove', point)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key, true)
    setDrag({ id, over, mode })
  }

  const sel = new Set(selected)
  return (
    <div ref={scroller} onScroll={onScroll} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd} className="absolute inset-0 overflow-auto bg-bg" style={{ touchAction: 'pan-x pan-y' }} role="region" aria-label="Outline view">
      <div style={{ width: contentW, padding: '20px 16px' }}>
      <div style={{ width: pageW * zoom, margin: '0 auto' }}>
        <p className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          {readOnly ? (
            <>
              <span>Read mode: nothing can be changed</span>
              <span>↑ ↓: move between topics</span>
              <span>← →: fold or unfold</span>
            </>
          ) : (
            <>
              <span>Enter: new topic</span>
              <span>Tab / Shift+Tab: indent / outdent</span>
              <span>↑ ↓: move between topics</span>
              <span>Alt+↑ ↓: reorder</span>
              <span>Backspace on an empty topic: delete</span>
            </>
          )}
        </p>
        <ul ref={list} role="tree" className="relative rounded-ui border border-line bg-surface" style={{ height: total + 16, paddingTop: 8 }} data-total={rows.length} data-drawn={end - start}>
          {rows.slice(start, end).map((row, k) => {
            const i = start + k
            const t = topics[row.id]
            if (!t) return null
            return (
              <OutlineRow
                key={row.id}
                row={row}
                top={(starts[i] as number) + 8}
                height={(starts[i + 1] as number) - (starts[i] as number)}
                text={t.text}
                image={t.image ?? null}
                box={boxes[i] ?? null}
                marks={t.marks ?? []}
                collapsed={!!t.collapsed}
                number={numbers.get(row.id) ?? ''}
                selected={sel.has(row.id)}
                readOnly={readOnly}
                zoom={zoom}
                dragging={drag?.id === row.id}
                onDragStart={onDragStart}
                register={register}
                onKey={onKey}
              />
            )
          })}
          {drag && starts[drag.over] !== undefined && (
            <div
              aria-hidden="true"
              data-drop-line={drag.mode}
              className="pointer-events-none absolute right-2 z-10 rounded bg-brand"
              style={{
                height: 3,
                top: (starts[drag.over] as number) + 8 + (drag.mode === 'before' ? 0 : ROW_H * zoom) - 1,
                left: ((rows[drag.over]?.depth ?? 0) * 22 + 4 + (drag.mode === 'child' ? 72 : 0)) * zoom,
              }}
            />
          )}
        </ul>
      </div>
      </div>
    </div>
  )
}
