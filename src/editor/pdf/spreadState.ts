/**
 * What each open pane is showing right now: its rows (single pages or spreads) and how wide it is. The viewer publishes this so the
 * page buttons can step by spread and the View menu can say why Two pages is not showing. Nothing here is saved.
 */
export interface LiveView {
  rows: number[][]
  paneW: number
  /** Two pages are actually showing (chosen, and the pane is wide enough). */
  two: boolean
  /** The zoom the pages are shown at, in percent (100 is the size on paper), also while Fit is on. */
  percent?: number
}

const live = new Map<string, LiveView>()
const listeners = new Set<() => void>()
let version = 0

export function publishView(id: string, view: LiveView) {
  const was = live.get(id)
  if (was && was.paneW === view.paneW && was.two === view.two && was.percent === view.percent && sameRows(was.rows, view.rows)) return
  live.set(id, view)
  version++
  listeners.forEach((l) => l())
}
export const forgetView = (id: string) => void (live.delete(id) && (version++, listeners.forEach((l) => l())))
export const liveViewOf = (id: string | null | undefined): LiveView | undefined => (id ? live.get(id) : undefined)
export const subscribeViews = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))
export const viewsVersion = () => version

const sameRows = (a: number[][], b: number[][]) => a === b || (a.length === b.length && a.every((r, i) => r.length === (b[i] as number[]).length && r.every((n, k) => n === (b[i] as number[])[k])))
