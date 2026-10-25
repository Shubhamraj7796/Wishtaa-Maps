import { create } from 'zustand'
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
  saveState: 'saved' | 'saving' | 'error'
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
  saveState: 'saved',
  canUndo: false,
  canRedo: false,
  paletteOpen: false,
  helpOpen: false,
}))
