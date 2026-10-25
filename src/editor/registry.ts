import * as A from './actions'
import {
  clearImageSelection,
  cmdAddImage,
  currentTopicId,
  nudgeImage,
  removeImage,
  resetImageSize,
  selectImage,
  selectedImageTopic,
} from './images'
import { useEditor } from './store'

export interface Cmd {
  id: string
  label: string
  group: 'Edit' | 'Navigate' | 'View' | 'Tools'
  /** Chords that trigger it, e.g. "Ctrl+Shift+Z". The first is shown in the UI. */
  keys?: string[]
  /** Shown instead of `keys` when the shortcut is handled elsewhere (paste event). */
  hint?: string
  run: () => void
  /** Hide from the command palette (e.g. arrow keys). */
  palette?: boolean
}

const st = useEditor.getState

export const COMMANDS: Cmd[] = [
  { id: 'child', label: 'Add child topic', group: 'Edit', keys: ['Tab'], run: A.cmdAddChild },
  { id: 'sibling', label: 'Add sibling topic', group: 'Edit', keys: ['Enter'], run: A.cmdAddSibling },
  { id: 'floating', label: 'Add floating topic', group: 'Edit', run: () => A.cmdAddFloating() },
  { id: 'rename', label: 'Rename topic', group: 'Edit', keys: ['F2'], run: () => A.beginEdit() },
  {
    id: 'delete',
    label: 'Delete topic (or the selected image)',
    group: 'Edit',
    keys: ['Delete', 'Backspace'],
    run: () => (selectedImageTopic() ? removeImage() : A.cmdDelete()),
  },
  { id: 'collapse', label: 'Collapse / expand branch', group: 'Edit', keys: ['/'], run: A.cmdToggleCollapse },
  { id: 'up', label: 'Move topic up', group: 'Edit', keys: ['Alt+ArrowUp'], run: () => A.cmdReorder(-1) },
  { id: 'down', label: 'Move topic down', group: 'Edit', keys: ['Alt+ArrowDown'], run: () => A.cmdReorder(1) },
  { id: 'detach', label: 'Detach to floating topic', group: 'Edit', run: A.cmdDetach },
  { id: 'undo', label: 'Undo', group: 'Edit', keys: ['Ctrl+Z'], run: A.cmdUndo },
  { id: 'redo', label: 'Redo', group: 'Edit', keys: ['Ctrl+Y', 'Ctrl+Shift+Z'], run: A.cmdRedo },
  { id: 'copy', label: 'Copy', group: 'Edit', keys: ['Ctrl+C'], run: () => void A.cmdCopy() },
  { id: 'cut', label: 'Cut', group: 'Edit', keys: ['Ctrl+X'], run: A.cmdCut },
  { id: 'paste', label: 'Paste', group: 'Edit', hint: 'Ctrl+V', run: () => {}, palette: false },
  { id: 'pasteImage', label: 'Paste an image into the selected topic', group: 'Edit', hint: 'Ctrl+V', run: () => {}, palette: false },
  { id: 'addImage', label: 'Add image to topic…', group: 'Edit', run: () => void cmdAddImage() },
  { id: 'removeImage', label: 'Remove image from topic', group: 'Edit', run: () => removeImage() },
  {
    id: 'selectImage',
    label: 'Select topic image (to resize)',
    group: 'Edit',
    keys: ['I'],
    run: () => {
      const id = currentTopicId()
      if (id) selectImage(id)
    },
  },
  { id: 'resetImage', label: 'Reset image to original size', group: 'Edit', run: () => void resetImageSize() },
  {
    id: 'imgBigger',
    label: 'Enlarge the selected image',
    group: 'Edit',
    keys: ['Shift+ArrowRight', 'Shift+ArrowUp'],
    run: () => nudgeImage(10),
    palette: false,
  },
  {
    id: 'imgSmaller',
    label: 'Shrink the selected image',
    group: 'Edit',
    keys: ['Shift+ArrowLeft', 'Shift+ArrowDown'],
    run: () => nudgeImage(-10),
    palette: false,
  },
  { id: 'duplicate', label: 'Duplicate', group: 'Edit', keys: ['Ctrl+D'], run: A.cmdDuplicate },
  { id: 'selectAll', label: 'Select all', group: 'Edit', keys: ['Ctrl+A'], run: A.selectAll },

  { id: 'nav-left', label: 'Select left', group: 'Navigate', keys: ['ArrowLeft'], run: () => A.navigate('left'), palette: false },
  { id: 'nav-right', label: 'Select right', group: 'Navigate', keys: ['ArrowRight'], run: () => A.navigate('right'), palette: false },
  { id: 'nav-up', label: 'Select up', group: 'Navigate', keys: ['ArrowUp'], run: () => A.navigate('up'), palette: false },
  { id: 'nav-down', label: 'Select down', group: 'Navigate', keys: ['ArrowDown'], run: () => A.navigate('down'), palette: false },
  { id: 'search', label: 'Search topics and notes', group: 'Navigate', keys: ['Ctrl+F'], run: A.openSearch },
  { id: 'palette', label: 'Command palette', group: 'Navigate', keys: ['Ctrl+K'], run: () => A.setPalette(true), palette: false },
  { id: 'help', label: 'Keyboard shortcuts', group: 'Navigate', keys: ['?'], run: () => A.setHelp(true) },
  { id: 'escape', label: 'Close / deselect', group: 'Navigate', keys: ['Escape'], run: escape, palette: false },

  { id: 'fit', label: 'Fit to screen', group: 'View', keys: ['Ctrl+0'], run: A.fitToScreen },
  { id: 'zoom100', label: 'Zoom to 100%', group: 'View', keys: ['Ctrl+1'], run: A.zoomTo100 },
  { id: 'zoomIn', label: 'Zoom in', group: 'View', keys: ['Ctrl+=', 'Ctrl++'], run: () => A.zoomBy(1.25) },
  { id: 'zoomOut', label: 'Zoom out', group: 'View', keys: ['Ctrl+-'], run: () => A.zoomBy(0.8) },
  { id: 'focus', label: 'Focus on branch (toggle)', group: 'View', keys: ['Ctrl+Shift+F'], run: A.toggleFocus },
  { id: 'lvl1', label: 'Show level 1', group: 'View', keys: ['Alt+1'], run: () => A.setLevels(1) },
  { id: 'lvl2', label: 'Show levels 1–2', group: 'View', keys: ['Alt+2'], run: () => A.setLevels(2) },
  { id: 'lvl3', label: 'Show levels 1–3', group: 'View', keys: ['Alt+3'], run: () => A.setLevels(3) },
  { id: 'lvlAll', label: 'Show all levels', group: 'View', keys: ['Alt+0'], run: () => A.setLevels(null) },
  { id: 'fullscreen', label: 'Toggle fullscreen', group: 'View', run: A.toggleFullscreen },

  { id: 'toolPan', label: 'Hand tool (drag to pan)', group: 'Tools', keys: ['H'], run: () => A.setTool('pan') },
  { id: 'toolSelect', label: 'Select tool (drag to box-select)', group: 'Tools', keys: ['V'], run: () => A.setTool('select') },
]

function escape() {
  const s = st()
  if (s.menu) return A.closeMenu()
  if (selectedImageTopic()) return clearImageSelection()
  if (s.helpOpen) return A.setHelp(false)
  if (s.paletteOpen) return A.setPalette(false)
  if (s.search.open) return A.closeSearch()
  if (s.focusId) return A.toggleFocus()
  if (s.selected.length) A.clearSelection()
}

export function chordOf(e: KeyboardEvent): string {
  let key = e.key
  if (key === ' ') key = 'Space'
  const letter = key.length === 1 && /[a-z]/i.test(key)
  if (key.length === 1) key = key.toUpperCase()
  const mods: string[] = []
  if (e.ctrlKey || e.metaKey) mods.push('Ctrl')
  if (e.altKey) mods.push('Alt')
  // Shift is part of the character for symbols such as "?" and "+".
  if (e.shiftKey && (letter || key.length > 1)) mods.push('Shift')
  return [...mods, key].join('+')
}

const byChord = new Map<string, Cmd>()
for (const c of COMMANDS) for (const k of c.keys ?? []) byChord.set(k.toUpperCase(), c)

export function commandFor(e: KeyboardEvent): Cmd | undefined {
  return byChord.get(chordOf(e).toUpperCase())
}

export function displayKeys(c: Cmd): string {
  return c.hint ?? c.keys?.[0] ?? ''
}
