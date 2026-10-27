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

export interface Notice {
  id: number
  text: string
}

export interface ImageLive {
  topicId: string
  width: number
  height: number
  corner: Corner
}

export type PanelTab = 'layout' | 'theme' | 'style' | 'mark' | 'clipart' | 'details' | 'notes'
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
  notice: Notice | null
  menu: { x: number; y: number; topicId: string } | null
  settings: MapSettings
  panelOpen: boolean
  minimap: boolean
  panelTab: PanelTab
  /** Apply style changes to the whole branch, not just the selected topics. */
  styleBranch: boolean
  /** Copied topic format; while set, clicking a topic paints it (format painter). */
  painter: TopicStyle | null
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

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 3

export const useEditor = create<EditorState>(() => ({
  fileId: null,
  fileType: null,
  topics: {},
  rootId: '',
  selected: [],
  editingId: null,
  viewport: { x: 0, y: 0, k: 1 },
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
  notice: null,
  menu: null,
  settings: DEFAULT_SETTINGS,
  panelOpen: false,
  minimap: true,
  panelTab: 'layout',
  styleBranch: false,
  painter: null,
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
