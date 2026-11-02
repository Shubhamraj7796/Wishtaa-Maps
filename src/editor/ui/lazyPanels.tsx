import { lazyWithRetry } from '@/app/chunkRecovery'
import type { PanelTab } from '../store'

const Clipart = lazyWithRetry(() => import('./ClipartPanel'))
const Details = lazyWithRetry(() => import('./DetailsPanel'))
const Notes = lazyWithRetry(() => import('./NotesPanel'))

/** The heavier panels are loaded only when opened, so the editor starts fast. */
export function DetailsPanelLazy({ tab }: { tab: PanelTab }) {
  if (tab === 'clipart') return <Clipart />
  if (tab === 'notes') return <Notes />
  return <Details />
}
