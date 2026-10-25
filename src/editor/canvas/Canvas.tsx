import { useEffect, useMemo, useRef, useState } from 'react'
import type { LaidOut } from '@/core/layout/mindmap'
import { buildIndex, descendantIds, topLevelOnly } from '@/core/model/tree'
import {
  beginEdit,
  clearSelection,
  closeMenu,
  openMenu,
  dropTopics,
  expandBadge,
  fitToScreen,
  moveFloating,
  selectIds,
  selectOnly,
  setViewport,
  toggleSelect,
  zoomAround,
  type DropMode,
} from '../actions'
import { addImageToTopic, firstImageFile, hasFiles, resetImageSize, selectImage } from '../images'
import { spaceDown } from '../keyboard'
import { showNotice } from '../notice'
import { useScene } from '../scene'
import { useEditor } from '../store'
import { Minimap } from './Minimap'
import { TopicView, branchColor } from './TopicView'

type Gesture =
  | { kind: 'none' }
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number; moved: boolean }
  | { kind: 'box'; sx: number; sy: number; base: string[]; moved: boolean }
  | { kind: 'node'; id: string; sx: number; sy: number; started: boolean; additive: boolean; ids: string[]; exclude: Set<string> }
  | { kind: 'pinch'; d0: number; k0: number; wx: number; wy: number }

interface DragView {
  ids: string[]
  dx: number
  dy: number
  target: { id: string; mode: DropMode } | null
}

const DRAG_THRESHOLD = 4

function edgePath(a: LaidOut, b: LaidOut): string {
  const right = b.side !== 'left'
  const x1 = right ? a.x + a.w : a.x
  const y1 = a.y + a.h / 2
  const x2 = right ? b.x : b.x + b.w
  const y2 = b.y + b.h / 2
  const mx = (x1 + x2) / 2
  return `M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`
}

export function Canvas() {
  const scene = useScene()
  const viewport = useEditor((s) => s.viewport)
  const canvasSize = useEditor((s) => s.canvasSize)
  const selected = useEditor((s) => s.selected)
  const editingId = useEditor((s) => s.editingId)
  const topics = useEditor((s) => s.topics)
  const tool = useEditor((s) => s.tool)
  const search = useEditor((s) => s.search)

  const host = useRef<HTMLDivElement>(null)
  const g = useRef<Gesture>({ kind: 'none' })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const lastDown = useRef<{ id: string | null; t: number }>({ id: null, t: 0 })
  const sceneRef = useRef(scene)
  sceneRef.current = scene
  const fitted = useRef(false)
  const [drag, setDrag] = useState<DragView | null>(null)
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)

  // Track canvas size.
  useEffect(() => {
    const el = host.current
    if (!el) return
    const update = () => useEditor.setState({ canvasSize: { w: el.clientWidth, h: el.clientHeight } })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Fit once on first layout.
  useEffect(() => {
    if (!fitted.current && canvasSize.w && scene.boxes.size) {
      fitted.current = true
      fitToScreen()
    }
  }, [canvasSize.w, scene])

  // Wheel zoom (non-passive so the page does not scroll).
  useEffect(() => {
    const el = host.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAround(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const local = (e: { clientX: number; clientY: number }) => {
    const r = host.current?.getBoundingClientRect()
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) }
  }
  const toWorld = (p: { x: number; y: number }) => {
    const v = useEditor.getState().viewport
    return { x: (p.x - v.x) / v.k, y: (p.y - v.y) / v.k }
  }

  function findDrop(wx: number, wy: number, exclude: Set<string>): DragView['target'] {
    for (const b of sceneRef.current.boxes.values()) {
      if (exclude.has(b.id)) continue
      if (wx < b.x || wx > b.x + b.w || wy < b.y || wy > b.y + b.h) continue
      const t = useEditor.getState().topics[b.id]
      const canSibling = !!t?.parentId
      const rel = (wy - b.y) / b.h
      const mode: DropMode = canSibling && rel < 0.28 ? 'before' : canSibling && rel > 0.72 ? 'after' : 'child'
      return { id: b.id, mode }
    }
    return null
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const el = host.current
    const target = e.target as HTMLElement
    if (!el || target.closest('input')) return
    if (target.closest('[data-handle],[data-imgbtn]')) return // image resize handles and the remove button
    if (useEditor.getState().menu) closeMenu()
    el.focus()
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }]
      const mid = local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 })
      const w = toWorld(mid)
      g.current = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, k0: useEditor.getState().viewport.k, wx: w.x, wy: w.y }
      setDrag(null)
      setBox(null)
      return
    }

    const badge = target.closest<HTMLElement>('[data-badge]')
    if (badge?.dataset.badge) {
      expandBadge(badge.dataset.badge)
      return
    }

    const st = useEditor.getState()
    const additive = e.shiftKey || e.ctrlKey || e.metaKey
    const id = target.closest<HTMLElement>('[data-topic]')?.dataset.topic

    if (id && e.button === 0 && !spaceDown) {
      const onImage = !!target.closest('[data-image]')
      const now = performance.now()
      if (lastDown.current.id === id && now - lastDown.current.t < 350) {
        lastDown.current = { id: null, t: 0 }
        if (onImage) {
          selectImage(id)
          void resetImageSize(id) // double-click an image: back to its original size
        } else beginEdit(id)
        return
      }
      lastDown.current = { id, t: now }
      if (additive) toggleSelect(id)
      else if (!st.selected.includes(id)) selectOnly(id)
      // Clicking the picture selects it (resize handles); clicking the text selects just the topic.
      useEditor.setState({ imageSelected: onImage && !additive && st.topics[id]?.image ? id : null })
      const ids = topLevelOnly(st.topics, useEditor.getState().selected.filter((x) => x !== st.rootId))
      const idx = buildIndex(st.topics)
      const exclude = new Set(ids)
      ids.forEach((x) => descendantIds(idx, x).forEach((d) => exclude.add(d)))
      g.current = { kind: 'node', id, sx: e.clientX, sy: e.clientY, started: false, additive, ids, exclude }
      return
    }

    el.setPointerCapture(e.pointerId)
    const v = st.viewport
    const panning = e.button === 1 || spaceDown || e.pointerType === 'touch' || (st.tool === 'pan' && !e.shiftKey)
    if (panning) g.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y, moved: false }
    else g.current = { kind: 'box', sx: e.clientX, sy: e.clientY, base: additive ? st.selected : [], moved: false }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId)
    if (p) {
      p.x = e.clientX
      p.y = e.clientY
    }
    const gs = g.current
    const v = useEditor.getState().viewport

    if (gs.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }]
      const k = Math.min(3, Math.max(0.1, (gs.k0 * Math.hypot(a.x - b.x, a.y - b.y)) / gs.d0))
      const mid = local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 })
      setViewport({ k, x: mid.x - gs.wx * k, y: mid.y - gs.wy * k })
    } else if (gs.kind === 'pan') {
      const dx = e.clientX - gs.sx
      const dy = e.clientY - gs.sy
      if (Math.abs(dx) + Math.abs(dy) > 2) gs.moved = true
      setViewport({ k: v.k, x: gs.vx + dx, y: gs.vy + dy })
    } else if (gs.kind === 'box') {
      if (Math.hypot(e.clientX - gs.sx, e.clientY - gs.sy) > DRAG_THRESHOLD) gs.moved = true
      if (!gs.moved) return
      const a = local({ clientX: gs.sx, clientY: gs.sy })
      const b = local(e)
      setBox({ x0: a.x, y0: a.y, x1: b.x, y1: b.y })
      const wa = toWorld(a)
      const wb = toWorld(b)
      const [x0, x1] = [Math.min(wa.x, wb.x), Math.max(wa.x, wb.x)]
      const [y0, y1] = [Math.min(wa.y, wb.y), Math.max(wa.y, wb.y)]
      const hit: string[] = []
      sceneRef.current.boxes.forEach((bx) => {
        if (bx.x < x1 && bx.x + bx.w > x0 && bx.y < y1 && bx.y + bx.h > y0) hit.push(bx.id)
      })
      selectIds([...new Set([...gs.base, ...hit])])
    } else if (gs.kind === 'node') {
      if (!gs.started) {
        if (Math.hypot(e.clientX - gs.sx, e.clientY - gs.sy) < DRAG_THRESHOLD || !gs.ids.length) return
        gs.started = true
        host.current?.setPointerCapture(e.pointerId)
      }
      const dx = (e.clientX - gs.sx) / v.k
      const dy = (e.clientY - gs.sy) / v.k
      const w = toWorld(local(e))
      setDrag({ ids: gs.ids, dx, dy, target: findDrop(w.x, w.y, gs.exclude) })
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    const gs = g.current
    if (gs.kind === 'pinch') {
      if (pointers.current.size < 2) g.current = { kind: 'none' }
      return
    }
    g.current = { kind: 'none' }
    if (host.current?.hasPointerCapture(e.pointerId)) host.current.releasePointerCapture(e.pointerId)
    if (gs.kind === 'pan' && !gs.moved) clearSelection()
    else if (gs.kind === 'box') {
      setBox(null)
      if (!gs.moved) clearSelection()
    } else if (gs.kind === 'node') {
      if (!gs.started) {
        if (!gs.additive && useEditor.getState().selected.length > 1) selectOnly(gs.id)
      } else if (drag) {
        if (drag.target) dropTopics(drag.ids, drag.target.id, drag.target.mode)
        else {
          const topics = useEditor.getState().topics
          const floating = drag.ids.filter((id) => topics[id]?.parentId === null)
          if (floating.length) moveFloating(floating, drag.dx, drag.dy)
        }
      }
      setDrag(null)
    }
  }

  // ---- visible set (culling) ----
  const k = viewport.k
  const vx0 = (-viewport.x - 200) / k
  const vy0 = (-viewport.y - 200) / k
  const vx1 = (canvasSize.w - viewport.x + 200) / k
  const vy1 = (canvasSize.h - viewport.y + 200) / k
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const matchSet = useMemo(() => new Set(search.matches), [search.matches])
  const currentMatch = search.matches[search.index]
  const imageSelected = useEditor((s) => s.imageSelected)
  const imageLive = useEditor((s) => s.imageLive)
  const soleImageTopic = selected.length === 1 && selected[0] === imageSelected ? imageSelected : null

  const onContextMenu = (e: React.MouseEvent) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-topic]')?.dataset.topic
    if (!id) return
    e.preventDefault()
    if (!useEditor.getState().selected.includes(id)) selectOnly(id)
    const p = local(e)
    openMenu(p.x, p.y, id)
  }
  const onDragOver = (e: React.DragEvent) => {
    if (!hasFiles(e.dataTransfer)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
  const onDrop = (e: React.DragEvent) => {
    if (!hasFiles(e.dataTransfer)) return
    e.preventDefault()
    const file = firstImageFile(e.dataTransfer)
    if (!file) {
      showNotice('Only image files can be dropped onto a topic.')
      return
    }
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-topic]')?.dataset.topic
    if (!id) {
      showNotice('Drop the image onto a topic.')
      return
    }
    selectOnly(id)
    void addImageToTopic(file, id)
  }

  const visible: LaidOut[] = []
  scene.boxes.forEach((b) => {
    if (b.x + b.w >= vx0 && b.x <= vx1 && b.y + b.h >= vy0 && b.y <= vy1) visible.push(b)
  })
  const paths: { key: string; d: string; color: string; width: number }[] = []
  for (const e of scene.edges) {
    const a = scene.boxes.get(e.from)
    const b = scene.boxes.get(e.to)
    if (!a || !b) continue
    const minX = Math.min(a.x, b.x)
    const maxX = Math.max(a.x + a.w, b.x + b.w)
    const minY = Math.min(a.y, b.y)
    const maxY = Math.max(a.y + a.h, b.y + b.h)
    if (maxX < vx0 || minX > vx1 || maxY < vy0 || minY > vy1) continue
    paths.push({ key: e.to, d: edgePath(a, b), color: branchColor(b.branch), width: Math.max(1.5, 3.5 - b.depth * 0.6) })
  }

  const dragTargetBox = drag?.target ? scene.boxes.get(drag.target.id) : undefined
  const cursor = tool === 'pan' ? (g.current.kind === 'pan' ? 'grabbing' : 'grab') : 'crosshair'

  return (
    <div
      ref={host}
      tabIndex={0}
      role="tree"
      aria-label="Mind map canvas"
      aria-multiselectable
      className="relative h-full w-full touch-none overflow-hidden outline-none"
      style={{
        cursor,
        backgroundImage: 'radial-gradient(rgb(var(--c-line)) 1px, transparent 1px)',
        backgroundSize: `${24 * k}px ${24 * k}px`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={onContextMenu}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${k})` }}
      >
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden="true">
          {paths.map((p) => (
            <path key={p.key} d={p.d} fill="none" stroke={p.color} strokeWidth={p.width} strokeLinecap="round" />
          ))}
        </svg>
        {visible.map((b) => {
          const t = topics[b.id]
          if (!t) return null
          return (
            <TopicView
              key={b.id}
              box={b}
              text={t.text}
              image={t.image}
              imageSelected={soleImageTopic === b.id}
              live={imageLive?.topicId === b.id ? imageLive : null}
              isRoot={b.id === scene.rootId}
              selected={selectedSet.has(b.id)}
              editing={editingId === b.id}
              match={matchSet.has(b.id)}
              current={currentMatch === b.id}
              hidden={scene.hidden.get(b.id) ?? 0}
            />
          )
        })}
        {drag &&
          drag.ids.map((id) => {
            const b = scene.boxes.get(id)
            if (!b) return null
            return (
              <div
                key={`ghost-${id}`}
                className="pointer-events-none absolute flex items-center justify-center rounded-xl border-2 border-dashed border-brand bg-brand/10 px-3 text-sm"
                style={{ left: b.x + drag.dx, top: b.y + drag.dy, width: b.w, height: b.h }}
              >
                <span className="truncate">{topics[id]?.text}</span>
              </div>
            )
          })}
        {dragTargetBox && drag?.target && (
          <div
            className="pointer-events-none absolute rounded-xl"
            style={
              drag.target.mode === 'child'
                ? { left: dragTargetBox.x - 4, top: dragTargetBox.y - 4, width: dragTargetBox.w + 8, height: dragTargetBox.h + 8, border: '3px solid rgb(var(--c-brand))' }
                : {
                    left: dragTargetBox.x,
                    width: dragTargetBox.w,
                    height: 4,
                    top: drag.target.mode === 'before' ? dragTargetBox.y - 8 : dragTargetBox.y + dragTargetBox.h + 4,
                    background: 'rgb(var(--c-brand))',
                  }
            }
          />
        )}
      </div>
      {box && (
        <div
          className="pointer-events-none absolute border border-brand bg-brand/10"
          style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }}
        />
      )}
      <Minimap scene={scene} />
    </div>
  )
}
