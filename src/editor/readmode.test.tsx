// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { addChild } from '@/core/model/commands'
import { installMemoryLocalStorage } from '../test/memoryStorage'
import * as A from './actions'
import { COMMANDS, READ_SAFE } from './registry'
import { installKeyboard } from './keyboard'
import { enterEditMode, enterReadMode, isReadOnly, toggleReadMode } from './readmode'
import { getScene } from './scene'
import { closeFile, mapDoc, openFile } from './session'
import { useEditor } from './store'
import { SaveStatus } from './ui/SaveStatus'
import { ReadModeSwitch } from './ui/ReadModeSwitch'
import { ReadPanel } from './ui/ReadPanel'
import { OutlineView } from './ui/OutlineView'
import { ContextMenu, CommandPalette } from './ui/Overlays'

const WRITES = ['saveContent', 'update', 'create', 'remove', 'move', 'trash', 'restore', 'emptyTrash', 'duplicate'] as const

let t = 1_700_000_000_000
let repo: RepositoryCore
let child = ''
let grand = ''
let fileId = ''
let unhook: () => void = () => undefined
const writes = () => WRITES.flatMap((m) => ((repo[m] as unknown as { mock?: { calls: unknown[] } }).mock?.calls ?? []).map(() => m))
const topics = () => useEditor.getState().topics
const topicsJson = () => JSON.stringify(Object.values(topics()).map((x) => [x.id, x.text, x.collapsed, x.style, x.parentId]))
const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

beforeEach(async () => {
  installMemoryLocalStorage()
  repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'kb', name: 'IND AS notes', content: buildStarterContent('kb') })
  fileId = f.id
  await openFile(f.id, repo)
  const { rootId } = useEditor.getState()
  child = addChild(mapDoc, rootId, 'Child')
  grand = addChild(mapDoc, child, 'Grandchild')
  await wait(900) // let the edits above save before counting writes
  A.selectOnly(child)
  mapDoc.undo.stopCapturing()
  mapDoc.undo.clear()
  for (const m of WRITES) vi.spyOn(repo, m)
  unhook = installKeyboard()
})
afterEach(async () => {
  unhook()
  cleanup()
  vi.restoreAllMocks()
  await closeFile()
})

describe('switching to Read mode', () => {
  it('flushes a pending edit first and only then locks, so nothing is lost', async () => {
    addChild(mapDoc, useEditor.getState().rootId, 'Last edit') // pending, not saved yet
    expect(useEditor.getState().save.status).toBe('saving')
    const ok = await enterReadMode()
    expect(ok).toBe(true)
    expect(isReadOnly()).toBe(true)
    expect(repo.saveContent).toHaveBeenCalled()
    expect(useEditor.getState().save.status).toBe('saved')
    // the file really holds the last edit
    const saved = await repo.loadContent(fileId)
    expect(saved).not.toBeNull()
  })

  it('stays in Edit mode, with a message, when the last change could not be saved', async () => {
    addChild(mapDoc, useEditor.getState().rootId, 'Unsaved')
    vi.mocked(repo.saveContent).mockRejectedValue(new Error('disk full'))
    const ok = await enterReadMode()
    expect(ok).toBe(false)
    expect(isReadOnly()).toBe(false)
    expect(useEditor.getState().notice?.text).toMatch(/not been saved/)
  })

  it('announces the mode change for screen readers', async () => {
    render(<ReadModeSwitch />)
    await enterReadMode()
    expect(screen.getByRole('status').textContent).toMatch(/Read mode/)
    act(() => void enterEditMode())
    expect(screen.getByRole('status').textContent).toMatch(/Edit mode/)
  })

  it('shows the Edit | Read switch, the badge, and "Read only" instead of a save status', async () => {
    render(
      <>
        <ReadModeSwitch />
        <SaveStatus />
      </>
    )
    expect(screen.queryByTestId('read-badge')).toBeNull()
    await act(async () => void (await enterReadMode()))
    expect(screen.getByTestId('read-badge').textContent).toMatch(/Read mode/)
    expect(screen.getByRole('button', { name: 'Read' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Read only')).toBeTruthy()
    expect(screen.queryByText(/Saved|Saving/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(isReadOnly()).toBe(false)
    expect(screen.queryByText('Read only')).toBeNull()
  })

  it('Ctrl+Shift+R toggles it, and it is listed with its shortcut', async () => {
    expect(COMMANDS.find((c) => c.id === 'readMode')?.keys).toContain('Ctrl+Shift+R')
    fireEvent.keyDown(window, { key: 'R', ctrlKey: true, shiftKey: true })
    await act(async () => void (await new Promise((r) => setTimeout(r, 50))))
    expect(isReadOnly()).toBe(true)
    fireEvent.keyDown(window, { key: 'R', ctrlKey: true, shiftKey: true })
    expect(isReadOnly()).toBe(false)
  })
})

describe('everything that edits is blocked in Read mode', () => {
  beforeEach(async () => {
    await enterReadMode()
    vi.mocked(repo.saveContent).mockClear()
  })

  it('every editing command is blocked: none changes the map, none writes', async () => {
    const before = topicsJson()
    A.selectOnly(grand)
    for (const c of COMMANDS) {
      if (READ_SAFE.has(c.id)) continue
      act(() => c.run())
    }
    expect(topicsJson()).toBe(before)
    expect(useEditor.getState().editingId).toBeNull()
    expect(useEditor.getState().painter).toBeNull()
    expect(useEditor.getState().relationFrom).toBeNull()
    await wait(600)
    expect(writes()).toEqual([])
    expect(mapDoc.undo.undoStack).toHaveLength(0)
  })

  it('typing, renaming, adding and deleting by keyboard do nothing', async () => {
    const before = topicsJson()
    for (const key of ['Tab', 'Enter', 'F2', 'Delete', 'Backspace']) fireEvent.keyDown(window, { key })
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'x', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'd', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'ArrowUp', altKey: true })
    expect(topicsJson()).toBe(before)
    expect(useEditor.getState().editingId).toBeNull()
  })

  it('pasting is blocked (text and files)', () => {
    const before = topicsJson()
    const e = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData?: unknown }
    e.clipboardData = { files: [], getData: () => 'a\n b\n c', items: [] }
    act(() => void window.dispatchEvent(e))
    expect(e.defaultPrevented).toBe(true)
    expect(topicsJson()).toBe(before)
  })

  it('rename, add, delete, style, theme and layout actions are blocked', () => {
    const before = topicsJson()
    const settingsBefore = JSON.stringify(useEditor.getState().settings)
    A.beginEdit(child)
    A.cmdAddChild()
    A.cmdAddSibling()
    A.cmdDelete()
    A.cmdUndo()
    A.cmdRedo()
    A.styleSelected({ fill: '#ff0000' })
    A.selectTheme('midnight')
    A.setLayout('org:down')
    A.commitTopicWidth(300)
    A.resetBranchesToAuto('map')
    A.togglePainter()
    A.cmdPasteText('x\ny')
    expect(topicsJson()).toBe(before)
    expect(JSON.stringify(useEditor.getState().settings)).toBe(settingsBefore)
    expect(useEditor.getState().editingId).toBeNull()
  })

  it('the format painter and a double click cannot start editing', () => {
    act(() => useEditor.setState({ painter: { fill: '#00ff00' } }))
    A.applyPainter(grand)
    expect(topics()[grand]?.style.fill).toBeUndefined()
  })

  it('renaming the file is blocked too', async () => {
    const { renameOpenFile } = await import('./session')
    await renameOpenFile('Sneaky rename', repo)
    expect(repo.update).not.toHaveBeenCalled()
  })

  it('a task cannot be ticked', () => {
    const before = topicsJson()
    return import('./content').then((C) => {
      C.toggleTaskDone(child)
      expect(topicsJson()).toBe(before)
    })
  })

  it('the context menu and the command palette offer only reading actions', () => {
    act(() => useEditor.setState({ menu: { x: 10, y: 10, topicId: child } }))
    render(<ContextMenu />)
    const names = within(screen.getByRole('menu')).getAllByRole('menuitem').map((b) => b.textContent ?? '')
    expect(names.join('|')).toMatch(/Details/)
    expect(names.join('|')).not.toMatch(/Delete|Rename|Add sub topic|Add topic|Add picture|Relationship/)
    cleanup()
    act(() => useEditor.setState({ menu: null, paletteOpen: true }))
    render(<CommandPalette />)
    const input = screen.getByRole('textbox', { name: 'Type a command' }) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'delete' } })
    expect(screen.queryByText(/Delete topic/)).toBeNull()
    fireEvent.change(input, { target: { value: 'fit' } })
    expect(screen.getByText('Fit to screen')).toBeTruthy()
  })

  it('the Outline view cannot be typed into and its keys do not edit', () => {
    const before = topicsJson()
    act(() => useEditor.setState({ view: 'outline' }))
    render(<OutlineView />)
    const input = screen.getAllByRole('textbox', { name: /Topic text/ })[1] as HTMLInputElement
    expect(input.readOnly).toBe(true)
    fireEvent.change(input, { target: { value: 'typed' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.keyDown(input, { key: 'Tab' })
    fireEvent.keyDown(input, { key: 'Backspace' })
    fireEvent.blur(input)
    expect(topicsJson()).toBe(before)
    expect(screen.getByText(/nothing can be changed/)).toBeTruthy()
  })
})

describe('what still works in Read mode', () => {
  beforeEach(async () => {
    await enterReadMode()
    vi.mocked(repo.saveContent).mockClear()
  })

  it('selecting a topic, and moving between topics with the arrow keys', () => {
    A.selectOnly(useEditor.getState().rootId)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(useEditor.getState().selected[0]).not.toBe(useEditor.getState().rootId)
  })

  it('folding and unfolding is view state only: the map, the file and Drive never see it', async () => {
    const before = topicsJson()
    const visible = getScene().boxes.size
    A.selectOnly(child)
    A.cmdToggleCollapse()
    expect(getScene().boxes.size).toBeLessThan(visible) // the reader sees it folded
    expect(topicsJson()).toBe(before) // the map is untouched
    expect(topics()[child]?.collapsed).toBeFalsy()
    A.cmdToggleCollapse()
    expect(getScene().boxes.size).toBe(visible)
    A.cmdToggleCollapse()
    await wait(600)
    expect(writes()).toEqual([])
    // and it is gone when going back to Edit mode: nothing was saved about it
    enterEditMode()
    expect(getScene().boxes.size).toBe(visible)
  })

  it('search, levels, focus, zoom and fit all work and write nothing', async () => {
    A.openSearch()
    A.setQuery('Grand')
    expect(useEditor.getState().search.matches.length).toBeGreaterThan(0)
    A.closeSearch()
    A.setLevels(1)
    A.setLevels(null)
    A.selectOnly(child)
    A.toggleFocus()
    A.toggleFocus()
    A.zoomBy(1.25)
    A.fitToScreen()
    await wait(600)
    expect(writes()).toEqual([])
  })

  it('the details panel shows notes and tags read-only, and can be closed', () => {
    act(() => void A.selectOnly(child))
    mapDoc.topics.get(child)
    render(<ReadPanel />)
    expect(screen.getByRole('complementary', { name: /read only/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Child' })).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /Delete|Add/ })).toBeNull()
  })

  it('copying a topic\'s text works', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    A.selectOnly(child)
    expect(A.cmdCopy()).toContain('Child')
    expect(writeText).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('toggling back to Edit restores normal autosave', async () => {
    enterEditMode()
    addChild(mapDoc, useEditor.getState().rootId, 'After read mode')
    await wait(700)
    expect(repo.saveContent).toHaveBeenCalled()
    expect(useEditor.getState().save.status).toBe('saved')
  })
})

describe('no writes at all while reading', () => {
  it('a long Read mode session writes nothing to the repository, and no autosave ever runs', async () => {
    await enterReadMode()
    for (const m of WRITES) (repo[m] as unknown as { mockClear?: () => void }).mockClear?.()
    for (let i = 0; i < 6; i++) {
      A.selectOnly(i % 2 ? child : grand)
      A.cmdToggleCollapse()
      A.zoomBy(1.1)
      for (const c of COMMANDS) if (!READ_SAFE.has(c.id)) c.run()
    }
    toggleReadMode()
    toggleReadMode()
    await wait(900)
    expect(writes().filter((w) => w === 'saveContent')).toEqual([]) // toggling back and forth made no edit to save
    expect(useEditor.getState().save.status).not.toBe('error')
  })

  it('a copy of the map held back by an earlier crash is not written while reading', async () => {
    await closeFile()
    localStorage.setItem(`wishtaamaps:pending:${fileId}`, 'AAAA')
    await openFile(fileId, repo, { readOnly: 'file' })
    await wait(700)
    expect(repo.saveContent).not.toHaveBeenCalled()
    expect(isReadOnly()).toBe(true)
  })

  it('opening a file in Read mode starts locked and makes no write', async () => {
    await closeFile()
    vi.mocked(repo.saveContent).mockClear()
    await openFile(fileId, repo, { readOnly: 'file', fileDefault: true })
    expect(isReadOnly()).toBe(true)
    A.cmdAddChild()
    await wait(700)
    expect(writes()).toEqual([])
  })

  it('REGRESSION: the editor writes to the file repository only from the two places that check Read mode', () => {
    const root = join(__dirname)
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) files.push(p)
      }
    }
    walk(root)
    const found = new Map<string, string[]>()
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      const m = src.match(/\b(?:repo|repository|this\.repo)\.(saveContent|update|create|remove|move|trash|restore|emptyTrash|duplicate)\(/g)
      if (m) found.set(f.slice(root.length + 1).replace(/\\/g, '/'), m)
    }
    // session.ts: RepoMapStorage.save (returns early when reading) and renameOpenFile (returns early when reading).
    expect([...found.keys()]).toEqual(['session.ts'])
    expect(found.get('session.ts')).toHaveLength(2)
    const session = readFileSync(join(root, 'session.ts'), 'utf8')
    expect(session).toMatch(/if \(useEditor\.getState\(\)\.readOnly\) return\r?\n\s+await this\.repo\.saveContent/)
    expect(session).toMatch(/if \(!id \|\| useEditor\.getState\(\)\.readOnly\) return\r?\n\s+const updated = await repo\.update/)
  })
})

describe('a file that can only be read', () => {
  it('opens read-only with no way to switch to Edit', async () => {
    await closeFile()
    await openFile(fileId, repo, { readOnly: 'drive', viewOnly: true })
    expect(isReadOnly()).toBe(true)
    expect(useEditor.getState().canEdit).toBe(false)
    expect(enterEditMode()).toBe(false)
    expect(isReadOnly()).toBe(true)
    expect(useEditor.getState().notice?.text).toMatch(/permission/)
    render(<ReadModeSwitch />)
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.getByTestId('read-badge').title).toMatch(/permission to edit it in Google Drive/)
  })

  it('a file set to open in Read mode needs one click to edit, and says what happened', async () => {
    await closeFile()
    await openFile(fileId, repo, { readOnly: 'file', fileDefault: true })
    expect(isReadOnly()).toBe(true)
    expect(enterEditMode()).toBe(true)
    expect(isReadOnly()).toBe(false)
    expect(useEditor.getState().notice?.text).toMatch(/opens in Read mode by default/)
  })
})
