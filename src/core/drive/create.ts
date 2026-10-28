import { buildStarterContent } from '../files/templates'
import type { FileRecord, FileRepository } from '../files/types'
import type { DriveFileMeta } from './client'
import { DriveError } from './errors'
import type { Placement } from './placement'

export type NewItem = 'map' | 'kb' | 'folder'

export interface CreateInput {
  kind: NewItem
  /** Required for folders; maps and knowledge bases get a default name. */
  name?: string
  placement: Placement
}

/** The Drive operations creation needs (implemented by `DriveRepository`). */
export interface DriveCreator {
  moveToDrive(id: string, parentFolderId?: string): Promise<FileRecord>
  createDriveFolder(name: string, parentFolderId?: string): Promise<DriveFileMeta>
}

export interface CreateServices {
  repo: FileRepository
  drive: DriveCreator
}

export type CreateOutcome =
  | {
      status: 'created'
      kind: NewItem
      /** The new file or local folder; null for a folder created in Drive. */
      record: FileRecord | null
      driveFolder?: DriveFileMeta
    }
  | {
      status: 'drive-failed'
      kind: NewItem
      input: CreateInput
      error: DriveError
      /**
       * For a map or knowledge base the new file already exists in this browser, so nothing is lost while Drive is
       * retried. Null for a folder (nothing was made yet).
       */
      record: FileRecord | null
    }

const asDriveError = (e: unknown): DriveError => (e instanceof DriveError ? e : new DriveError('other', e instanceof Error && e.message ? e.message : 'Something went wrong with Google Drive.'))

async function createLocal(repo: FileRepository, input: CreateInput, parentId: string | null): Promise<FileRecord> {
  if (input.kind === 'folder') return repo.create({ type: 'folder', name: input.name, parentId })
  return repo.create({ type: input.kind, name: input.name, parentId, content: buildStarterContent(input.kind === 'kb' ? 'kb' : 'blank') })
}

/**
 * Creates a map, knowledge base or folder where the user chose.
 *
 * In Drive, the `.wishtaa` file is created in Drive right away (so the first autosave updates it instead of making a
 * duplicate) and a folder becomes a real Drive folder. If Drive can't be reached, the new map or knowledge base is kept
 * in this browser and the outcome says so, so it can be retried or kept here. Nothing is ever lost.
 */
export async function createItem({ repo, drive }: CreateServices, input: CreateInput): Promise<CreateOutcome> {
  const p = input.placement
  if (p.storage === 'local') return { status: 'created', kind: input.kind, record: await createLocal(repo, input, p.parentId) }

  if (input.kind === 'folder') {
    try {
      const driveFolder = await drive.createDriveFolder(input.name?.trim() || 'New folder', p.folder?.id)
      return { status: 'created', kind: 'folder', record: null, driveFolder }
    } catch (e) {
      return { status: 'drive-failed', kind: 'folder', input, error: asDriveError(e), record: null }
    }
  }

  const record = await createLocal(repo, input, null) // safe copy first
  try {
    return { status: 'created', kind: input.kind, record: await drive.moveToDrive(record.id, p.folder?.id) }
  } catch (e) {
    return { status: 'drive-failed', kind: input.kind, input, error: asDriveError(e), record }
  }
}

/** Tries Drive again for something that failed. A folder that no longer exists falls back to the default Wishtaa Maps folder. */
export async function retryCreate(services: CreateServices, failed: Extract<CreateOutcome, { status: 'drive-failed' }>): Promise<CreateOutcome> {
  const p = failed.input.placement
  const folder = failed.error.kind === 'notfound' ? null : p.storage === 'drive' ? p.folder : null
  const input: CreateInput = { ...failed.input, placement: { storage: 'drive', folder } }
  if (failed.record) {
    try {
      return { status: 'created', kind: failed.kind, record: await services.drive.moveToDrive(failed.record.id, folder?.id) }
    } catch (e) {
      return { status: 'drive-failed', kind: failed.kind, input, error: asDriveError(e), record: failed.record }
    }
  }
  return createItem(services, input)
}

/** "Create in this browser instead": keeps the file made earlier, or makes the folder here. */
export async function createHereInstead({ repo }: CreateServices, failed: Extract<CreateOutcome, { status: 'drive-failed' }>): Promise<FileRecord> {
  return failed.record ?? createLocal(repo, failed.input, null)
}
