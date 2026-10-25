import { retrySave } from '../session'
import { useEditor } from '../store'

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0 animate-spin text-warn motion-reduce:animate-none">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function Tick() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0 text-ok">
      <circle cx="8" cy="8" r="7" fill="currentColor" fillOpacity="0.15" />
      <path d="M4.5 8.4l2.4 2.4 4.6-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Alert() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0 text-bad">
      <path d="M8 1.5l6.8 12H1.2L8 1.5z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 6v3.6M8 11.6v.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function CloudOff() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0 text-muted">
      <path d="M4.5 12.5h6.2a2.8 2.8 0 0 0 .6-5.5A3.8 3.8 0 0 0 4 6.6 2.9 2.9 0 0 0 4.5 12.5z" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 2l12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/** The single source of truth for save status (header, next to the map name). */
export function SaveStatus() {
  const status = useEditor((s) => s.save.status)
  const savedAt = useEditor((s) => s.save.savedAt)

  const time = savedAt ? new Date(savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null
  const label =
    status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved' : status === 'error' ? 'Not saved - retry' : 'Offline - will sync'
  const tip =
    status === 'saved' ? (time ? `Saved at ${time}` : 'All changes are saved') : status === 'error' ? 'Saving failed. Your changes are kept and will be retried.' : label
  const icon = status === 'saving' ? <Spinner /> : status === 'saved' ? <Tick /> : status === 'error' ? <Alert /> : <CloudOff />

  // Icon only when space is tight; the full label stays available to screen readers and on hover.
  const text = (
    <>
      <span aria-hidden="true" className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </>
  )

  return (
    <div role="status" aria-live="polite" title={tip} className="flex shrink-0 items-center text-xs text-ink">
      {status === 'error' ? (
        <button
          type="button"
          onClick={retrySave}
          className="flex items-center gap-1.5 rounded-ui border border-bad/60 px-2 py-1 font-medium hover:bg-bad/10"
        >
          {icon}
          {text}
        </button>
      ) : (
        <span className="flex items-center gap-1.5 px-1">
          {icon}
          {text}
        </span>
      )}
    </div>
  )
}
