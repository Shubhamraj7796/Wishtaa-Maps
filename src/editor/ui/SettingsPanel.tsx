import { Suspense, useEffect, useRef, useState } from 'react'
import { useSettings } from '@/stores/settings'
import { Icon, type IconName } from '@/ui/icons'
import * as A from '../actions'
import { afterSelection, closesOnLeave, HOT_ZONE_PX, HOVER_CLOSE_MS, HOVER_OPEN_MS, PANEL_WIDTH, panToReveal, SECTION_NAME, SELECTION_SETTLE_MS, selectionKind, TAB_FOR_KIND } from '../panel/behaviour'
import { isPanelBusy } from '../panel/busy'
import { getScene } from '../scene'
import { useEditor, type PanelTab } from '../store'
import { CanvasTab } from './CanvasTab'
import { StyleTab } from './StyleTab'
import { DetailsPanelLazy } from './lazyPanels'
import { MarkPanel } from './MarkPanel'
import { ObjectStyle } from './ObjectStyle'
import { PictureFormat } from './PictureFormat'

const ICON: Record<PanelTab, IconName> = { canvas: 'layout', style: 'style', picture: 'image', object: 'relationship', mark: 'mark', clipart: 'clipart', details: 'details', notes: 'notes' }
const TAB_TIP: Record<PanelTab, string> = {
  canvas: 'Canvas: layout, theme, spacing and background of the whole map',
  style: 'Style: the selected topics',
  picture: 'Picture format: size, position and description',
  object: 'Object style: the selected line, callout, boundary or summary',
  mark: 'Marks: priority, progress, emoji and flags',
  clipart: 'Clipart',
  details: 'Details: tags, task, link, attachments, formula, table',
  notes: 'Notes',
}

function useWide() {
  const query = '(min-width: 768px)'
  const [wide, setWide] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : true))
  useEffect(() => {
    if (!window.matchMedia) return
    const m = window.matchMedia(query)
    const on = () => setWide(m.matches)
    m.addEventListener?.('change', on)
    return () => m.removeEventListener?.('change', on)
  }, [])
  return wide
}

/**
 * The settings panel. It shows what applies to the selection (the Canvas when nothing is selected, Style for topics, Picture
 * format for a picture, Object style for a line, callout, boundary or summary), tucks away to a thin handle on the right edge,
 * and opens by itself when something is selected or the pointer rests on that edge. It overlays the canvas (docked only when
 * pinned) and never takes keyboard focus by itself.
 */
export function SettingsPanel() {
  const readOnly = useEditor((s) => s.readOnly)
  const open = useEditor((s) => s.panelOpen)
  const tab = useEditor((s) => s.panelTab)
  const kind = useEditor((s) => selectionKind(s))
  const selKey = useEditor((s) => `${s.selectedObject ? s.selectedObject.kind + s.selectedObject.id : ''}|${s.imageSelected ?? ''}|${s.selected.join(',')}`)
  const busy = useEditor((s) => isPanelBusy(s))
  const fileId = useEditor((s) => s.fileId)
  const hasPicture = useEditor((s) => (s.selected.length === 1 ? !!s.topics[s.selected[0] as string]?.image : false))
  const announcement = useEditor((s) => s.panelAnnouncement)
  const mode = useSettings((s) => s.panelMode)
  const pinned = useSettings((s) => s.panelPinned)
  const setPinned = useSettings((s) => s.setPanelPinned)
  const wide = useWide()
  const docked = (pinned || mode === 'always') && wide && open

  const hovered = useRef(false)
  const focusWithin = useRef(false)
  const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const aside = useRef<HTMLElement>(null)
  const lastKind = useRef<{ file: string | null; kind: string | null }>({ file: null, kind: null })
  const lastKey = useRef<{ file: string | null; key: string | null }>({ file: null, key: null })

  useEffect(() => () => void [clearTimeout(openTimer.current), clearTimeout(closeTimer.current)], [])

  // The section follows the KIND of selection. A tab picked by hand is kept until the kind changes.
  useEffect(() => {
    if (readOnly) return
    const prev = lastKind.current
    lastKind.current = { file: fileId, kind }
    if (prev.file !== fileId) {
      useEditor.setState({ panelTab: TAB_FOR_KIND[kind], panelTabManual: false })
      return
    }
    if (prev.kind === kind) return
    useEditor.setState({ panelTab: TAB_FOR_KIND[kind], panelTabManual: false, panelAnnouncement: `${SECTION_NAME[TAB_FOR_KIND[kind]]} settings` })
  }, [kind, fileId, readOnly])

  // Selecting opens the panel; clearing the selection tucks it away again. Quick changes settle first, and a drag or resize waits.
  useEffect(() => {
    if (readOnly) return
    if (lastKey.current.file !== fileId) {
      lastKey.current = { file: fileId, key: selKey } // opening a file does not pop the panel up
      return
    }
    lastKey.current = { file: fileId, key: selKey } // also re-checked when a drag ends or a dropdown closes (busy changes)
    const timer = setTimeout(() => {
      const s = useEditor.getState()
      const action = afterSelection({ mode, pinned, open: s.panelOpen, kind: selectionKind(s), busy: isPanelBusy(s) || focusWithin.current, hovered: hovered.current, opener: s.panelOpener })
      if (action === 'open') useEditor.setState({ panelOpen: true, panelOpener: s.panelOpener ?? 'selection', panelAnnouncement: `${SECTION_NAME[s.panelTab]} settings opened` })
      else if (action === 'close') A.closePanel()
    }, SELECTION_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [selKey, busy, mode, pinned, fileId, readOnly])

  // Always: open from the start.
  useEffect(() => {
    if (!readOnly && mode === 'always' && !open) useEditor.setState({ panelOpen: true, panelOpener: 'handle' })
  }, [mode, readOnly, open])

  // The panel overlays the canvas: when it opens over the selected topic, glide the canvas just far enough to keep it visible.
  useEffect(() => {
    if (!open || docked || readOnly) return
    const s = useEditor.getState()
    if (s.selected.length === 0 || isPanelBusy(s)) return
    const id = s.selected[s.selected.length - 1] as string
    const box = getScene().boxes.get(id)
    if (!box || !s.canvasSize.w) return
    const rect = { x: box.x * s.viewport.k + s.viewport.x, y: box.y * s.viewport.k + s.viewport.y, w: box.w * s.viewport.k, h: box.h * s.viewport.k }
    const dx = panToReveal(rect, { w: s.canvasSize.w, h: s.canvasSize.h }, PANEL_WIDTH)
    if (dx > 0) A.panViewportBy(-dx)
  }, [open, docked, selKey, readOnly])

  // Swipe in from the right edge of a touch screen.
  useEffect(() => {
    if (readOnly) return
    let startX = -1
    let startY = 0
    const down = (e: TouchEvent) => {
      const t = e.touches[0]
      startX = t && t.clientX >= window.innerWidth - 24 ? t.clientX : -1
      startY = t?.clientY ?? 0
    }
    const up = (e: TouchEvent) => {
      const t = e.changedTouches[0]
      if (startX >= 0 && t && startX - t.clientX > 50 && Math.abs(t.clientY - startY) < 60 && mode !== 'always') A.openPanel()
      startX = -1
    }
    window.addEventListener('touchstart', down, { passive: true })
    window.addEventListener('touchend', up, { passive: true })
    return () => {
      window.removeEventListener('touchstart', down)
      window.removeEventListener('touchend', up)
    }
  }, [readOnly, mode])

  if (readOnly) return null

  const enter = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    hovered.current = true
    clearTimeout(closeTimer.current)
    if (mode === 'manual' || useEditor.getState().panelOpen) return
    clearTimeout(openTimer.current)
    openTimer.current = setTimeout(() => {
      if (hovered.current && !useEditor.getState().panelOpen) useEditor.setState({ panelOpen: true, panelOpener: 'hover', panelAnnouncement: `${SECTION_NAME[useEditor.getState().panelTab]} settings opened` })
    }, HOVER_OPEN_MS)
  }
  const leave = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    hovered.current = false
    clearTimeout(openTimer.current)
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      if (hovered.current || focusWithin.current) return
      const s = useEditor.getState()
      if (closesOnLeave({ mode, pinned, open: s.panelOpen, busy: isPanelBusy(s), opener: s.panelOpener })) A.closePanel()
    }, HOVER_CLOSE_MS)
  }

  const shownTab: PanelTab = tab === 'picture' && !hasPicture && kind !== 'picture' ? 'style' : tab
  const tabs: PanelTab[] = ['canvas', 'style', ...(hasPicture || kind === 'picture' ? (['picture'] as const) : []), ...(kind === 'object' ? (['object'] as const) : []), 'mark', 'clipart', 'details', 'notes']
  const pick = (t: PanelTab) => useEditor.setState({ panelTab: t, panelTabManual: true })

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {!open && (
        <>
          {mode !== 'manual' && <div aria-hidden="true" data-testid="panel-hot-zone" onPointerEnter={enter} onPointerLeave={leave} className="absolute inset-y-0 right-0 z-10" style={{ width: HOT_ZONE_PX }} />}
          <button
            type="button"
            data-testid="panel-handle"
            aria-label="Open the settings panel"
            aria-expanded={false}
            aria-controls="settings-panel"
            title="Settings (F4)"
            onPointerEnter={enter}
            onPointerLeave={leave}
            onClick={() => A.openPanel()}
            className="absolute right-0 top-1/2 z-20 grid h-20 w-5 -translate-y-1/2 place-items-center rounded-l-ui border border-r-0 border-line bg-surface text-muted shadow-md hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand max-md:bottom-16 max-md:top-auto max-md:h-12 max-md:w-8 max-md:translate-y-0"
          >
            <Icon name="chevronRight" size={16} className="rotate-180" />
          </button>
          {kind !== 'none' && (
            <button
              type="button"
              data-testid="panel-touch-button"
              onClick={() => A.openPanel()}
              className="absolute bottom-16 right-10 z-20 hidden rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium shadow-lg [@media(pointer:coarse)]:block"
            >
              {SECTION_NAME[TAB_FOR_KIND[kind]].split(' ')[0]}
            </button>
          )}
        </>
      )}

      {open && (
        <aside
          ref={aside}
          id="settings-panel"
          role="complementary"
          aria-label="Settings panel"
          data-testid="settings-panel"
          data-docked={docked ? 'true' : 'false'}
          data-no-wheel
          onPointerEnter={enter}
          onPointerLeave={leave}
          onPointerDown={() => {
            if (useEditor.getState().panelOpener === 'hover') useEditor.setState({ panelOpener: 'handle' }) // used, so it stays
          }}
          onFocusCapture={() => (focusWithin.current = true)}
          onBlurCapture={(e) => {
            if (!aside.current?.contains(e.relatedTarget as Node | null)) focusWithin.current = false
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !(e.target as HTMLElement).closest('[role=dialog]')) {
              e.stopPropagation()
              A.closePanel(true)
            }
          }}
          style={{ width: wide ? PANEL_WIDTH : undefined }}
          className={`flex shrink-0 flex-col border-l border-line bg-surface ${
            docked ? 'relative' : 'absolute inset-y-0 right-0 z-30 shadow-2xl'
          } max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:z-40 max-md:h-[70vh] max-md:w-auto max-md:rounded-t-ui max-md:border-t`}
        >
          <div className="flex items-center gap-1 border-b border-line px-3 py-2">
            <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{SECTION_NAME[shownTab]}</h2>
            <button
              type="button"
              aria-pressed={pinned}
              aria-label="Keep the settings panel open"
              title={pinned ? 'Pinned: stays open beside the map. Click to let it tuck away again.' : 'Pin: keep the panel open beside the map'}
              onClick={() => setPinned(!pinned)}
              className={`grid h-8 w-8 place-items-center rounded-ui border max-md:hidden ${pinned ? 'border-brand bg-brand/15' : 'border-transparent hover:bg-bg'}`}
            >
              <Icon name="pin" size={16} />
            </button>
            <button type="button" aria-label="Close the settings panel" title="Close (Esc)" onClick={() => A.closePanel(true)} className="grid h-8 w-8 place-items-center rounded-ui hover:bg-bg">
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="flex border-b border-line" role="tablist" aria-label="Settings sections">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={shownTab === t}
                aria-label={SECTION_NAME[t]}
                title={TAB_TIP[t]}
                onClick={() => pick(t)}
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 py-1.5 text-[10px] leading-tight ${shownTab === t ? 'border-b-2 border-brand text-ink' : 'text-muted hover:text-ink'}`}
              >
                <Icon name={ICON[t]} size={17} />
                <span className="max-w-full truncate">{t === 'picture' ? 'Picture' : t === 'object' ? 'Object' : SECTION_NAME[t]}</span>
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto" role="tabpanel" aria-label={SECTION_NAME[shownTab]}>
            <Suspense fallback={<p className="p-4 text-sm text-muted">Loading…</p>}>
              {shownTab === 'canvas' ? <CanvasTab /> : shownTab === 'style' ? <StyleTab /> : shownTab === 'picture' ? <PictureFormat /> : shownTab === 'object' ? <ObjectStyle /> : shownTab === 'mark' ? <MarkPanel /> : <DetailsPanelLazy tab={shownTab} />}
            </Suspense>
          </div>
        </aside>
      )}
    </>
  )
}
