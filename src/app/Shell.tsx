import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useMatch, useNavigate, useSearchParams } from 'react-router-dom'
import { useSettings } from '@/stores/settings'
import { Dialogs } from './Dialogs'
import { useFiles } from './FilesContext'
import { Cloud, HardDrive, Home, Info, Library, Menu, Moon, Plus, Search, Sparkles, Sun, Trash2, X, FileText } from './icons'

export function Wordmark({ compact }: { compact?: boolean }) {
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
      {!compact && <span className="text-[15px] font-semibold tracking-tight">Wishtaa Maps</span>}
    </div>
  )
}

interface ShellApi {
  openMenu: () => void
}
const ShellCtx = createContext<ShellApi>({ openMenu: () => undefined })
export const useShell = () => useContext(ShellCtx)

const BANNER_KEY = 'wishtaamaps:banner-local-dismissed'
function readDismissed(): boolean {
  try {
    return localStorage.getItem(BANNER_KEY) === '1'
  } catch {
    return false
  }
}

function linkClass({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-3 rounded-ui px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-brand/15 text-ink' : 'text-ink hover:bg-bg'}`
}

function StorageInfo() {
  const f = useFiles()
  const [used, setUsed] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void navigator.storage?.estimate?.().then((e) => {
      if (alive && e.usage !== undefined) setUsed(e.usage < 1024 * 1024 ? `${Math.max(1, Math.round(e.usage / 1024))} KB used` : `${(e.usage / 1024 / 1024).toFixed(1)} MB used`)
    })
    return () => {
      alive = false
    }
  }, [f.files])
  const count = f.files.filter((x) => !x.trashed && x.type !== 'folder').length
  return (
    <div className="border-t border-line p-3 text-xs text-muted" aria-label="Storage">
      <div className="mb-1 flex items-center gap-2 font-medium text-ink">
        <HardDrive size={15} aria-hidden="true" /> This browser
      </div>
      <p>
        {count} {count === 1 ? 'file' : 'files'}
        {used ? ` · ${used}` : ''}
      </p>
      <p className="mt-0.5">Guest. Files stay on this device.</p>
    </div>
  )
}

function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const f = useFiles()
  const inFolder = useMatch('/files/:folderId')
  const parentId = inFolder?.params.folderId ?? null
  const { pathname, search } = useLocation()
  const inBin = pathname === '/files' && search.includes('tab=bin')
  return (
    <nav aria-label="Main" className="flex h-full w-64 shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex h-14 items-center px-4"><Wordmark /></div>
      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={() => {
            onNavigate()
            f.setDialog({ kind: 'new', parentId })
          }}
          className="flex w-full items-center justify-center gap-2 rounded-ui bg-brand px-3 py-2.5 text-sm font-semibold text-brand-ink shadow-sm transition-opacity hover:opacity-90"
        >
          <Plus size={18} aria-hidden="true" /> New file
        </button>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 py-1" onClick={onNavigate}>
        <NavLink to="/home" className={linkClass}><Home size={18} aria-hidden="true" /> Home</NavLink>
        <NavLink to="/files" className={({ isActive }) => linkClass({ isActive: isActive && !inBin })}><FileText size={18} aria-hidden="true" /> All files</NavLink>
        <NavLink to="/kb" className={linkClass}><Library size={18} aria-hidden="true" /> Knowledge base</NavLink>
        <NavLink to="/gallery" className={linkClass}><Sparkles size={18} aria-hidden="true" /> Gallery</NavLink>
        <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted">Storage</p>
        <NavLink to="/drive" className={linkClass}><Cloud size={18} aria-hidden="true" /> Google Drive</NavLink>
        <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted">&nbsp;</p>
        <NavLink to="/files?tab=bin" className={() => linkClass({ isActive: inBin })}><Trash2 size={18} aria-hidden="true" /> Trash</NavLink>
      </div>
      <StorageInfo />
    </nav>
  )
}

function TopBar() {
  const { openMenu } = useShell()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const theme = useSettings((s) => s.theme)
  const toggleTheme = useSettings((s) => s.toggleTheme)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`)
  }
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
      <button type="button" onClick={openMenu} aria-label="Open menu" title="Menu" className="grid h-9 w-9 place-items-center rounded-ui hover:bg-bg md:hidden">
        <Menu size={20} aria-hidden="true" />
      </button>
      <form role="search" onSubmit={submit} className="relative min-w-0 max-w-xl flex-1">
        <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search all files"
          placeholder="Search all files, topics, notes and tags"
          className="w-full rounded-ui border border-line bg-bg py-2 pl-9 pr-3 text-sm focus:border-brand"
        />
      </form>
      <div className="ml-auto flex items-center gap-1">
        <button type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} title="Switch theme" className="grid h-9 w-9 place-items-center rounded-ui hover:bg-bg">
          {theme === 'light' ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
        </button>
      </div>
    </header>
  )
}

function LocalBanner() {
  const [gone, setGone] = useState(readDismissed)
  if (gone) return null
  return (
    <div role="note" className="flex items-center gap-3 border-b border-line bg-warn/10 px-4 py-2 text-sm">
      <Info size={16} aria-hidden="true" className="shrink-0 text-warn" />
      <p className="min-w-0 flex-1">Files are saved in this browser only.</p>
      <button
        type="button"
        onClick={() => {
          setGone(true)
          try {
            localStorage.setItem(BANNER_KEY, '1')
          } catch {
            /* ignore */
          }
        }}
        aria-label="Dismiss"
        title="Dismiss"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-ui hover:bg-bg"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

export function Toast() {
  const { message } = useFiles()
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-[60] -translate-x-1/2">
      {message && <div className="pointer-events-auto rounded-ui bg-ink px-4 py-2 text-sm text-bg shadow-xl">{message}</div>}
    </div>
  )
}

/** The frame around every screen: sidebar (a drawer on phones), top bar, banner, dialogs. The editor hides the sidebar until asked. */
export function Shell(): ReactNode {
  const { pathname } = useLocation()
  const immersive = pathname.startsWith('/map/') || pathname.startsWith('/kb/')
  const [drawer, setDrawer] = useState(false)
  const theme = useSettings((s) => s.theme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  useEffect(() => setDrawer(false), [pathname])
  useEffect(() => {
    if (!drawer) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawer])

  return (
    <ShellCtx.Provider value={{ openMenu: () => setDrawer(true) }}>
      <div className="flex h-full">
        {!immersive && (
          <div className="hidden md:block">
            <Sidebar onNavigate={() => undefined} />
          </div>
        )}
        {drawer && (
          <div className="fixed inset-0 z-50 flex">
            <div className="h-full shadow-2xl"><Sidebar onNavigate={() => setDrawer(false)} /></div>
            <button type="button" aria-label="Close menu" className="flex-1 bg-black/40" onClick={() => setDrawer(false)} />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          {!immersive && <TopBar />}
          {!immersive && <LocalBanner />}
          <div className={`min-h-0 flex-1 ${immersive ? "overflow-hidden" : "overflow-y-auto"}`}>
            <Outlet />
          </div>
        </div>
      </div>
      <Dialogs />
      <Toast />
    </ShellCtx.Provider>
  )
}

/** Small header used by the editor: menu, back, name, save status. */
export function EditorMenuButton() {
  const { openMenu } = useShell()
  return (
    <button type="button" onClick={openMenu} aria-label="Open menu" title="Menu" className="grid h-9 w-9 shrink-0 place-items-center rounded-ui hover:bg-bg">
      <Menu size={20} aria-hidden="true" />
    </button>
  )
}
