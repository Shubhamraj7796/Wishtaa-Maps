import { useEffect } from 'react'
import { useSettings } from '@/stores/settings'
import * as A from '@/editor/actions'
import { Canvas } from '@/editor/canvas/Canvas'
import { installKeyboard } from '@/editor/keyboard'
import { useScene } from '@/editor/scene'
import { useEditor } from '@/editor/store'
import { CommandPalette, ContextMenu, NoticeToast, SearchBar, ShortcutSheet } from '@/editor/ui/Overlays'
import { SaveStatus } from '@/editor/ui/SaveStatus'

function Wordmark() {
  return (
    <div className="flex shrink-0 items-center gap-2" aria-label="Wishtaa Maps">
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <circle cx="13" cy="13" r="4" className="fill-brand" />
        <g className="stroke-brand" strokeWidth="2" strokeLinecap="round" fill="none">
          <path d="M13 9V3M17 15l5 4M9 15l-5 4" />
        </g>
        <g className="fill-surface stroke-brand" strokeWidth="2">
          <circle cx="13" cy="3" r="2" />
          <circle cx="22" cy="19" r="2" />
          <circle cx="4" cy="19" r="2" />
        </g>
      </svg>
      <span className="text-[15px] font-semibold tracking-tight">Wishtaa Maps</span>
    </div>
  )
}

function Btn(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  const { active, className = '', ...rest } = props
  return (
    <button
      type="button"
      aria-pressed={active}
      {...rest}
      className={`rounded-ui border px-2.5 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'border-brand bg-brand/15' : 'border-line hover:bg-bg'
      } ${className}`}
    />
  )
}

export function App() {
  const theme = useSettings((s) => s.theme)
  const toggleTheme = useSettings((s) => s.toggleTheme)
  const scene = useScene()
  const { canUndo, canRedo, tool, levels, focusId, selected, rootId, title } = useEditor()
  const zoom = useEditor((s) => s.viewport.k)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  useEffect(() => installKeyboard(), [])

  const onlyRoot = selected.length === 1 && selected[0] === rootId

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 overflow-x-auto whitespace-nowrap border-b border-line bg-surface px-3">
        <Wordmark />
        <div className="mx-1 h-5 w-px bg-line" />
        <input
          aria-label="Map name"
          value={title}
          onChange={(e) => A.setTitle(e.target.value)}
          onBlur={() => !title.trim() && A.setTitle('Untitled map')}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="w-28 shrink-0 rounded-ui border border-transparent bg-transparent px-2 py-1 text-sm font-medium hover:border-line focus:border-brand sm:w-44"
        />
        <SaveStatus />
        <div className="mx-1 h-5 w-px bg-line" />
        <div className="flex shrink-0 items-center gap-1.5" role="toolbar" aria-label="Editing tools">
          <Btn onClick={A.cmdUndo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">↶</Btn>
          <Btn onClick={A.cmdRedo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Y)">↷</Btn>
          <Btn onClick={A.cmdAddChild} title="Add child (Tab)">+ Topic</Btn>
          <Btn onClick={A.cmdAddSibling} disabled={onlyRoot} title="Add sibling (Enter)">+ Sibling</Btn>
          <Btn onClick={() => A.cmdAddFloating()} title="Add a floating topic">+ Floating</Btn>
          <Btn onClick={A.cmdDelete} disabled={!selected.length || onlyRoot} title="Delete (Delete)">Delete</Btn>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Btn active={tool === 'pan'} onClick={() => A.setTool('pan')} title="Hand tool (H)">Hand</Btn>
          <Btn active={tool === 'select'} onClick={() => A.setTool('select')} title="Select tool (V)">Select</Btn>
          <Btn onClick={A.openSearch} title="Search (Ctrl+F)">Search</Btn>
          <Btn active={!!focusId} onClick={A.toggleFocus} title="Focus on the selected branch (Ctrl+Shift+F)">Focus</Btn>
          <Btn onClick={() => A.setPalette(true)} title="Command palette (Ctrl+K)">Ctrl+K</Btn>
          <Btn onClick={() => A.setHelp(true)} aria-label="Keyboard shortcuts" title="Shortcuts (?)">?</Btn>
          <Btn onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
            {theme === 'light' ? 'Dark' : 'Light'}
          </Btn>
        </div>
      </header>

      <main className="relative min-h-0 flex-1" aria-label="Canvas">
        <Canvas />
        <SearchBar />
        <CommandPalette />
        <ShortcutSheet />
        <ContextMenu />
        <NoticeToast />
      </main>

      <footer className="flex h-8 shrink-0 items-center justify-between gap-3 overflow-x-auto whitespace-nowrap border-t border-line bg-surface px-3 text-xs text-muted">
        <span>
          Topics {scene.boxes.size}
          {scene.boxes.size !== scene.total ? ` of ${scene.total}` : ''} · No limit
        </span>
        <div className="flex items-center gap-1" role="group" aria-label="Show levels">
          <span className="mr-1">Levels</span>
          {([1, 2, 3, null] as const).map((n) => (
            <button
              key={String(n)}
              type="button"
              aria-pressed={levels === n}
              onClick={() => A.setLevels(n)}
              className={`rounded px-1.5 py-0.5 ${levels === n ? 'bg-brand/20 text-ink' : 'hover:bg-bg'}`}
            >
              {n ?? 'All'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => A.zoomBy(0.8)} aria-label="Zoom out" className="px-1 hover:text-ink">−</button>
          <button type="button" onClick={A.zoomTo100} title="Reset to 100%" className="w-10 text-center hover:text-ink">
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" onClick={() => A.zoomBy(1.25)} aria-label="Zoom in" className="px-1 hover:text-ink">+</button>
          <button type="button" onClick={A.fitToScreen} className="rounded px-1.5 hover:bg-bg hover:text-ink">Fit</button>
          <button type="button" onClick={A.toggleFullscreen} className="rounded px-1.5 hover:bg-bg hover:text-ink">Fullscreen</button>
        </div>
      </footer>
    </div>
  )
}
