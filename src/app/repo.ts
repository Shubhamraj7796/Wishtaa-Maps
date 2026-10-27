import { createLocalRepository } from '@/core/files/idb'
import type { FileRepository } from '@/core/files/types'

/**
 * The file repository the whole app uses: files kept in this browser (IndexedDB).
 * Google Drive and our own cloud implement the same interface and can be swapped in without touching the screens.
 */
export const repository: FileRepository = createLocalRepository()
