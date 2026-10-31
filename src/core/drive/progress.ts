import type { SyncStatus } from './pictures'

/** "Uploading pictures 120 of 500, about 6 minutes left" (or just the count, when the batch is small or the rate unknown). */
export function uploadingText(s: Pick<SyncStatus, 'pictures' | 'batchTotal' | 'batchDone' | 'etaSeconds'>): string {
  if (s.batchTotal > 3) {
    const base = `Uploading pictures ${Math.min(s.batchDone + 1, s.batchTotal)} of ${s.batchTotal}`
    if (s.etaSeconds === null) return base
    const mins = Math.round(s.etaSeconds / 60)
    return `${base}, ${s.etaSeconds < 45 ? 'less than a minute' : `about ${mins} minute${mins === 1 ? '' : 's'}`} left`
  }
  return `${s.pictures} picture${s.pictures === 1 ? '' : 's'} uploading`
}
