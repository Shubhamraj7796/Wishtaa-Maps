import { Component, type ErrorInfo, type ReactNode } from 'react'
import { alreadyReloaded, describeError, errorDetails, isChunkError, recoverFromStaleBuild, reloadInProgress } from './chunkRecovery'

interface Props {
  children: ReactNode
  /** Small inline fallback (for a panel) instead of the full-page one. */
  inline?: boolean
  label?: string
  /** Offers "Reopen PDF" (for the PDF panel). */
  reopen?: () => void
}

interface State {
  error: Error | null
  copied: boolean
  /** An automatic reload for a stale version is under way. */
  recovering: boolean
}

/**
 * Keeps a bug in one part of the UI from blanking the whole editor. Saved work is not affected: the editor and autosave live outside
 * the part that failed. Says what went wrong in plain words, and offers what can help. A failed load of a file from an older version of
 * the app (after a deploy) is recovered by itself, once.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, copied: false, recovering: false }

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Logged here only, never sent anywhere: the reason, not the document.
    console.error('UI error:', error, info.componentStack)
    if (isChunkError(error) && reloadInProgress()) this.setState({ recovering: true })
    else if (isChunkError(error) && !alreadyReloaded()) {
      this.setState({ recovering: true })
      void recoverFromStaleBuild(undefined, this.props.label === 'The PDF panel' ? 'pdf' : undefined)
    }
  }

  private copy = async () => {
    try {
      await navigator.clipboard.writeText(errorDetails(this.state.error, this.props.label ?? 'This panel'))
      this.setState({ copied: true })
    } catch {
      /* clipboard blocked: the details are still on screen in the console */
    }
  }

  render() {
    const { error, copied, recovering } = this.state
    if (!error) return this.props.children
    const label = this.props.label ?? 'This panel'
    const why = describeError(error, label)
    const btn = 'rounded-ui border border-line bg-surface px-2.5 py-1.5 text-sm hover:bg-bg [@media(pointer:coarse)]:min-h-11'
    const actions = (
      <div className="mt-3 flex flex-wrap gap-2">
        {!why.stale && (
          <button type="button" className={btn} onClick={() => this.setState({ error: null, copied: false })}>
            Try again
          </button>
        )}
        <button type="button" className={why.stale ? 'rounded-ui bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink [@media(pointer:coarse)]:min-h-11' : btn} onClick={() => void recoverFromStaleBuild(() => location.reload()).then((r) => r === 'already-tried' && location.reload())}>
          Reload app
        </button>
        {this.props.reopen && (
          <button type="button" className={btn} onClick={() => (this.setState({ error: null, copied: false }), this.props.reopen?.())}>
            Reopen PDF
          </button>
        )}
        <button type="button" className={btn} onClick={() => void this.copy()}>
          {copied ? 'Copied' : 'Copy details'}
        </button>
      </div>
    )
    if (this.props.inline) {
      return (
        <div role="alert" data-error-boundary className="m-4 max-w-md rounded-ui border border-bad/50 p-3 text-sm">
          <p className="font-medium">{recovering ? 'Updating to the new version…' : why.title}</p>
          {!recovering && <p className="mt-1 text-muted">{why.hint}</p>}
          {!recovering && actions}
        </div>
      )
    }
    return (
      <div role="alert" data-error-boundary className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-medium">{recovering ? 'Updating to the new version…' : why.stale ? why.title : 'Something went wrong'}</p>
          <p className="mt-1 text-sm text-muted">{why.stale ? why.hint : 'Your map is saved automatically. Reloading usually fixes this.'}</p>
          {!recovering && <div className="flex justify-center">{actions}</div>}
        </div>
      </div>
    )
  }
}
