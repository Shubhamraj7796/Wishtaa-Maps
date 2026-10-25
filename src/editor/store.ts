import { create } from 'zustand'
import type { SaveSnapshot } from '@/core/autosave'
import type { Corner } from '@/core/images/resize'
import type { TopicMap } from '@/core/model/tree'

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

export interface EditorState {
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
  canUndo: boolean
  canRedo: boolean
  paletteOpen: boolean
  helpOpen: boolean
}

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 3

export const useEditor = create<EditorState>(() => ({
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
  canUndo: false,
  canRedo: false,
  paletteOpen: false,
  helpOpen: false,
}))
