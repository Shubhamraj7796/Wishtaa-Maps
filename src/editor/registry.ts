import { LAYOUTS } from '@/core/layout/catalog'
import { THEMES } from '@/core/theme/themes'
import { requestCreate, requestOpenFromDrive } from '../app/createBus'
import * as A from './actions'
import * as C from './content'
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
import { blockedInReadMode, toggleReadMode } from './readmode'
import { resolveTarget, startSource } from './pictures/flow'
import { useEditor } from './store'

export interface Cmd {
  id: string
  label: string
  group: 'Edit' | 'Insert' | 'Navigate' | 'View' | 'Tools' | 'Format'
  /** Chords that trigger it, e.g. "Ctrl+Shift+Z". The first is shown in the UI. */
  keys?: string[]
  /** Shown instead of `keys` when the shortcut is handled elsewhere (paste event). */
  hint?: string
  run: () => void
  /** Hide from the command palette (e.g. arrow keys). */
  palette?: boolean
}

const st = useEditor.getState

/** Alt+Shift+Q: one screen capture into the selected topic (or a new child of the focused one). */
const captureToPicture = () => startSource('capture', resolveTarget())

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
    run: () => {
      if (C.deleteSelectedObject()) return
      if (selectedImageTopic()) removeImage()
      else A.cmdDelete()
    },
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
  { id: 'addImage', label: 'Add picture to topic…', group: 'Insert', keys: ['Alt+Shift+P'], run: () => void cmdAddImage() },
  { id: 'captureScreen', label: 'Capture screen as a picture', group: 'Insert', keys: ['Alt+Shift+Q'], run: () => void captureToPicture() },
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
  { id: 'duplicate', label: 'Duplicate', group: 'Edit', keys: ['Alt+Shift+D'], run: A.cmdDuplicate },
  { id: 'selectAll', label: 'Select all', group: 'Edit', keys: ['Ctrl+A'], run: A.selectAll },

  { id: 'nav-left', label: 'Select left', group: 'Navigate', keys: ['ArrowLeft'], run: () => A.navigate('left'), palette: false },
  { id: 'nav-right', label: 'Select right', group: 'Navigate', keys: ['ArrowRight'], run: () => A.navigate('right'), palette: false },
  { id: 'nav-up', label: 'Select up', group: 'Navigate', keys: ['ArrowUp'], run: () => A.navigate('up'), palette: false },
  { id: 'nav-down', label: 'Select down', group: 'Navigate', keys: ['ArrowDown'], run: () => A.navigate('down'), palette: false },
  { id: 'search', label: 'Search topics and notes', group: 'Navigate', keys: ['Ctrl+F'], run: A.openSearch },
  { id: 'palette', label: 'Command palette', group: 'Navigate', keys: ['Ctrl+K'], run: () => A.setPalette(true), palette: false },
  { id: 'widen', label: 'Make topic wider', group: 'Format', keys: ['Alt+Shift+ArrowRight'], run: () => A.nudgeTopicWidth(10) },
  { id: 'narrow', label: 'Make topic narrower', group: 'Format', keys: ['Alt+Shift+ArrowLeft'], run: () => A.nudgeTopicWidth(-10) },
  { id: 'autoWidth', label: 'Automatic topic width', group: 'Format', run: () => A.commitTopicWidth(null) },
  { id: 'newMap', label: 'New mind map…', group: 'Tools', run: () => requestCreate('map') },
  { id: 'newKb', label: 'New knowledge base…', group: 'Tools', run: () => requestCreate('kb') },
  { id: 'openFromDrive', label: 'Open from Google Drive…', group: 'Tools', run: requestOpenFromDrive },
  { id: 'newFolder', label: 'New folder…', group: 'Tools', run: () => requestCreate('folder') },
  { id: 'help', label: 'Keyboard shortcuts', group: 'Navigate', keys: ['?'], run: () => A.setHelp(true) },
  { id: 'escape', label: 'Close / deselect', group: 'Navigate', keys: ['Escape'], run: escape, palette: false },

  { id: 'fit', label: 'Fit to screen', group: 'View', keys: ['Ctrl+0'], run: A.fitToScreen },
  { id: 'zoom100', label: 'Zoom to 100%', group: 'View', keys: ['Alt+Z'], run: A.zoomTo100 },
  { id: 'zoomIn', label: 'Zoom in', group: 'View', keys: ['Ctrl+=', 'Ctrl++'], run: () => A.zoomBy(1.25) },
  { id: 'zoomOut', label: 'Zoom out', group: 'View', keys: ['Ctrl+-'], run: () => A.zoomBy(0.8) },
  { id: 'focus', label: 'Focus on branch (toggle)', group: 'View', keys: ['Ctrl+Shift+F'], run: A.toggleFocus },
  { id: 'lvl1', label: 'Show level 1', group: 'View', keys: ['Alt+Shift+1'], run: () => A.setLevels(1) },
  { id: 'lvl2', label: 'Show levels 1–2', group: 'View', keys: ['Alt+Shift+2'], run: () => A.setLevels(2) },
  { id: 'lvl3', label: 'Show levels 1–3', group: 'View', keys: ['Alt+Shift+3'], run: () => A.setLevels(3) },
  { id: 'lvlAll', label: 'Show all levels', group: 'View', keys: ['Alt+Shift+0'], run: () => A.setLevels(null) },
  { id: 'fullscreen', label: 'Toggle fullscreen', group: 'View', run: A.toggleFullscreen },

  { id: 'relationship', label: 'Relationship line', group: 'Insert', keys: ['Alt+Shift+R'], run: C.startRelationship },
  { id: 'callout', label: 'Callout', group: 'Insert', keys: ['Alt+Shift+O'], run: C.addCalloutToSelected },
  { id: 'boundary', label: 'Boundary', group: 'Insert', keys: ['Alt+Shift+Y'], run: () => C.addBoundaryToSelected() },
  { id: 'summary', label: 'Summary', group: 'Insert', keys: ['Alt+Shift+S'], run: C.addSummaryToSelected },
  { id: 'mark', label: 'Marks (priority, progress, emoji, flags…)', group: 'Insert', keys: ['F9'], run: () => C.openTab('mark') },
  { id: 'clipart', label: 'Clipart', group: 'Insert', keys: ['Alt+Shift+U'], run: () => C.openTab('clipart') },
  { id: 'notes', label: 'Notes (rich text)', group: 'Insert', keys: ['Alt+Shift+E'], run: () => C.openTab('notes') },
  { id: 'inlineNote', label: 'Short note', group: 'Insert', keys: ['Alt+Shift+N'], run: () => C.openTab('details', 'inline') },
  { id: 'tag', label: 'Tags', group: 'Insert', keys: ['Alt+Shift+G'], run: () => C.openTab('details', 'tags') },
  { id: 'task', label: 'Task', group: 'Insert', keys: ['Alt+Shift+K'], run: () => C.openTab('details', 'task') },
  { id: 'link', label: 'Hyperlink', group: 'Insert', keys: ['Alt+Shift+L'], run: () => C.openTab('details', 'link') },
  { id: 'attachment', label: 'Attachment', group: 'Insert', keys: ['Alt+Shift+H'], run: () => C.openTab('details', 'attachments') },
  { id: 'latex', label: 'Formula (LaTeX)', group: 'Insert', keys: ['Alt+Shift+X'], run: () => C.openTab('details', 'latex') },
  { id: 'table', label: 'Table', group: 'Insert', keys: ['Alt+Shift+J'], run: () => C.openTab('details', 'table') },
  { id: 'numbering', label: 'Branch numbers on / off', group: 'Insert', run: C.toggleNumbering },
  { id: 'ocr', label: 'Read text from the topic’s picture (OCR)', group: 'Edit', run: () => { const id = currentTopicId(); if (id) C.startOcr(id) } },
  { id: 'viewMap', label: 'Map view', group: 'View', run: () => C.setView('map') },
  { id: 'viewOutline', label: 'Outline view', group: 'View', keys: ['Alt+Shift+M'], run: () => C.setView(useEditor.getState().view === 'outline' ? 'map' : 'outline') },
  { id: 'clearTagFilter', label: 'Show all topics (clear tag filter)', group: 'View', run: C.clearTagFilter },
  { id: 'panel', label: 'Show / hide the format panel', group: 'Format', keys: ['F4'], run: () => A.togglePanel() },
  { id: 'panelLayout', label: 'Layout settings…', group: 'Format', run: () => A.togglePanel('canvas') },
  { id: 'panelTheme', label: 'Themes and background…', group: 'Format', run: () => A.togglePanel('canvas') },
  { id: 'panelStyle', label: 'Topic style…', group: 'Format', run: () => A.togglePanel('style') },
  { id: 'copyFormat', label: 'Copy topic format', group: 'Format', keys: ['Alt+Shift+C'], run: A.copyFormat },
  { id: 'pasteFormat', label: 'Paste topic format', group: 'Format', keys: ['Alt+Shift+V'], run: A.pasteFormat },
  { id: 'painter', label: 'Format painter (click topics to paint)', group: 'Format', run: A.togglePainter },
  { id: 'resetStyle', label: 'Reset style of selected topics', group: 'Format', run: A.resetStyleSelected },
  { id: 'resetPositions', label: 'Reset manually moved branches', group: 'Format', run: A.resetBranchPositions },
  ...LAYOUTS.map((l) => ({
    id: `layout:${l.id}`,
    label: `Layout: ${l.group} · ${l.label}`,
    group: 'Format' as const,
    run: () => A.setLayout(l.id),
  })),
  ...THEMES.map((t) => ({
    id: `theme:${t.id}`,
    label: `Theme: ${t.name}`,
    group: 'Format' as const,
    run: () => A.selectTheme(t.id),
  })),

  { id: 'readMode', label: 'Read mode (view only) on / off', group: 'View', keys: ['Alt+R'], run: toggleReadMode },
  { id: 'toolPan', label: 'Hand tool (drag to pan)', group: 'Tools', keys: ['H'], run: () => A.setTool('pan') },
  { id: 'toolSelect', label: 'Select tool (drag to box-select)', group: 'Tools', keys: ['V'], run: () => A.setTool('select') },
]

/**
 * Commands that only change what is shown, never the map. Everything else is blocked in Read mode: this list is the only way
 * a command works there, so a new editing command is blocked by default.
 */
export const READ_SAFE = new Set([
  'collapse', 'copy', 'selectAll', 'nav-left', 'nav-right', 'nav-up', 'nav-down', 'search', 'palette', 'help', 'escape',
  'fit', 'zoom100', 'zoomIn', 'zoomOut', 'focus', 'lvl1', 'lvl2', 'lvl3', 'lvlAll', 'fullscreen', 'viewMap', 'viewOutline',
  'clearTagFilter', 'toolPan', 'toolSelect', 'readMode', 'panel',
])

for (const c of COMMANDS) {
  if (READ_SAFE.has(c.id)) continue
  const run = c.run
  c.run = () => {
    if (st().readOnly) return blockedInReadMode(c.label)
    run()
  }
}

function escape() {
  const s = st()
  if (s.editingObject) return C.editObject(null)
  if (s.lightbox) return C.showPreview(null)
  if (s.ocrTopic) return C.startOcr(null)
  if (s.insertOpen) return C.toggleInsert(false)
  if (s.relationFrom) return C.cancelRelationship()
  if (s.linkFrom) return C.cancelLinkPick()
  if (s.selectedObject) return C.selectObject(null)
  if (s.menu) return A.closeMenu()
  if (s.painter) return useEditor.setState({ painter: null })
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
  let letter = key.length === 1 && /[a-z]/i.test(key)
  // With Alt held, the character can be something else (Option+R types an "r" with a mark on a Mac; Alt+Shift+1 types "!"). The
  // physical key is what is meant.
  const physical = e.altKey ? /^(?:Key([A-Z])|Digit(\d))$/.exec(e.code ?? '') : null
  if (physical) {
    key = (physical[1] ?? physical[2]) as string
    letter = true
  }
  if (key.length === 1) key = key.toUpperCase()
  const mods: string[] = []
  if (e.ctrlKey || e.metaKey) mods.push('Ctrl')
  if (e.altKey) mods.push('Alt')
  // Shift is part of the character for symbols such as "?" and "+".
  if (e.shiftKey && (letter || key.length > 1)) mods.push('Shift')
  return [...mods, key].join('+')
}

/**
 * Combinations the browser keeps for itself. The app never handles them and never calls preventDefault on them, so a hard refresh,
 * a new tab, the developer tools and the like always work. Ctrl+Alt (AltGr on many keyboard layouts) is never used either.
 */
const RESERVED = new Set(
  [
    'Ctrl+R', 'Ctrl+Shift+R', 'F5', 'Shift+F5', 'Ctrl+F5', 'Ctrl+Shift+F5', 'F12',
    'Ctrl+T', 'Ctrl+Shift+T', 'Ctrl+W', 'Ctrl+Shift+W', 'Ctrl+N', 'Ctrl+Shift+N', 'Ctrl+L', 'Ctrl+Q',
    'Ctrl+TAB', 'Ctrl+Shift+TAB', 'Ctrl+PAGEUP', 'Ctrl+PAGEDOWN', 'Ctrl+Shift+PAGEUP', 'Ctrl+Shift+PAGEDOWN',
    'Ctrl+Shift+I', 'Ctrl+Shift+J', 'Ctrl+Shift+C', 'Ctrl+Shift+DELETE', 'Ctrl+Shift+BACKSPACE',
    'Ctrl+D', 'Ctrl+H', 'Ctrl+J', 'Ctrl+P', 'Ctrl+S', 'Ctrl+O', 'Ctrl+U',
    'Alt+D', 'Alt+E', 'Alt+F', 'Alt+HOME', 'Alt+ARROWLEFT', 'Alt+ARROWRIGHT', 'Alt+F4',
    'Alt+Shift+T', 'Alt+Shift+B', 'Alt+Shift+I', 'Alt+Shift+A',
    ...Array.from({ length: 9 }, (_, i) => `Ctrl+${i + 1}`),
    ...Array.from({ length: 9 }, (_, i) => `Alt+${i + 1}`),
  ].map((c) => c.toUpperCase())
)

export function isReservedChord(chord: string): boolean {
  const c = chord.toUpperCase()
  return RESERVED.has(c) || c.startsWith('CTRL+ALT+')
}

const byChord = new Map<string, Cmd>()
for (const c of COMMANDS) for (const k of c.keys ?? []) byChord.set(k.toUpperCase(), c)

/** The command a key press runs, or nothing (also for every combination the browser keeps for itself). */
export function commandFor(e: KeyboardEvent): Cmd | undefined {
  const chord = chordOf(e)
  if (isReservedChord(chord)) return undefined
  return byChord.get(chord.toUpperCase())
}

export function displayKeys(c: Cmd): string {
  return c.hint ?? c.keys?.[0] ?? ''
}

export const commandById = (id: string): Cmd | undefined => COMMANDS.find((c) => c.id === id)
