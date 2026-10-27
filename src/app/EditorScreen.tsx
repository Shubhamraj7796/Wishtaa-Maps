import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useSettings } from '@/stores/settings'
import { tagColor } from '@/core/settings'
import * as A from '@/editor/actions'
import { Canvas } from '@/editor/canvas/Canvas'
import * as C from '@/editor/content'
import { installKeyboard } from '@/editor/keyboard'
import { commandById, displayKeys } from '@/editor/registry'
import { getTheme, useScene } from '@/editor/scene'
import { useEditor } from '@/editor/store'
import { Lightbox, OcrDialog } from '@/editor/ui/Dialogs'
import { FormatPanel } from '@/editor/ui/FormatPanel'
import { InsertMenu } from '@/editor/ui/InsertMenu'
import { ObjectBar } from '@/editor/ui/ObjectBar'
import { OutlineView } from '@/editor/ui/OutlineView'
import { CommandPalette, ContextMenu, NoticeToast, SearchBar, ShortcutSheet } from '@/editor/ui/Overlays'
import { SaveStatus } from '@/editor/ui/SaveStatus'
import { closeFile, openFile, renameOpenFile } from '@/editor/session'
import type { FileRecord } from '@/core/files/types'
import { Icon } from '@/ui/icons'
import { IconButton } from '@/ui/IconButton'
import { ErrorBoundary } from './ErrorBoundary'
import { useFiles } from './FilesContext'
import { EditorMenuButton, Wordmark } from './Shell'
import { ArrowLeft, Search as SearchIcon } from './icons'
import { EmptyState, Page } from './ui'

const Divider = () => <div className="mx-1 h-7 w-px shrink-0 bg-line" aria-hidden="true" />
const keysOf = (id: string) => {
  const c = commandById(id)
  return c ? displayKeys(c) : undefined
}

/** Show only topics that carry certain tags. */
function TagFilter() {
  const topics = useEditor((s) => s.topics)
  const filter = useEditor((s) => s.tagFilter)
  const settings = useEditor((s) => s.settings)
  const [open, setOpen] = useState(false)
  const palette = getTheme(settings).palette
  const tags = useMemo(() => [...new Set(Object.values(topics).flatMap((t) => t.tags ?? []))].sort(), [topics])
  return (
    <div className="relative">
      <IconButton
        icon="tag"
        label={filter.length ? `Filtering by ${filter.length} tag${filter.length > 1 ? 's' : ''}` : 'Filter by tag'}
        active={filter.length > 0}
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
      />
      {open && (
        <>
          <div className="fixed inset-0 z-30" onPointerDown={() => setOpen(false)} />
          <div role="menu" aria-label="Filter by tag" className="absolute right-0 top-full z-40 mt-1 w-56 rounded-ui border border-line bg-surface py-1 shadow-xl">
            {tags.length === 0 && <p className="px-3 py-2 text-sm text-muted">No tags yet. Add some from the Details tab.</p>}
            {tags.map((t) => (
              <label key={t} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-brand/15">
                <input type="checkbox" checked={filter.includes(t)} onChange={() => C.toggleTagFilter(t)} className="h-4 w-4 accent-[rgb(var(--c-brand))]" />
                <span className="h-3 w-3 rounded-full" style={{ background: tagColor(t, settings, palette) }} />
                <span className="truncate">{t}</span>
              </label>
            ))}
            {filter.length > 0 && (
              <button type="button" onClick={C.clearTagFilter} className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-sm hover:bg-brand/15">
                <Icon name="close" size={14} /> Show all topics
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Editor({ file }: { file: FileRecord }) {
  const theme = useSettings((s) => s.theme)
  const toggleTheme = useSettings((s) => s.toggleTheme)
  const scene = useScene()
  const { canUndo, canRedo, tool, levels, focusId, selected, rootId, title, panelOpen, painter, view, insertOpen, relationFrom, selectedObject, minimap, panelTab } = useEditor()
  const isKb = file.type === 'kb'
  const [params] = useSearchParams()
  const topicParam = params.get('topic')
  const backTo = file.parentId ? `/files/${file.parentId}` : isKb ? '/kb' : '/files'
  const zoom = useEditor((s) => s.viewport.k)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  useEffect(() => installKeyboard(), [])
  // Arriving from a link, search result or backlink: select that topic and bring it into view.
  useEffect(() => {
    if (!topicParam) return
    if (!useEditor.getState().topics[topicParam]) return
    A.selectOnly(topicParam)
    const t = setTimeout(() => A.centerOn(topicParam), 60)
    return () => clearTimeout(t)
  }, [topicParam])
  // Knowledge bases always open as a mind map.
  useEffect(() => {
    if (isKb) C.setView('map')
  }, [isKb, file.id])

  const onlyRoot = selected.length === 1 && selected[0] === rootId
  const hasTopic = selected.length > 0

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto whitespace-nowrap border-b border-line bg-surface px-3">
        <EditorMenuButton />
        <Link to={backTo} aria-label="Back to files" title="Back to files" className="grid h-9 w-9 shrink-0 place-items-center rounded-ui hover:bg-bg">
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
        <Wordmark compact />
        <Divider />
        <input
          aria-label={isKb ? 'Knowledge base name' : 'Map name'}
          value={title}
          onChange={(e) => A.setTitle(e.target.value)}
          onBlur={() => void renameOpenFile(title.trim() || file.name)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="w-28 shrink-0 rounded-ui border border-transparent bg-transparent px-2 py-1 text-sm font-medium hover:border-line focus:border-brand sm:w-44"
        />
        <SaveStatus />
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <IconButton icon="hand" label="Hand tool: drag to pan" keys="H" active={tool === 'pan'} onClick={() => A.setTool('pan')} />
          <IconButton icon="select" label="Select tool: drag to box-select" keys="V" active={tool === 'select'} onClick={() => A.setTool('select')} />
          <Divider />
          <IconButton icon="search" label="Search topics and notes" keys="Ctrl+F" onClick={A.openSearch} />
          <TagFilter />
          <IconButton icon="focus" label="Focus on the selected branch" keys="Ctrl+Shift+F" active={!!focusId} onClick={A.toggleFocus} />
          <Divider />
          <IconButton icon="format" label="Layout, themes, marks and topic details" keys="F4" active={panelOpen} onClick={() => A.togglePanel()} />
          <IconButton icon="painter" label="Format painter: copy a topic's look, then click topics" active={!!painter} onClick={A.togglePainter} />
          <Divider />
          {isKb && <IconButton icon="notebook" label="Notes panel for the selected topic" active={panelOpen && panelTab === 'notes'} onClick={() => A.togglePanel('notes')} caption="Notes" />}
          <IconButton icon="command" label="Command palette" keys="Ctrl+K" onClick={() => A.setPalette(true)} />
          <IconButton icon="help" label="Keyboard shortcuts" keys="?" onClick={() => A.setHelp(true)} />
          <IconButton icon={theme === 'light' ? 'moon' : 'sun'} label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} onClick={toggleTheme} />
        </div>
      </header>

      <div role="toolbar" aria-label="Editing tools" className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line bg-surface px-3 py-1">
        <IconButton icon="map" label="Map view" active={view === 'map'} onClick={() => C.setView('map')} caption="Map" />
        <IconButton icon="outline" label="Outline view" keys={keysOf('viewOutline')} active={view === 'outline'} onClick={() => C.setView('outline')} caption="Outline" />
        <Divider />
        <IconButton icon="undo" label="Undo" keys="Ctrl+Z" disabled={!canUndo} onClick={A.cmdUndo} />
        <IconButton icon="redo" label="Redo" keys="Ctrl+Y" disabled={!canRedo} onClick={A.cmdRedo} />
        <Divider />
        <IconButton icon="topic" label="Add topic (next to the selected one)" keys="Enter" disabled={onlyRoot} onClick={A.cmdAddSibling} caption="Topic" />
        <IconButton icon="subTopic" label="Add sub topic" keys="Tab" onClick={A.cmdAddChild} caption="Sub Topic" />
        <IconButton icon="floating" label="Add a floating topic" onClick={() => A.cmdAddFloating()} caption="Floating" />
        <IconButton
          icon="trash"
          label="Delete"
          keys="Delete"
          disabled={(!hasTopic && !selectedObject) || (onlyRoot && !selectedObject)}
          onClick={() => {
            if (!C.deleteSelectedObject()) A.cmdDelete()
          }}
        />
        <Divider />
        <IconButton icon="relationship" label="Relationship line between two topics" keys={keysOf('relationship')} active={!!relationFrom} onClick={C.startRelationship} caption="Relationship" />
        <IconButton icon="callout" label="Callout note on a topic" keys={keysOf('callout')} onClick={C.addCalloutToSelected} caption="Callout" />
        <IconButton icon="boundary" label="Boundary around topics" keys={keysOf('boundary')} onClick={() => C.addBoundaryToSelected()} caption="Boundary" />
        <IconButton icon="summary" label="Summary of sibling topics" keys={keysOf('summary')} onClick={C.addSummaryToSelected} caption="Summary" />
        <Divider />
        <div className="relative">
          <IconButton icon="insert" label="Insert: marks, clipart, picture, notes, tags, task, link, attachment, formula, table" active={insertOpen} onClick={() => C.toggleInsert()} caption="Insert" aria-haspopup="menu" aria-expanded={insertOpen} />
          <InsertMenu />
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1" aria-label={view === 'map' ? 'Map canvas' : 'Outline'}>
          <div className={view === 'map' ? 'contents' : 'hidden'}>
            <Canvas />
          </div>
          {view === 'outline' && <OutlineView />}
          <SearchBar />
          <ObjectBar />
          <CommandPalette />
          <ShortcutSheet />
          <ContextMenu />
          <Lightbox />
          <OcrDialog />
          <NoticeToast />
        </main>
        {panelOpen && (
          <ErrorBoundary inline label="The format panel">
            <FormatPanel />
          </ErrorBoundary>
        )}
      </div>

      <footer className="flex h-9 shrink-0 items-center justify-between gap-3 overflow-x-auto whitespace-nowrap border-t border-line bg-surface px-3 text-xs text-muted">
        <span>
          Topics {scene.boxes.size}
          {scene.boxes.size !== scene.total ? ` of ${scene.total}` : ''} · No limit
        </span>
        <div className="flex items-center gap-1" role="group" aria-label="Show levels">
          <Icon name="details" size={14} />
          {([1, 2, 3, null] as const).map((n) => (
            <button
              key={String(n)}
              type="button"
              aria-pressed={levels === n}
              title={n === null ? 'Show all levels' : `Show ${n} level${n > 1 ? 's' : ''}`}
              onClick={() => A.setLevels(n)}
              className={`rounded px-1.5 py-0.5 ${levels === n ? 'bg-brand/20 text-ink' : 'hover:bg-bg'}`}
            >
              {n ?? 'All'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={A.openSearch} aria-label="Search topics" title="Search topics (Ctrl+F)" className="grid h-7 w-7 place-items-center rounded hover:bg-bg hover:text-ink">
            <SearchIcon size={15} aria-hidden="true" />
          </button>
          <button type="button" onClick={A.toggleMinimap} aria-pressed={minimap} aria-label="Minimap" title="Show or hide the minimap" className={`grid h-7 w-7 place-items-center rounded hover:bg-bg hover:text-ink ${minimap ? 'bg-brand/15 text-ink' : ''}`}>
            <Icon name="map" size={15} />
          </button>
          <button type="button" onClick={() => A.zoomBy(0.8)} aria-label="Zoom out" title="Zoom out" className="grid h-7 w-7 place-items-center rounded hover:bg-bg hover:text-ink">
            <Icon name="zoomOut" size={16} />
          </button>
          <button type="button" onClick={A.zoomTo100} title="Reset to 100%" className="w-11 text-center hover:text-ink">
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" onClick={() => A.zoomBy(1.25)} aria-label="Zoom in" title="Zoom in" className="grid h-7 w-7 place-items-center rounded hover:bg-bg hover:text-ink">
            <Icon name="zoomIn" size={16} />
          </button>
          <button type="button" onClick={A.fitToScreen} aria-label="Fit to screen" title="Fit to screen (Ctrl+0)" className="grid h-7 w-7 place-items-center rounded hover:bg-bg hover:text-ink">
            <Icon name="fit" size={16} />
          </button>
          <button type="button" onClick={A.toggleFullscreen} aria-label="Fullscreen" title="Fullscreen" className="grid h-7 w-7 place-items-center rounded hover:bg-bg hover:text-ink">
            <Icon name="fullscreen" size={16} />
          </button>
        </div>
      </footer>
    </div>
  )
}

/** Opens the file named in the address, shows the editor, and saves back to the same file. */
export default function EditorScreen({ kind }: { kind: 'map' | 'kb' }) {
  const { id = '' } = useParams()
  const { repo, ready, files } = useFiles()
  const [state, setState] = useState<{ id: string; file: FileRecord | null } | null>(null)

  useEffect(() => {
    let alive = true
    void openFile(id, repo).then((file) => alive && setState({ id, file }))
    return () => {
      alive = false
      void closeFile()
    }
  }, [id, repo])

  // Keep the header record fresh (name, type) while the file is open.
  const live = files.find((x) => x.id === id)
  if (!state || state.id !== id) {
    return <div className="grid h-full place-items-center text-sm text-muted" role="status">Opening…</div>
  }
  if (!state.file) {
    return (
      <Page>
        <EmptyState icon={<SearchIcon size={26} aria-hidden="true" />} title="This file isn't here">
          It may have been deleted or moved to the bin. <Link to="/files" className="text-brand underline">Go to All files</Link>
        </EmptyState>
      </Page>
    )
  }
  const file = live && !live.trashed ? live : state.file
  if (ready && file.type !== kind) return <Navigate to={`/${file.type === 'kb' ? 'kb' : 'map'}/${file.id}${window.location.search}`} replace />
  return (
    <ErrorBoundary label="The editor">
      <Editor file={file} />
    </ErrorBoundary>
  )
}
