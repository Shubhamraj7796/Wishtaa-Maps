/** Where a new file or folder is stored. */
export type StorageChoice = 'local' | 'drive'

/** A folder in Google Drive (the app's own "Wishtaa Maps" folder is represented by `null` wherever a folder is optional). */
export interface DriveFolderRef {
  id: string
  name: string
}

export type Placement = { storage: 'local'; parentId: string | null } | { storage: 'drive'; folder: DriveFolderRef | null }

/** What the user chose before, remembered in this browser. */
export interface CreatePrefs {
  /** The last "Save to" choice, used as the default next time. */
  last: StorageChoice | null
  /** "Don't ask again": always use this, without showing the dialog. */
  always: StorageChoice | null
  /** The last Drive folder chosen (null = the default "Wishtaa Maps" folder). */
  driveFolder: DriveFolderRef | null
}

export const DEFAULT_PREFS: CreatePrefs = { last: null, always: null, driveFolder: null }
export const PREFS_KEY = 'wishtaamaps:create-prefs'

const isChoice = (v: unknown): v is StorageChoice => v === 'local' || v === 'drive'

/** Reads saved preferences, ignoring anything damaged. */
export function parsePrefs(raw: string | null | undefined): CreatePrefs {
  if (!raw) return { ...DEFAULT_PREFS }
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof CreatePrefs, unknown>>
    const f = v.driveFolder as Partial<DriveFolderRef> | null | undefined
    return {
      last: isChoice(v.last) ? v.last : null,
      always: isChoice(v.always) ? v.always : null,
      driveFolder: f && typeof f.id === 'string' && f.id && typeof f.name === 'string' ? { id: f.id, name: f.name } : null,
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

/**
 * The option selected when the dialog opens. The remembered choice wins, but Drive can only be the default while it is
 * connected. With nothing remembered, Drive is the default when connected, otherwise this browser.
 */
export function defaultChoice(prefs: CreatePrefs, driveConnected: boolean): StorageChoice {
  const last = prefs.last === 'drive' && !driveConnected ? null : prefs.last
  return last ?? (driveConnected ? 'drive' : 'local')
}

/** "Always use ..." only applies when it can be honoured: "always Drive" is ignored while Drive is not connected. */
export function effectiveAlways(prefs: CreatePrefs, driveConnected: boolean): StorageChoice | null {
  if (!prefs.always) return null
  if (prefs.always === 'drive' && !driveConnected) return null
  return prefs.always
}

/** Where the "New" action was started. */
export type CreateSource = 'home' | 'sidebar' | 'palette' | 'files' | 'drive'

export interface CreateContext {
  source: CreateSource
  /** The local folder being viewed in All files (null at the top level or elsewhere). */
  localFolderId: string | null
  /** The Drive folder being viewed on the Google Drive page (null = the Wishtaa Maps folder). */
  driveFolder: DriveFolderRef | null
}

export type PlacementDecision =
  | { ask: false; placement: Placement }
  | { ask: true; choice: StorageChoice; driveFolder: DriveFolderRef | null }

/**
 * Decides whether to ask where to save.
 * - On the Google Drive page: create right there, in the folder being viewed.
 * - Inside a local folder in All files: create in that folder.
 * - Anywhere else (Home, the sidebar button, the command palette, the top of All files): ask, unless the user said
 *   "don't ask again".
 */
export function decidePlacement(ctx: CreateContext, prefs: CreatePrefs, driveConnected: boolean): PlacementDecision {
  if (ctx.source === 'drive' && driveConnected) return { ask: false, placement: { storage: 'drive', folder: ctx.driveFolder } }
  if (ctx.source === 'files' && ctx.localFolderId) return { ask: false, placement: { storage: 'local', parentId: ctx.localFolderId } }
  const always = effectiveAlways(prefs, driveConnected)
  if (always) {
    return { ask: false, placement: always === 'drive' ? { storage: 'drive', folder: prefs.driveFolder } : { storage: 'local', parentId: ctx.localFolderId } }
  }
  return { ask: true, choice: defaultChoice(prefs, driveConnected), driveFolder: prefs.driveFolder }
}

/** Short wording for a choice. */
export const choiceLabel = (c: StorageChoice) => (c === 'drive' ? 'Google Drive' : 'This browser')
