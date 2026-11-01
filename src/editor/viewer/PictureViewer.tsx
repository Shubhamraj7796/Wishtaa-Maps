import { useEffect, useMemo, useRef, useState } from 'react'
import { clamp01 } from '@/core/pdf/geometry'
import type { MarkupObject } from '@/core/pdf/types'
import { addPictureMark, clearPictureMarks, deletePictureMark, flipPicture, marksOf, rotatePicture, setMarksHidden, toPicturePoint, innerSize } from '@/core/model/pictureEdit'
import { Icon } from '@/ui/icons'
import { cmdRedo, cmdUndo } from '../actions'
import * as A from '../actions'
import { removeImage, replaceImage, useImageUrl } from '../images'
import { DRAW_TOOLS, DrawLayer, EraseLayer, MarkupLayer, RECT_MARK_TOOLS, type NewShape } from '../markup/layers'
import { MarkupToolbar, TOOL_KEYS, type ToolbarExtra } from '../markup/MarkupToolbar'
import { mapDoc } from '../mapdoc'
import { markupAt } from '../pdf/markup'
import { rememberShape, setToolStyle } from '../pdf/actions'
import { hasStyle, isShape } from '../pdf/toolPrefs'
import { bakePicture, topicsShowingSameLook } from '../pictures/bake'
import { faceTransform } from '../pictures/PictureFace'
import { originalFor } from '../pictures/flow'
import { showPreview } from '../content'
import { useScene } from '../scene'
import { useEditor, type PdfTool } from '../store'
import { showNotice } from '../notice'

/** The pictures of the map in reading order (the order of the topics), each once. */
export function mapImageIds(topics: Record<string, { image?: { imageId: string } | null | undefined }>, order: string[]): string[] {
  const out: string[] = []
  for (const id of order) {
    const img = topics[id]?.image?.imageId
    if (img && !out.includes(img)) out.push(img)
  }
  return out
}

const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8]
const MAX_K = 10
const MIN_K = 0.4
const btn = 'grid h-11 w-11 place-items-center rounded-full bg-surface text-ink shadow disabled:opacity-40'
const pill = 'rounded-full px-3 py-1.5 hover:bg-bg disabled:opacity-40 [@media(pointer:coarse)]:min-h-11'
const typing = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input,textarea,select,[contenteditable="true"]')

interface View {
  k: number
  x: number
  y: number
}

/**
 * A picture full screen: pinch, wheel and double-tap zoom, two-finger or drag pan, previous and next, Esc to close. In Edit mode it can
 * be turned and mirrored, and marked up with the same floating toolbar as a PDF. Turning and marking are small properties of the
 * picture reference in the topic (nothing is uploaded again) and can be made permanent into a new picture.
 */
export function PictureViewer({ imageId }: { imageId: string }) {
  const topics = useEditor((s) => s.topics)
  const order = useScene().order
  const ids = mapImageIds(topics, order)
  const at = Math.max(0, ids.indexOf(imageId))
  const readOnly = useEditor((s) => s.readOnly)
  const selected = useEditor((s) => s.selected)
  const styles = useEditor((s) => s.pdfPanel.styles)
  const shape = useEditor((s) => s.pdfPanel.shape)
  const canUndo = useEditor((s) => s.canUndo)
  const canRedo = useEditor((s) => s.canRedo)
  const { url, missing } = useImageUrl(imageId)
  // The topic this picture belongs to (the selected one if it has this picture), for the editing actions and the marks.
  const topicId = selected.find((id) => topics[id]?.image?.imageId === imageId) ?? Object.keys(topics).find((id) => topics[id]?.image?.imageId === imageId)
  const image = topicId ? topics[topicId]?.image : undefined
  const marks = useMemo(() => marksOf(image), [image])
  const canEdit = !readOnly && !!topicId && !!image

  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 })
  const [tool, setTool] = useState<PdfTool>('select')
  const [touchDraws, setTouchDraws] = useState(false)
  const [showMarks, setShowMarks] = useState(!image?.markHidden)
  const [markId, setMarkId] = useState<string | null>(null)
  const [permanent, setPermanent] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => close.current?.focus(), [])
  useEffect(() => {
    setView({ k: 1, x: 0, y: 0 })
    setMarkId(null)
  }, [imageId])
  useEffect(() => setShowMarks(!image?.markHidden), [image?.markHidden, imageId])
  useEffect(() => {
    if (readOnly) setTool('select')
  }, [readOnly])

  useEffect(() => {
    const el = stage.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The picture as shown, fitted into the stage (at zoom 1), leaving room for the bars.
  const ratio = image ? image.width / image.height : 4 / 3
  const room = { w: Math.max(80, size.w - 32), h: Math.max(80, size.h - 150) }
  const fit = ratio > room.w / room.h ? { w: room.w, h: room.w / ratio } : { w: room.h * ratio, h: room.h }
  const inner = image ? innerSize({ width: fit.w, height: fit.h, rotation: image.rotation }) : { w: fit.w, h: fit.h }
  const turn = { rotation: image?.rotation, flipX: image?.flipX, flipY: image?.flipY }

  const zoomAt = (px: number, py: number, k2: number) =>
    setView((v) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, k2))
      const cx = size.w / 2
      const cy = size.h / 2 - 20
      const ux = (px - cx - v.x) / v.k
      const uy = (py - cy - v.y) / v.k
      return { k, x: px - cx - k * ux, y: py - cy - k * uy }
    })
  const zoomBy = (dir: 1 | -1) => zoomAt(size.w / 2, size.h / 2 - 20, ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, ZOOMS.findIndex((v) => v >= view.k - 1e-6) + dir))] ?? view.k)
  const reset = () => setView({ k: 1, x: 0, y: 0 })

  // Wheel: zoom around the pointer.
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const b = el.getBoundingClientRect()
      zoomAt(e.clientX - b.left, e.clientY - b.top, view.k * Math.exp(-e.deltaY * 0.0015))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  // Pointers: one finger or the mouse drags the picture, two fingers pinch and pan, a double tap zooms. A mouse or stylus with a
  // marking tool draws instead (the layers take those), and a finger pans unless "Finger draws" is on.
  const pointers = useRef(new Map<number, { x: number; y: number; type: string }>())
  const gesture = useRef<{ kind: 'pan'; sx: number; sy: number; v: View; moved: boolean } | { kind: 'pinch'; d0: number; v: View; mx: number; my: number } | null>(null)
  const lastTap = useRef({ t: 0, x: 0, y: 0 })
  const marking = tool !== 'select'
  const local = (e: { clientX: number; clientY: number }) => {
    const b = stage.current?.getBoundingClientRect()
    return { x: e.clientX - (b?.left ?? 0), y: e.clientY - (b?.top ?? 0) }
  }
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-viewer-ui],[data-floating-tools]')) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as unknown as [{ x: number; y: number }, { x: number; y: number }]
      const m = local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 })
      gesture.current = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, v: view, mx: m.x, my: m.y }
      return
    }
    const finger = e.pointerType === 'touch'
    if (marking && !finger) return // a mouse or stylus with a tool draws
    if (marking && finger && touchDraws) return
    stage.current?.setPointerCapture?.(e.pointerId)
    gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, v: view, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId)
    if (p) {
      p.x = e.clientX
      p.y = e.clientY
    }
    const g = gesture.current
    if (!g) return
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()] as unknown as [{ x: number; y: number }, { x: number; y: number }]
      const k = Math.min(MAX_K, Math.max(MIN_K, (g.v.k * Math.hypot(a.x - b.x, a.y - b.y)) / g.d0))
      const m = local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 })
      const cx = size.w / 2
      const cy = size.h / 2 - 20
      const ux = (g.mx - cx - g.v.x) / g.v.k
      const uy = (g.my - cy - g.v.y) / g.v.k
      setView({ k, x: m.x - cx - k * ux, y: m.y - cy - k * uy })
    } else if (g.kind === 'pan') {
      const dx = e.clientX - g.sx
      const dy = e.clientY - g.sy
      if (Math.abs(dx) + Math.abs(dy) > 4) g.moved = true
      if (g.moved) setView({ k: g.v.k, x: g.v.x + dx, y: g.v.y + dy })
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2 && g?.kind === 'pinch') gesture.current = null
    if (g?.kind !== 'pan') return
    gesture.current = null
    if (g.moved) return
    // A tap (no movement). Twice quickly in one place: zoom in, or back out.
    const now = Date.now()
    const l = lastTap.current
    if (now - l.t < 320 && Math.hypot(e.clientX - l.x, e.clientY - l.y) < 24) {
      lastTap.current = { t: 0, x: 0, y: 0 }
      const p = local(e)
      if (view.k > 1.05) reset()
      else zoomAt(p.x, p.y, 2.5)
      return
    }
    lastTap.current = { t: now, x: e.clientX, y: e.clientY }
    // With the Select tool a tap on a mark chooses it.
    if (canEdit && tool === 'select' && marks.length) {
      const box = stage.current?.querySelector('[data-picture-box]')
      if (box) {
        const b = box.getBoundingClientRect()
        const shown: [number, number] = [clamp01((e.clientX - b.left) / b.width), clamp01((e.clientY - b.top) / b.height)]
        setMarkId(markupAt(marks, toPicturePoint(shown, turn))?.id ?? null)
      }
    }
  }

  const step = (dir: 1 | -1) => {
    if (ids.length < 2) return
    showPreview(ids[(at + dir + ids.length) % ids.length] as string)
  }
  const choose = (t: PdfTool) => {
    if (isShape(t)) rememberShape(t)
    setTool(t)
    setMarkId(null)
  }
  const toPoint = (e: { clientX: number; clientY: number }, el: Element) => {
    const b = el.getBoundingClientRect()
    return toPicturePoint([clamp01((e.clientX - b.left) / b.width), clamp01((e.clientY - b.top) / b.height)], turn)
  }
  const add = (m: NewShape) => void (topicId && addPictureMark(mapDoc, topicId, m))

  const extras: ToolbarExtra[] = [
    { key: 'undo', icon: 'undo', label: 'Undo', disabled: !canUndo, onClick: cmdUndo },
    { key: 'redo', icon: 'redo', label: 'Redo', disabled: !canRedo, onClick: cmdRedo },
  ]
  const drawing = DRAW_TOOLS.includes(tool) || RECT_MARK_TOOLS.includes(tool)
  const style = hasStyle(tool) ? styles[tool] : styles.pen
  const sharing = topicId ? topicsShowingSameLook(topicId).length : 0

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (typing(e.target)) return
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (document.querySelector('[data-flyout]')) return // the flyout closes first
      if (permanent) return setPermanent(false)
      if (markId) return setMarkId(null)
      if (tool !== 'select') return setTool('select')
      return showPreview(null)
    }
    if (e.key === 'ArrowRight') step(1)
    else if (e.key === 'ArrowLeft') step(-1)
    else if (e.key === '+' || e.key === '=') zoomBy(1)
    else if (e.key === '-') zoomBy(-1)
    else if (e.key === '0') reset()
    else if ((e.key === 'Delete' || e.key === 'Backspace') && markId && topicId && canEdit) {
      deletePictureMark(mapDoc, topicId, markId)
      setMarkId(null)
    } else if (canEdit && !e.ctrlKey && !e.metaKey && !e.altKey && TOOL_KEYS[e.key.toLowerCase()]) choose(TOOL_KEYS[e.key.toLowerCase()] as PdfTool)
  }

  const content = (
    <div data-picture-box className="absolute" style={{ left: (size.w - fit.w) / 2, top: (size.h - fit.h) / 2 - 20, width: fit.w, height: fit.h, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: 'center' }}>
      <div className="absolute overflow-hidden rounded-md bg-white" style={{ inset: 0 }}>
        <div className="absolute" style={{ left: '50%', top: '50%', width: inner.w, height: inner.h, transform: faceTransform({ rotation: (image?.rotation ?? 0) as 0 | 90 | 180 | 270, flipX: !!image?.flipX, flipY: !!image?.flipY }) }}>
          {url ? <img src={url} alt="Full-size picture" draggable={false} className="block h-full w-full select-none object-fill" /> : null}
          {showMarks && marks.length > 0 && <MarkupLayer list={marks} box={{ w: inner.w, h: inner.h, scale: 1 }} markId={markId} />}
          {canEdit && tool === 'eraser' && <EraseLayer list={marks} surface="[data-picture-box]" toPoint={toPoint} onErase={(id) => topicId && deletePictureMark(mapDoc, topicId, id)} touchDraws={touchDraws} />}
          {canEdit && drawing && <DrawLayer tool={tool} style={style} box={{ w: inner.w, h: inner.h, scale: 1 }} surface="[data-picture-box]" toPoint={toPoint} onAdd={add} linkPages={0} touchDraws={touchDraws} />}
        </div>
      </div>
    </div>
  )

  return (
    <div role="dialog" aria-modal="true" aria-label="Picture preview" className="absolute inset-0 z-50 bg-black/80" onKeyDown={onKeyDown}>
      <div ref={stage} data-viewer-stage className="absolute inset-0 touch-none overflow-hidden" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onDoubleClick={(e) => e.preventDefault()}>
        {url ? content : <p className="absolute inset-0 grid place-items-center text-white">{missing ? 'This picture is no longer stored.' : 'Loading…'}</p>}
        {canEdit && <MarkupToolbar tool={tool} onTool={choose} styles={styles} onStyle={setToolStyle} shape={shape} extras={extras} placeKey="picture" label="Picture markup tools" />}
      </div>

      <button ref={close} data-viewer-ui type="button" aria-label="Close preview" title="Close (Esc)" onClick={() => showPreview(null)} className={`absolute right-4 top-4 z-30 ${btn}`}>
        <Icon name="close" size={20} />
      </button>

      <div data-viewer-ui className="absolute bottom-4 left-1/2 z-30 flex max-w-[96vw] -translate-x-1/2 items-center gap-1 rounded-full bg-surface/90 px-2 py-1 text-sm shadow">
        <button type="button" aria-label="Previous picture" title="Previous (Left arrow)" disabled={ids.length < 2} onClick={() => step(-1)} className={btn}>‹</button>
        <span aria-live="polite" className="min-w-16 text-center tabular-nums">{ids.length > 1 ? `${at + 1} of ${ids.length}` : '1 picture'}</span>
        <button type="button" aria-label="Next picture" title="Next (Right arrow)" disabled={ids.length < 2} onClick={() => step(1)} className={btn}>›</button>
        <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
        <button type="button" aria-label="Zoom out" title="Zoom out (-)" onClick={() => zoomBy(-1)} className={btn}>−</button>
        <button type="button" aria-label="Actual size" title="Fit the screen (0)" onClick={reset} className="min-w-12 text-center tabular-nums">{Math.round(view.k * 100)}%</button>
        <button type="button" aria-label="Zoom in" title="Zoom in (+)" onClick={() => zoomBy(1)} className={btn}>+</button>
      </div>

      {canEdit && topicId && (
        <div data-viewer-ui role="toolbar" aria-label="Picture actions" className="absolute left-4 top-4 z-30 flex max-w-[calc(100vw-6rem)] flex-wrap items-center gap-1 rounded-3xl bg-surface/90 px-2 py-1 text-sm shadow">
          <button type="button" className={pill} onClick={() => { showPreview(null); void replaceImage(topicId) }}>
            Replace
          </button>
          {originalFor(imageId) && (
            <button type="button" className={pill} onClick={() => { showPreview(null); useEditor.setState({ pictureDraft: { blob: originalFor(imageId) as Blob, source: 'upload', target: { kind: 'replace', id: topicId } } }) }}>
              Crop again
            </button>
          )}
          <button type="button" className={pill} onClick={() => { useEditor.setState({ selected: [topicId], imageSelected: topicId }); showPreview(null); A.togglePanel('picture') }}>
            Resize
          </button>
          <span className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />
          <button type="button" aria-label="Rotate left" title="Rotate left" className={pill} onClick={() => rotatePicture(mapDoc, topicId, -90)}>
            <Icon name="reset" size={16} />
          </button>
          <button type="button" aria-label="Rotate right" title="Rotate right" className={pill} onClick={() => rotatePicture(mapDoc, topicId, 90)}>
            <Icon name="rotateCw" size={16} />
          </button>
          <button type="button" aria-label="Flip left to right" title="Flip left to right" className={pill} onClick={() => flipPicture(mapDoc, topicId, 'x')}>
            <Icon name="flipH" size={16} />
          </button>
          {(image?.rotation || image?.flipX || image?.flipY || marks.length > 0) && (
            <button type="button" className={pill} aria-haspopup="dialog" onClick={() => setPermanent(true)}>
              Make permanent…
            </button>
          )}
          {marks.length > 0 && (
            <>
              <label className="flex items-center gap-1 px-2">
                <input type="checkbox" checked={showMarks} onChange={(e) => { setShowMarks(e.target.checked); setMarksHidden(mapDoc, topicId, !e.target.checked) }} />
                Show markup
              </label>
              <button type="button" className={pill} onClick={() => { clearPictureMarks(mapDoc, topicId); setMarkId(null) }}>
                Remove markup
              </button>
            </>
          )}
          <label className="flex items-center gap-1 px-2" title="Fingers pan and zoom; turn this on to draw with a finger when there is no stylus">
            <input type="checkbox" checked={touchDraws} onChange={(e) => setTouchDraws(e.target.checked)} />
            Finger draws
          </label>
          <button type="button" className={`${pill} text-bad`} onClick={() => { showPreview(null); removeImage(topicId) }}>
            Delete picture
          </button>
        </div>
      )}

      {!canEdit && marks.length > 0 && (
        <label data-viewer-ui className="absolute left-4 top-4 z-30 flex items-center gap-1 rounded-full bg-surface/90 px-3 py-1.5 text-sm shadow">
          <input type="checkbox" checked={showMarks} onChange={(e) => setShowMarks(e.target.checked)} />
          Show markup
        </label>
      )}

      {canEdit && markId && topicId && (
        <div data-viewer-ui className="absolute left-1/2 top-16 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full bg-surface px-2 py-1 text-sm shadow-lg">
          <span className="px-2 font-medium">Mark selected</span>
          <button type="button" className={`${pill} text-bad`} onClick={() => { deletePictureMark(mapDoc, topicId, markId); setMarkId(null) }}>
            Delete mark
          </button>
          <button type="button" className={pill} onClick={() => setMarkId(null)}>
            Done
          </button>
        </div>
      )}

      {permanent && topicId && image && <PermanentDialog topicId={topicId} turned={!!(image.rotation || image.flipX || image.flipY)} marked={marks.length > 0} sharing={sharing} onClose={() => setPermanent(false)} />}
    </div>
  )
}

/** Makes a turn, or the marks, part of the picture itself. */
function PermanentDialog({ topicId, turned, marked, sharing, onClose }: { topicId: string; turned: boolean; marked: boolean; sharing: number; onClose: () => void }) {
  const [turn, setTurn] = useState(turned)
  const [marks, setMarks] = useState(marked)
  const [quality, setQuality] = useState<'compressed' | 'original'>('compressed')
  const [scope, setScope] = useState<'topic' | 'all'>('topic')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    const id = await bakePicture(topicId, { turn, marks, quality, scope })
    setBusy(false)
    if (id) {
      showNotice('Made permanent in a new picture. The original picture is unchanged.')
      onClose()
    }
  }
  return (
    <div data-viewer-ui className="absolute inset-0 z-40 grid place-items-center bg-black/40 p-3" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Make permanent" className="w-full max-w-sm rounded-ui border border-line bg-surface p-4 text-sm shadow-2xl">
        <h2 className="text-base font-semibold">Make permanent</h2>
        <p className="mt-1 text-muted">This stores a new picture with the change built in. The original picture is not changed, and a picture that is already stored is never uploaded twice.</p>
        <fieldset className="mt-3 space-y-1.5">
          <label className={`flex items-center gap-2 ${turned ? '' : 'opacity-50'}`}>
            <input type="checkbox" disabled={!turned} checked={turn} onChange={(e) => setTurn(e.target.checked)} />
            Turn and flip the picture itself
          </label>
          <label className={`flex items-center gap-2 ${marked ? '' : 'opacity-50'}`}>
            <input type="checkbox" disabled={!marked} checked={marks} onChange={(e) => setMarks(e.target.checked)} />
            Draw the markup into the picture (flatten)
          </label>
        </fieldset>
        <label className="mt-3 flex items-center gap-2">
          Quality
          <select value={quality} onChange={(e) => setQuality(e.target.value as 'compressed' | 'original')} className="rounded border border-line bg-surface px-2 py-1">
            <option value="compressed">Compressed</option>
            <option value="original">Original</option>
          </select>
        </label>
        {sharing > 1 && (
          <fieldset className="mt-3 space-y-1.5" aria-label="Which topics">
            <label className="flex items-center gap-2">
              <input type="radio" name="scope" checked={scope === 'topic'} onChange={() => setScope('topic')} />
              This topic only
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="scope" checked={scope === 'all'} onChange={() => setScope('all')} />
              All {sharing} topics showing it the same way
            </label>
          </fieldset>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded-ui border border-line px-3 py-2 [@media(pointer:coarse)]:min-h-11" onClick={onClose}>
            Cancel
          </button>
          <button type="button" disabled={busy || (!turn && !marks)} className="rounded-ui bg-brand px-3 py-2 font-semibold text-brand-ink disabled:opacity-50 [@media(pointer:coarse)]:min-h-11" onClick={() => void go()}>
            {busy ? 'Working…' : 'Make permanent'}
          </button>
        </div>
      </div>
    </div>
  )
}

export type { MarkupObject }
