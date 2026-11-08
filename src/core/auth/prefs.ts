/** Preferences that follow the account. Only plain choices; nothing about files. */
export const PREFS_VERSION = 1

type Choice = readonly string[]
const CHOICES = {
  theme: ['light', 'dark'],
  mouseWheel: ['move', 'zoom'],
  panelMode: ['auto', 'always', 'manual'],
  picturesPref: ['ask', 'compress', 'original'],
  touchControls: ['auto', 'on', 'off'],
  pictureUploads: ['auto', 'manual'],
} as const satisfies Record<string, Choice>
const FLAGS = ['openAllReadOnly', 'pauseOnDataSaver'] as const

export interface SyncedPrefs {
  theme?: 'light' | 'dark'
  mouseWheel?: 'move' | 'zoom'
  panelMode?: 'auto' | 'always' | 'manual'
  picturesPref?: 'ask' | 'compress' | 'original'
  touchControls?: 'auto' | 'on' | 'off'
  pictureUploads?: 'auto' | 'manual'
  openAllReadOnly?: boolean
  pauseOnDataSaver?: boolean
}

/** Picks the synced preferences out of the settings store's state. */
export function pickPrefs(state: Record<string, unknown>): SyncedPrefs {
  return sanitizePrefs(state)
}

/** Keeps only known keys with allowed values, so a newer or damaged record can never put the app in a strange state. */
export function sanitizePrefs(data: unknown): SyncedPrefs {
  const out: Record<string, string | boolean> = {}
  if (!data || typeof data !== 'object') return out
  const d = data as Record<string, unknown>
  for (const [k, allowed] of Object.entries(CHOICES) as [string, Choice][]) {
    const v = d[k]
    if (typeof v === 'string' && allowed.includes(v)) out[k] = v
  }
  for (const k of FLAGS) if (typeof d[k] === 'boolean') out[k] = d[k] as boolean
  return out as SyncedPrefs
}

export const samePrefs = (a: SyncedPrefs, b: SyncedPrefs) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort())
