import { defaultDisplaySize } from '@/core/images/resize'
import { addChild, addSibling, setImage, setSource } from '@/core/model/commands'
import { LOCAL } from '@/core/model/doc'
import type { PdfHandle } from '@/core/pdf/engine'
import type { PdfSource, Rect } from '@/core/pdf/types'
import { useSettings } from '@/stores/settings'
import { releaseUnusedUrls } from '../images'
import { mapDoc } from '../mapdoc'
import { showNotice } from '../notice'
import { prepareCapturedPicture } from '../pictures/flow'
import { mayEdit } from '../readmode'
import { useEditor, closedCapture, type CaptureMode, type CaptureState } from '../store'
import { renderRegion } from './render'

const get = useEditor.getState
const set = useEditor.setState
const patch = (c: Partial<CaptureState>) => set({ pdfPanel: { ...get().pdfPanel, capture: { ...get().pdfPanel.capture, ...c } } })

// ---- the capture session ----------------------------------------------------------------------------------------------------------
/**
 * Capture starts: the target is PINNED now to the topic selected at this moment, or else the last target used for this PDF, or else the
 * central topic. Selecting other topics afterwards does not move it; only "Change" does.
 */
export function beginCapture() {
  const s = get()
  const cap = s.pdfPanel.capture
  const sel = s.selected[s.selected.length - 1]
  const last = s.pdfPanel.sourceId ? cap.last[s.pdfPanel.sourceId] : undefined
  const targetId = sel && s.topics[sel] ? sel : last && s.topics[last] ? last : s.rootId
  patch({ targetId, picking: false, choice: null, lastNewId: null, count: 0 })
}

/** Capture ends: what was asked once (Compressed or Original) is forgotten, the remembered last targets stay. */
export function endCapture() {
  const { last, mode, keep } = get().pdfPanel.capture
  set({ pdfPanel: { ...get().pdfPanel, capture: { ...closedCapture(), last, mode, keep } } })
}

/** Ends capture and goes back to the Select tool. */
export function leaveCapture() {
  set({ pdfPanel: { ...get().pdfPanel, tool: 'select' } })
  endCapture()
}

export const setCaptureMode = (mode: CaptureMode) => patch({ mode })
export const setCaptureKeep = (keep: boolean) => patch({ keep })
/** "Change": the next topic chosen in the map or the Outline becomes the target. */
export function beginPickTarget() {
  patch({ picking: true })
  set({ selected: [], imageSelected: null }) // so choosing even the old target is a visible choice
}
export const cancelPickTarget = () => patch({ picking: false })
export const setCaptureTarget = (id: string) => void (get().topics[id] && patch({ targetId: id, picking: false }))

export const topicLabel = (id: string | null): string => {
  const s = get()
  if (!id || !s.topics[id]) return 'the central topic'
  const t = s.topics[id]?.text.trim()
  return id === s.rootId ? t || 'the central topic' : t ? (t.length > 40 ? `${t.slice(0, 40)}…` : t) : 'a picture topic'
}

// ---- one capture ------------------------------------------------------------------------------------------------------------------
let busy = false

/**
 * "Capture area": the rectangle is drawn fresh from the PDF and becomes a NEW topic holding the picture, with a link back to the
 * PDF, page and rectangle. It never changes an existing picture (replacing a picture is only the explicit "Replace" on that picture).
 * One undo step. The new topic goes after the existing children of the target ("Sub-topic"), right after the target or the previous
 * capture ("Next sibling"), or under the central topic ("New branch").
 */
export async function captureArea(source: PdfSource, handle: PdfHandle, n: number, rect: Rect) {
  if (!mayEdit('Adding a picture') || busy) return
  busy = true
  try {
    const blob = await renderRegion(handle, n, rect)
    if (!blob) {
      showNotice('That part of the page could not be turned into a picture.')
      return
    }
    const placed = await prepareCapturedPicture(blob, {
      get choice() {
        return get().pdfPanel.capture.choice
      },
      set: (c) => patch({ choice: c }),
    })
    if (!placed) return
    // Read the state NOW: the person may have answered a question, or changed the map, in the meantime.
    const s = get()
    const cap = s.pdfPanel.capture
    const root = s.rootId
    const target = cap.targetId && s.topics[cap.targetId] ? cap.targetId : root
    const size = defaultDisplaySize(placed.width, placed.height, useSettings.getState().capturedPictureWidth)
    let made = ''
    let beside = false
    mapDoc.ydoc.transact(() => {
      let id: string | null = null
      if (cap.mode === 'sibling' && target !== root) {
        const prev = cap.lastNewId ? s.topics[cap.lastNewId] : undefined
        const after = prev && prev.parentId === s.topics[target]?.parentId ? prev.id : target // captures in a row keep their order
        id = addSibling(mapDoc, after, '')
        beside = id !== null
      }
      id ??= addChild(mapDoc, cap.mode === 'branch' ? root : target, '')
      setImage(mapDoc, id, { imageId: placed.id, width: size.width, height: size.height })
      setSource(mapDoc, id, { sourceId: source.id, page: n, rect })
      made = id
    }, LOCAL)
    releaseUnusedUrls()
    const count = cap.count + 1
    patch({ lastNewId: made, count, targetId: target, last: { ...cap.last, [source.id]: target } })
    const parent = cap.mode === 'branch' ? root : target
    const stack = mapDoc.undo.undoStack
    const item = stack[stack.length - 1]
    showNotice(
      beside ? `Added topic ${count} next to "${topicLabel(target)}", page ${n}` : `Added topic ${count} under "${topicLabel(parent)}", page ${n}`,
      9000,
      {
        label: 'Undo',
        run: () => {
          const now = mapDoc.undo.undoStack
          if (now[now.length - 1] === item) {
            mapDoc.undo.undo()
            patch({ count: Math.max(0, get().pdfPanel.capture.count - 1), lastNewId: null })
          } else showNotice('Other changes were made after this capture. Use Undo (Ctrl+Z) to step back through them.')
        },
      }
    )
  } finally {
    busy = false
    if (!get().pdfPanel.capture.keep) leaveCapture()
  }
}
