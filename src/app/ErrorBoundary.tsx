import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Small inline fallback (for a panel) instead of the full-page one. */
  inline?: boolean
  label?: string
}

/** Keeps a bug in one part of the UI from blanking the whole editor. Saved work is not affected. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error:', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    if (this.props.inline) {
      return (
        <div role="alert" className="m-4 rounded-ui border border-bad/50 p-3 text-sm">
          <p>{this.props.label ?? 'This panel'} ran into a problem.</p>
          <button type="button" onClick={() => this.setState({ failed: false })} className="mt-2 rounded-ui border border-line px-2 py-1">
            Try again
          </button>
        </div>
      )
    }
    return (
      <div role="alert" className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-medium">Something went wrong</p>
          <p className="mt-1 text-sm text-muted">Your map is saved automatically. Reloading usually fixes this.</p>
          <button type="button" onClick={() => location.reload()} className="mt-4 rounded-ui bg-brand px-4 py-2 text-sm font-medium text-brand-ink">
            Reload
          </button>
        </div>
      </div>
    )
  }
}
