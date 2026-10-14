import { useEffect } from 'react'
import { useSettings } from '@/stores/settings'

function Wordmark() {
  return (
    <div className="flex items-center gap-2" aria-label="Wishtaamaps">
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
      <span className="text-[15px] font-semibold tracking-tight">Wishtaamaps</span>
    </div>
  )
}

const RAIL = ['Topic', 'Sub topic', 'Relationship', 'Boundary', 'Summary', 'Insert']

export function App() {
  const theme = useSettings((s) => s.theme)
  const toggleTheme = useSettings((s) => s.toggleTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface px-4">
        <Wordmark />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-ui border border-line px-3 py-1 text-sm hover:bg-bg"
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? 'Dark' : 'Light'}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Tools" className="flex w-20 shrink-0 flex-col gap-1 border-r border-line bg-surface p-2">
          {RAIL.map((label) => (
            <button
              key={label}
              type="button"
              disabled
              className="rounded-ui px-1 py-2 text-xs text-muted disabled:cursor-not-allowed"
              title="Arrives in Phase 1"
            >
              {label}
            </button>
          ))}
        </nav>

        <main className="relative min-w-0 flex-1" aria-label="Canvas">
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-lg font-medium">Canvas coming in Phase 1</p>
              <p className="mt-1 text-sm text-muted">Phase 0 shell: tokens, theming, layout regions.</p>
            </div>
          </div>
        </main>

        <aside aria-label="Properties" className="hidden w-64 shrink-0 border-l border-line bg-surface p-4 md:block">
          <h2 className="text-sm font-semibold">Properties</h2>
          <p className="mt-1 text-sm text-muted">Style, notes and marks will appear here.</p>
        </aside>
      </div>

      <footer className="flex h-7 shrink-0 items-center justify-between border-t border-line bg-surface px-3 text-xs text-muted">
        <span>Topics 0 · No limit</span>
        <span>Saved</span>
      </footer>
    </div>
  )
}
