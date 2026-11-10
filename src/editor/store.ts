import { loadPrefs, type Shape, type ToolStyles } from './pdf/toolPrefs'
import type { PanelSize } from './pdf/layout'
import { emptyPdfState, type PdfState, type Rect } from '@/core/pdf/types'
import { readOutlineZoom } from './navigation'
import type { ThemePreview } from '@/core/theme/apply'
import { create } from 'zustand'
import type { SaveSnapshot } from '@/core/autosave'
import { emptyObjects, type MapObjects, type ObjectRef } from '@/core/model/objects'
import type { Corner } from '@/core/images/resize'
import type { TopicStyle } from '@/core/model/types'
import type { TopicMap } from '@/core/model/tree'
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
export type PdfTool = 'select' | 'eraser' | 'highlight' | 'underline' | 'strike' | 'pen' | 'text' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'whiteout' | 'link' | 'capture'

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
  /** How much of the editor the PDF takes. */
  size: PanelSize
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
}
export const closedCapture = (): CaptureState => ({ targetId: null, mode: 'sub', keep: false, picking: false, choice: null, last: {}, lastNewId: null, count: 0 })

export const closedPdfPanel = (): PdfPanelState => {
  const prefs = loadPrefs()
  return { open: false, sourceId: null, page: 1, tab: 'pages', tool: 'select', styles: prefs.styles, shape: prefs.shape, size: 'normal', collapsed: false, drawer: false, toolSide: prefs.bar?.side ?? 'left', zoom: null, focus: null, markId: null, tabs: [], other: null, activeSide: 'left', views: {}, ratio: 0.5, sync: false, outlineColumn: false, capture: closedCapture() }
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
export type ViewMode = 'map' | 'outline'
export type DetailsSection = 'picture' | 'tags' | 'task' | 'link' | 'attachments' | 'inline' | 'latex' | 'table'

export interface EditorState {
  /** The file open in the editor. */
  fileId: string | null
  fileType: 'map' | 'kb' | null
  topics: TopicMap
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
