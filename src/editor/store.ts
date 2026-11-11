import { loadPrefs, type Presets, type Shape, type ToolId, type ToolStyles } from './pdf/toolPrefs'
import type { PanelSize } from './pdf/layout'
import { loadPdfUi } from './pdf/uiPrefs'
import { emptyPdfState, type PdfState, type Rect } from '@/core/pdf/types'
import { readOutlineZoom } from './navigation'
import type { ThemePreview } from '@/core/theme/apply'
import { create } from 'zustand'
import type { SaveSnapshot } from '@/core/autosave'
import { emptyObjects, type MapObjects, type ObjectRef } from '@/core/model/objects'
import type { Corner } from '@/core/images/resize'
import type { TopicStyle } from '@/core/model/types'
import type { TopicMap } from '@/core/model/tree'
import type { NoteItem } from '@/core/model/notes'
import type { TaskItem } from '@/core/model/tasks'
import type { ItemCount } from '@/core/layout/types'
import { DEFAULT_SETTINGS, type MapSettings } from '@/core/settings'

export interface Viewport {
  x: number
  y: number
  k: number
}

export interface SearchState {
  open: boolean
  query: string
  matches: string[]
  index: number
}

/** Where a new picture goes: onto a topic, as a new child topic, or in place of the topic's picture. */
export type PictureTarget = { kind: 'topic'; id: string } | { kind: 'child'; parentId: string } | { kind: 'replace'; id: string }
/** What the pointer does on a PDF page. */
import type { SourceView } from './pdf/workspace'
export type PdfTool = 'select' | 'eraser' | 'highlight' | 'underline' | 'strike' | 'pen' | 'text' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'whiteout' | 'link' | 'lasso' | 'capture'

export interface PdfPanelState {
  open: boolean
  sourceId: string | null
  /** The page being looked at (1-based). */
  page: number
  /** Pages, or the list of markup. */
  tab: 'pages' | 'markup'
  tool: PdfTool
  /** Each marking tool's own colour, size and strength (kept on this device). */
  styles: ToolStyles
  /** The shape the Shapes button last used. */
  shape: Shape
  /** Which tools the floating bar shows, in order (kept on this device). */
  toolList: ToolId[]
  /** Saved colour-and-size choices for each tool (kept on this device). */
  presets: Presets
  /** Markup chosen with the lasso: the page they are on and their ids. */
  lasso: { sourceId: string; page: number; ids: string[] } | null
  /** How much of the editor the PDF takes. */
  size: PanelSize
  /** The size the panel had before Two-page view widened it to Full (null when nothing was widened, or when the size was set by hand since). */
  widenedFrom: PanelSize | null
  /** Focus mode: every control is hidden except a tiny handle, so the page has all the room. */
  focusMode: boolean
  /** The floating markup bar is showing (the Markup button in the top bar). */
  markupBar: boolean
  /** The thumbnail strip beside the pages (off by default, remembered on this device). */
  thumbs: boolean
  /** The panel is tucked away to a small tab; the PDF stays open. */
  collapsed: boolean
  /** In full screen, the Outline slides over the PDF. */
  drawer: boolean
  /** Which edge of the PDF the floating tools are on (the Outline button goes on the other). */
  toolSide: 'left' | 'right'
  /** Zoom: null fits the width of the panel. */
  zoom: number | null
  /** A passage to show and mark (a source link was clicked, or a topic with one was selected). `at` makes the same place show again. */
  focus: { sourceId: string; page: number; rect?: Rect; at: number } | null
  /** The markup chosen on the page (it shows its own small bar). */
  markId: string | null
  /** Every PDF open in a tab, in order. The PDF stays in the map when its tab is closed. */
  tabs: string[]
  /** The PDF in the other pane when two are side by side (the active one is `sourceId`). */
  other: string | null
  /** Which side the active pane is on. */
  activeSide: 'left' | 'right'
  /** Where each open PDF was left: page, zoom and place on the page. */
  views: Record<string, SourceView>
  /** The share of the PDF area the left (or top) pane takes when split. */
  ratio: number
  /** Scrolling one pane scrolls the other. */
  sync: boolean
  /** On wide screens: the Outline in a third column beside the PDFs. */
  outlineColumn: boolean
  /** "Capture area": where captures go and how. */
  capture: CaptureState
}

/** Where a new capture goes: always a NEW topic, never a change to an existing picture. */
export type CaptureMode = 'sub' | 'sibling' | 'branch'
export interface CaptureState {
  /** The topic captures go into: pinned when capture starts, changed only on purpose ("Change"). */
  targetId: string | null
  mode: CaptureMode
  /** Capture stays on after each capture. */
  keep: boolean
  /** Waiting for a topic to be chosen in the map or the Outline as the new target. */
  picking: boolean
  /** Compressed or Original, asked once per capture session. */
  choice: 'compressed' | 'original' | null
  /** The last target used for each PDF (the next capture session starts there when nothing is selected). */
  last: Record<string, string>
  /** The topic made by the latest capture (the next "Next sibling" goes after it) and how many this session. */
  lastNewId: string | null
  count: number
  /** Name each new topic from its page, like "Audit may 24, p. 3" (off by default; remembered on this device). */
  nameFromPage: boolean
  /** Use the text inside the rectangle as the topic's title when the PDF has a text layer (off by default; remembered on this device). */
  textAsTitle: boolean
}
const CAPTURE_OPTIONS = 'wishtaamaps:capture-options'
export function loadCaptureOptions(): { nameFromPage: boolean; textAsTitle: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(CAPTURE_OPTIONS) ?? '{}') as { nameFromPage?: unknown; textAsTitle?: unknown }
    return { nameFromPage: v.nameFromPage === true, textAsTitle: v.textAsTitle === true }
  } catch {
    return { nameFromPage: false, textAsTitle: false }
  }
}
export function saveCaptureOptions(o: { nameFromPage: boolean; textAsTitle: boolean }) {
  try {
    localStorage.setItem(CAPTURE_OPTIONS, JSON.stringify(o))
  } catch {
    /* not remembered */
  }
}
export const closedCapture = (): CaptureState => ({ targetId: null, mode: 'sub', keep: false, picking: false, choice: null, last: {}, lastNewId: null, count: 0, ...loadCaptureOptions() })

export const closedPdfPanel = (): PdfPanelState => {
  const prefs = loadPrefs()
  return { open: false, sourceId: null, page: 1, tab: 'pages', tool: 'select', styles: prefs.styles, shape: prefs.shape, toolList: prefs.tools, presets: prefs.presets, lasso: null, size: 'normal', widenedFrom: null, focusMode: false, markupBar: false, thumbs: loadPdfUi().thumbs, collapsed: false, drawer: false, toolSide: prefs.bar?.side ?? 'left', zoom: null, focus: null, markId: null, tabs: [], other: null, activeSide: 'left', views: {}, ratio: 0.5, sync: false, outlineColumn: false, capture: closedCapture() }
}

export type PictureSource = 'upload' | 'camera' | 'gallery' | 'paste' | 'capture' | 'drop'

export interface PictureDraft {
  blob: Blob
  source: PictureSource
  target: PictureTarget
  /** Takes the picture again (camera, screen capture). */
  retake?: () => Promise<Blob | null>
}

export interface PictureChoiceRequest {
  /** `count` is how many pictures an entry stands for (an import asks once for all of a file's pictures). */
  items: { name: string; original: number; compressed: number; count?: number }[]
  /** A picture to preview, original then compressed (single pictures). */
  preview?: { original: Blob; compressed: Blob }
  resolve: (answer: { choice: 'compressed' | 'original'; remember: boolean } | null) => void
}

export type ReadReason = 'user' | 'file' | 'preference' | 'drive' | 'link'

export interface Notice {
  id: number
  text: string
  /** A button on the notice (for example Undo). */
  action?: { label: string; run: () => void }
}

export interface ImageLive {
  topicId: string
  width: number
  height: number
  corner: Corner
}

export type PanelTab = 'canvas' | 'style' | 'picture' | 'object' | 'mark' | 'clipart' | 'details' | 'notes'

/** What is selected, which decides which section of the settings panel is shown. */
export type SelectionKind = 'none' | 'topic' | 'topics' | 'picture' | 'object'

/** Why the settings panel is open: it closes itself only when it opened by itself. */
export type PanelOpener = 'selection' | 'hover' | 'handle' | null
export type ViewMode = 'map' | 'outline' | 'tasks'
export type DetailsSection = 'picture' | 'tags' | 'task' | 'link' | 'attachments' | 'inline' | 'latex' | 'table'

export interface EditorState {
  /** The file open in the editor. */
  fileId: string | null
  fileType: 'map' | 'kb' | null
  topics: TopicMap
  /** The notes of the open map beyond each topic's first one. */
  notes: Record<string, NoteItem>
  /** The tasks of their own of the open map. */
  tasks: Record<string, TaskItem>
  /** How many notes and open tasks each topic has (only topics with some). */
  itemCounts: Record<string, ItemCount>
  rootId: string
  selected: string[]
  editingId: string | null
  viewport: Viewport
  /** How big the Outline is shown (1 = 100%). The map has its own zoom in `viewport`. */
  outlineZoom: number
  canvasSize: { w: number; h: number }
  tool: 'pan' | 'select'
  levels: number | null
  focusId: string | null
  search: SearchState
  reveal: string[]
  save: SaveSnapshot
  title: string
  /** Topic whose image is selected (shows resize handles). Only effective while that topic is the sole selection. */
  imageSelected: string | null
  /** Size of an image while it is being dragged to a new size. */
  imageLive: ImageLive | null
  /** The width a topic is being dragged to (shown live; saved as one undo step on release). */
  widthLive: { id: string; width: number } | null
  /** A style change shown on the canvas while a slider is dragged (nothing is saved until release). */
  styleLive: { ids: string[]; patch: Partial<TopicStyle> } | null
  /** Read mode: nothing can be changed (see `readmode.ts`). */
  readOnly: boolean
  /** False when the file can only be read (no permission in Drive): the Edit button is hidden. */
  canEdit: boolean
  /** Why the file is being read, for the badge and the explanation. */
  readReason: ReadReason | null
  /** The file opens in Read mode by default (so switching to Edit shows a brief tip). */
  readFileDefault: boolean
  /** Read mode only: collapse state the reader changed. View state, never saved. */
  viewCollapsed: Record<string, boolean>
  /** Read mode: the notes and tags panel is open. */
  readPanelOpen: boolean
  /** Said aloud to screen readers when the mode changes. */
  modeAnnouncement: string
  /** Whether branch controls change this topic's branch only, or also every branch below it. */
  branchScope: 'this' | 'branch'
  /** What "apply" reaches in the Style panel: the selected topics, all topics at their level, or their whole branch. */
  styleScope: 'selection' | 'level' | 'branch'
  notice: Notice | null
  menu: { x: number; y: number; topicId: string } | null
  settings: MapSettings
  /** The PDFs, markup and page edits of the open map. */
  pdf: PdfState
  pdfPanel: PdfPanelState
  /** A PDF is asking for its password (the dialog is shown while this is set). */
  pdfPassword: { name: string; wrong: boolean } | null
  panelOpen: boolean
  minimap: boolean
  panelTab: PanelTab
  /** The person picked a tab by hand: kept until the kind of selection changes. */
  panelTabManual: boolean
  /** Things inside the panel (a dropdown, a colour picker) that are open right now. */
  panelBusy: number
  panelOpener: PanelOpener
  /** A topic or box selection is being dragged. */
  dragging: boolean
  /** Said aloud when the panel opens a section by itself. */
  panelAnnouncement: string
  /** The Add picture menu is open for this target. */
  pictureMenu: PictureTarget | null
  /** A picture being cropped before it is added. */
  pictureDraft: PictureDraft | null
  /** The choice between Compressed and Original is waiting for an answer. */
  pictureChoice: PictureChoiceRequest | null
  /** Apply style changes to the whole branch, not just the selected topics. */
  /** Copied topic format; while set, clicking a topic paints it (format painter). */
  painter: TopicStyle | null
  /** A theme, colour scheme or thickness shown on the canvas while hovering or dragging (never saved). */
  themePreview: ThemePreview | null
  /** The last copied format (kept after the painter is used). */
  copiedFormat: TopicStyle | null
  /** Diagram objects beside the topic tree. */
  objects: MapObjects
  /** The relationship, callout, boundary or summary currently selected. */
  selectedObject: ObjectRef | null
  /** Object whose text is being edited in place. */
  editingObject: ObjectRef | null
  /** While set, the next topic clicked becomes the end of a new relationship line. */
  relationFrom: string | null
  /** While set, the next topic clicked becomes the target of that topic's link. */
  linkFrom: string | null
  view: ViewMode
  /** Only topics with one of these tags are fully visible. */
  tagFilter: string[]
  /** Section of the Details tab to bring into view. */
  detailsSection: DetailsSection | null
  insertOpen: boolean
  /** Picture shown full size in a preview. */
  lightbox: string | null
  /** Topic whose picture is being read with OCR. */
  ocrTopic: string | null
  canUndo: boolean
  canRedo: boolean
  paletteOpen: boolean
  helpOpen: boolean
}

export { MIN_ZOOM, MAX_ZOOM } from './navigation'

export const useEditor = create<EditorState>(() => ({
  fileId: null,
  fileType: null,
  topics: {},
  notes: {},
  tasks: {},
  itemCounts: {},
  rootId: '',
  selected: [],
  editingId: null,
  viewport: { x: 0, y: 0, k: 1 },
  outlineZoom: readOutlineZoom(),
  canvasSize: { w: 0, h: 0 },
  tool: 'pan',
  levels: null,
  focusId: null,
  search: { open: false, query: '', matches: [], index: 0 },
  reveal: [],
  save: { status: 'saved', savedAt: null, error: null },
  title: 'Untitled map',
  imageSelected: null,
  imageLive: null,
  widthLive: null,
  styleLive: null,
  readOnly: false,
  canEdit: true,
  readReason: null,
  readFileDefault: false,
  viewCollapsed: {},
  readPanelOpen: false,
  modeAnnouncement: '',
  branchScope: 'this',
  styleScope: 'selection',
  notice: null,
  menu: null,
  settings: DEFAULT_SETTINGS,
  pdf: emptyPdfState(),
  pdfPanel: closedPdfPanel(),
  pdfPassword: null,
  panelOpen: false,
  minimap: true,
  panelTab: 'canvas',
  panelTabManual: false,
  panelBusy: 0,
  panelOpener: null,
  dragging: false,
  panelAnnouncement: '',
  pictureMenu: null,
  pictureDraft: null,
  pictureChoice: null,
  painter: null,
  themePreview: null,
  copiedFormat: null,
  objects: emptyObjects(),
  selectedObject: null,
  editingObject: null,
  relationFrom: null,
  linkFrom: null,
  view: 'map',
  tagFilter: [],
  detailsSection: null,
  insertOpen: false,
  lightbox: null,
  ocrTopic: null,
  canUndo: false,
  canRedo: false,
  paletteOpen: false,
  helpOpen: false,
}))
