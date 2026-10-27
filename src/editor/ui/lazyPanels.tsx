import { lazy } from 'react'
import type { PanelTab } from '../store'

const Clipart = lazy(() => import('./ClipartPanel'))
const Details = lazy(() => import('./DetailsPanel'))
const Notes = lazy(() => import('./NotesPanel'))

/** The heavier panels are loaded only when opened, so the editor starts fast. */
export function DetailsPanelLazy({ tab }: { tab: PanelTab }) {
  if (tab === 'clipart') return <Clipart />
  if (tab === 'notes') return <Notes />
  return <Details />
}
