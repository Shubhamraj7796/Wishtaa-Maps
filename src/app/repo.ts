import { DriveRepository } from '@/core/drive/repository'
import type { BlobStores } from '@/core/drive/format'
import { createLocalRepository } from '@/core/files/idb'
import type { FileRepository } from '@/core/files/types'
import { driveClient } from './drive'

let blobs: BlobStores | undefined
/** Registered at start-up (the picture and attachment stores live in the editor and can't be imported here). */
export function setBlobStores(stores: BlobStores) {
  blobs = stores
}

function storage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

/**
 * Files kept in this browser (IndexedDB), with Google Drive layered on top for files that live there.
 * Our own cloud will implement the same interface and can be swapped in without touching the screens.
 */
export const driveRepository = new DriveRepository(createLocalRepository(), driveClient, { blobs: () => blobs, storage: storage() })

/** The file repository the whole app uses. */
export const repository: FileRepository = driveRepository
