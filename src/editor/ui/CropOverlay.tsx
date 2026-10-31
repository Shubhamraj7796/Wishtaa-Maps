import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { browserCodec } from '@/core/images/codec.browser'
import { clampView, dragRect, fullRect, hitHandle, nudgeRect, pixelSize, rotateRect, zoomView, type Handle, type Rect, type View } from '@/core/images/crop'
import { analyze, analyzeHigh, pick, type Analysis, type Candidate, type Codec, type Rotation } from '@/core/images/pipeline'
import { decide, shouldAsk } from '@/core/images/plan'
import { ImageError } from '@/core/images/process'
import { Icon } from '@/ui/icons'
import { useSettings } from '@/stores/settings'
import { finishDraft, rememberChoice } from '../pictures/flow'
import { showNotice } from '../notice'
import { useTouchFriendly } from '../pictures/touch'
import { useEditor } from '../store'
import { ChoiceControl, formatBytes } from './PictureChoiceDialog'

const FIT_PAD = 12

const blobKeys = new WeakMap<Blob, number>()
let blobCounter = 0
const blobKey = (b: Blob) => {
  let k = blobKeys.get(b)
  if (k === undefined) blobKeys.set(b, (k = ++blobCounter))
  return k
}

interface Drag {
  handle: Handle
  start: Rect
  at: { x: number; y: number }
}

/**
 * The crop step: a full-screen overlay with a rectangle you drag and resize (handles are 44 px to hit, so a finger can grab them),
 * pinch to zoom and two fingers to pan for precision, rotate in 90 degree steps, and the size choice with live sizes.
 * Mouse, touch and pen all use pointer events. The keyboard works too (arrows nudge, Shift is bigger, Enter confirms, Esc cancels).
 */
export function CropOverlay({ codec = browserCodec }: { codec?: Codec } = {}) {
  const draft = useEditor((s) => s.pictureDraft)
  if (!draft) return null
  // Keyed by the picture itself, not its size: two pictures of the same size are still two pictures.
  return <Crop key={blobKey(draft.blob)} codec={codec} />
}

function Crop({ codec }: { codec: Codec }) {
  const draft = useEditor((s) => s.pictureDraft) as NonNullable<ReturnType<typeof useEditor.getState>['pictureDraft']>
  const pref = useSettings((s) => s.picturesPref)
  const touch = useTouchFriendly()
  const [blob, setBlob] = useState(draft.blob)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [rotate, setRotate] = useState<Rotation>(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 })
  const [frame, setFrame] = useState({ w: 320, h: 480 })
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [high, setHigh] = useState<Candidate | null>(null)
  const [more, setMore] = useState(false)
  const [choice, setChoice] = useState<'compressed' | 'original' | 'high'>('compressed')
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const canvasHost = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef<Drag | null>(null)
  const pinch = useRef<{ d0: number; mid: { x: number; y: number }; view: View } | null>(null)

  // Rotated size of the picture.
  const bounds = useMemo(() => (natural ? (rotate === 90 || rotate === 270 ? { w: natural.h, h: natural.w } : { w: natural.w, h: natural.h }) : null), [natural, rotate])
  const fs = bounds ? Math.min((frame.w - FIT_PAD * 2) / bounds.w, (frame.h - FIT_PAD * 2) / bounds.h) : 1
  const stage = bounds ? { w: bounds.w * fs, h: bounds.h * fs } : { w: 0, h: 0 }
  const origin = { x: (frame.w - stage.w) / 2, y: (frame.h - stage.h) / 2 }

  const cancel = useCallback(() => useEditor.setState({ pictureDraft: null }), [])

  // Measure the frame (and again on rotation of the device or the on-screen keyboard).
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const measure = () => setFrame({ w: el.clientWidth || 320, h: el.clientHeight || 480 })
    measure()
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
    }
  }, [])

  // Read the picture's size once; a new picture (Retake) starts the crop over.
  useEffect(() => {
    let alive = true
    setNatural(null)
    setError(null)
    void codec
      .decode(blob)
      .then((d) => {
        if (!alive) return d.close()
        setNatural({ w: d.width, h: d.height })
        setRect(fullRect({ w: d.width, h: d.height }))
        setRotate(0)
        setView({ scale: 1, x: 0, y: 0 })
        d.close()
      })
      .catch(() => alive && setError("Couldn't read that picture. It may be damaged or in an unsupported format. If it is a HEIC photo, choose “Most compatible” in your camera settings."))
    return () => {
      alive = false
    }
  }, [blob, codec])

  // Draw the (rotated) picture for display.
  useEffect(() => {
    if (!natural || !bounds) return
    let alive = true
    void (async () => {
      const d = await codec.decode(blob)
      try {
        const f = Math.min(1, 1600 / Math.max(bounds.w, bounds.h))
        const r = await codec.render(d, { crop: fullRect(bounds), rotate, width: Math.round(bounds.w * f), height: Math.round(bounds.h * f) })
        const host = canvasHost.current
        const node = r.raw as HTMLElement | undefined
        if (alive && host && node instanceof HTMLElement) {
          node.style.width = '100%'
          node.style.height = '100%'
          host.replaceChildren(node)
        }
      } catch {
        /* the sizes below still work */
      } finally {
        d.close()
      }
    })()
    return () => {
      alive = false
    }
  }, [blob, natural, bounds, rotate, codec])

  // Sizes for the chosen part, shortly after the rectangle stops moving.
  useEffect(() => {
    if (!natural || !rect) return
    setBusy(true)
    const t = setTimeout(() => {
      analyze(blob, { crop: rect, rotate }, codec)
        .then((a) => {
          setAnalysis(a)
          setHigh(null)
          setError(null)
          const d = decide(pref, a.original?.blob.size ?? a.source.bytes, a.compressed.blob.size)
          setChoice((c) => (c === 'high' ? c : d.use))
        })
        .catch((e) => setError(e instanceof ImageError ? e.message : 'Could not work out the picture size.'))
        .finally(() => setBusy(false))
    }, 250)
    return () => clearTimeout(t)
  }, [blob, rect, rotate, natural, pref, codec])

  const showChoice = analysis !== null && pref === 'ask' && shouldAsk(analysis.original?.blob.size ?? analysis.source.bytes, analysis.compressed.blob.size)

  // "More options" -> High
  useEffect(() => {
    if (!more || !analysis || !rect) return
    let alive = true
    void analyzeHigh(blob, { crop: rect, rotate }, codec, analysis.stats).then((c) => alive && setHigh(c)).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [more, analysis, rect, rotate, blob, codec])

  const confirm = async () => {
    if (!analysis || !rect) return
    try {
      const c = choice === 'high' && high ? high : pick(analysis, choice === 'original' ? 'original' : 'compressed')
      if (remember && choice !== 'high') rememberChoice(choice)
      await finishDraft(c, draft.source, draft.target, draft.blob)
    } catch (e) {
      setError(e instanceof ImageError ? e.message : 'Could not add that picture.')
    }
  }

  const rotateBy = (dir: 'left' | 'right') => {
    if (!rect || !bounds) return
    const r = rotateRect(rect, bounds, dir)
    setRect(r.rect)
    setRotate((((rotate + (dir === 'right' ? 90 : 270)) % 360) as Rotation))
    setView({ scale: 1, x: 0, y: 0 })
  }
  const retake = async () => {
    const b = await draft.retake?.()
    if (b) setBlob(b)
  }

  // ---- pointer handling: mouse, touch and pen ----
  const local = (e: { clientX: number; clientY: number }) => {
    const r = frameRef.current?.getBoundingClientRect()
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) }
  }
  const screenRect = (r: Rect): Rect => ({ x: origin.x + view.x + r.x * fs * view.scale, y: origin.y + view.y + r.y * fs * view.scale, w: r.w * fs * view.scale, h: r.h * fs * view.scale })

  const onDown = (e: React.PointerEvent) => {
    frameRef.current?.setPointerCapture?.(e.pointerId)
    const p = local(e)
    pointers.current.set(e.pointerId, p)
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [typeof p, typeof p]
      pinch.current = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view }
      drag.current = null
      return
    }
    if (!rect) return
    const handle = hitHandle(p, screenRect(rect))
    drag.current = handle ? { handle, start: rect, at: p } : view.scale > 1 ? { handle: 'move', start: rect, at: p } : null
    if (!handle && view.scale > 1) drag.current = null
  }
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    const p = local(e)
    pointers.current.set(e.pointerId, p)
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()] as [typeof p, typeof p]
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const z = zoomView(pinch.current.view, d / pinch.current.d0, pinch.current.mid)
      setView(clampView({ scale: z.scale, x: z.x + (mid.x - pinch.current.mid.x), y: z.y + (mid.y - pinch.current.mid.y) }, stage))
      return
    }
    const d = drag.current
    if (!d || !bounds) return
    const k = fs * view.scale
    setRect(dragRect(d.start, d.handle, (p.x - d.at.x) / k, (p.y - d.at.y) / k, bounds))
  }
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 0) drag.current = null
  }

  // Desktop: the wheel zooms the view for precision.
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const on = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      setView((v) => clampView(zoomView(v, Math.exp(-e.deltaY * 0.002), { x: e.clientX - r.left, y: e.clientY - r.top }), stage))
    }
    el.addEventListener('wheel', on, { passive: false })
    return () => el.removeEventListener('wheel', on)
  }, [stage.w, stage.h]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => rootRef.current?.focus(), [])
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return void (e.stopPropagation(), cancel())
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).tagName !== 'SELECT') return void (e.preventDefault(), void confirm())
    if (e.key.startsWith('Arrow') && rect && bounds) {
      e.preventDefault()
      setRect(nudgeRect(rect, e.key, e.shiftKey, e.altKey, bounds))
    }
  }

  const sr = rect ? screenRect(rect) : null
  const size = rect ? pixelSize(rect) : null
  const chosen: Candidate | null = analysis ? (choice === 'high' ? high : choice === 'original' ? analysis.original : analysis.compressed) : null
  const btn = `rounded-ui border border-white/30 bg-white/10 px-3 text-sm text-white hover:bg-white/20 disabled:opacity-40 ${touch ? 'min-h-11' : 'py-1.5'}`
  const hs = touch ? 28 : 16

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Crop picture"
      tabIndex={-1}
      onKeyDown={onKey}
      className="fixed inset-0 z-[70] flex flex-col bg-black text-white outline-none"
      style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
    >
      <div ref={frameRef} data-testid="crop-frame" className="relative min-h-0 flex-1 touch-none select-none overflow-hidden" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {natural && (
          <>
            <div className="absolute origin-top-left" style={{ left: origin.x, top: origin.y, width: stage.w, height: stage.h, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
              <div ref={canvasHost} className="h-full w-full" />
            </div>
            {sr && (
              <>
                <div aria-hidden="true" className="pointer-events-none absolute border-2 border-white" style={{ left: sr.x, top: sr.y, width: sr.w, height: sr.h, boxShadow: '0 0 0 9999px rgba(0,0,0,.55)' }} />
                {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const).map((h) => {
                  const cx = h.includes('w') ? sr.x : h.includes('e') ? sr.x + sr.w : sr.x + sr.w / 2
                  const cy = h.includes('n') ? sr.y : h.includes('s') ? sr.y + sr.h : sr.y + sr.h / 2
                  return <div key={h} data-handle={h} aria-hidden="true" className="pointer-events-none absolute rounded-full border-2 border-black bg-white" style={{ left: cx - hs / 2, top: cy - hs / 2, width: hs, height: hs }} />
                })}
              </>
            )}
          </>
        )}
        {!natural && !error && <p className="absolute inset-0 grid place-items-center text-sm text-white/70">Loading…</p>}
        {error && (
          <p role="alert" className="absolute inset-x-4 top-4 rounded-ui bg-red-900/90 px-3 py-2 text-sm">
            {error}
          </p>
        )}
      </div>

      <div className="space-y-2 border-t border-white/20 bg-neutral-900 px-3 pt-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span data-testid="crop-size" className="tabular-nums text-white/80">
            {size ? `${size.w} × ${size.h} px` : ''}
            {chosen ? ` → ${chosen.width} × ${chosen.height} px, about ${formatBytes(chosen.blob.size)}` : busy ? ' …' : ''}
          </span>
          <span className="ml-auto flex flex-wrap gap-2">
            <button type="button" aria-label="Rotate left" title="Rotate left" onClick={() => rotateBy('left')} className={btn}>
              <Icon name="redo" size={16} className="-scale-x-100" />
            </button>
            <button type="button" aria-label="Rotate right" title="Rotate right" onClick={() => rotateBy('right')} className={btn}>
              <Icon name="redo" size={16} />
            </button>
            <button type="button" onClick={() => natural && setRect(fullRect(bounds ?? natural))} className={btn}>
              Full image
            </button>
            {draft.retake && (
              <button type="button" onClick={() => void retake()} className={btn}>
                Retake
              </button>
            )}
          </span>
        </div>

        {showChoice && analysis && (
          <div className="rounded-ui bg-white p-2 text-neutral-900">
            <ChoiceControl value={choice === 'high' ? 'compressed' : choice} onChange={setChoice} compressed={analysis.compressed.blob.size} original={analysis.original?.blob.size ?? null} originalDisabled={analysis.originalProblem} />
            {analysis.originalProblem && <p className="mt-1 text-xs">{analysis.originalProblem}</p>}
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4" />
                Don&apos;t ask me again, always use this choice
              </label>
              <button type="button" onClick={() => setMore(!more)} className="text-brand underline">
                More options
              </button>
              {more && (
                <label className="flex items-center gap-1">
                  <input type="radio" name="hi" checked={choice === 'high'} disabled={!high} onChange={() => setChoice('high')} /> High (2400 px){high ? ` - ${formatBytes(high.blob.size)}` : '…'}
                </label>
              )}
            </div>
          </div>
        )}
        {analysis && !showChoice && analysis.originalProblem && choice === 'original' && <p className="text-xs text-amber-300">{analysis.originalProblem}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => (showNotice('Cancelled.', 1500), cancel())} className={btn}>
            Cancel
          </button>
          <button type="button" data-autofocus disabled={!analysis || busy || !chosen} onClick={() => void confirm()} className={`rounded-ui bg-brand px-4 text-sm font-semibold text-brand-ink disabled:opacity-40 ${touch ? 'min-h-11' : 'py-1.5'}`}>
            Use selection
          </button>
        </div>
      </div>
    </div>
  )
}
