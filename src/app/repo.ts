import { DriveRepository, type PicturesIntegration } from '@/core/drive/repository'
import type { BlobStores } from '@/core/drive/format'
import { IndexedDbLedger, PictureFetcher, PictureSync, type PictureKind, type PictureSource } from '@/core/drive/pictures'
import { createLocalRepository } from '@/core/files/idb'
import type { FileRepository } from '@/core/files/types'
import { browserCodec } from '@/core/images/codec.browser'
import { makeThumb } from '@/core/images/thumbs'
import { useSettings } from '@/stores/settings'
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

/** Reads a picture (or its small version, made now if it was never made) out of this browser's store. */
export const pictureSource: PictureSource = {
  async read(id: string, kind: PictureKind) {
    const store = blobs?.images
    if (!store) return null
    if (kind === 'thumb') {
      let thumb = await store.getThumb(id)
      if (!thumb) {
        const full = await store.get(id)
        thumb = (full && (await makeThumb(full.blob, browserCodec))) || undefined
        if (thumb) await store.putThumb(id, thumb)
      }
      return thumb ? { bytes: new Uint8Array(await thumb.arrayBuffer()), type: thumb.type } : null
    }
    const full = await store.get(id)
    return full ? { bytes: new Uint8Array(await full.blob.arrayBuffer()), type: full.type } : null
  },
}

const dataSaver = () => {
  try {
    return (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true
  } catch {
    return false
  }
}

/** The queue of pictures going up to Drive. It lives in IndexedDB, so it survives a reload or a crash. */
export const pictureSync = new PictureSync(driveClient, pictureSource, new IndexedDbLedger(), {
  concurrency: 3,
  mode: () => useSettings.getState().pictureUploads,
  holdBack: () => useSettings.getState().pauseOnDataSaver && dataSaver(),
})

/** Brings pictures back from Drive when this device does not have them. */
export const pictureFetcher = new PictureFetcher(driveClient, pictureSync)

const pictures: PicturesIntegration = {
  sync: pictureSync,
  async refs(ids) {
    const store = blobs?.images
    if (!store) return []
    const out = []
    for (const id of new Set(ids)) {
      const m = await store.getMeta(id).catch(() => undefined)
      if (m) out.push({ id, width: m.width, height: m.height, type: m.type, size: m.size })
    }
    return out
  },
}

/**
 * Files kept in this browser (IndexedDB), with Google Drive layered on top for files that live there.
 * Our own cloud will implement the same interface and can be swapped in without touching the screens.
 */
export const driveRepository = new DriveRepository(createLocalRepository(), driveClient, { blobs: () => blobs, storage: storage(), pictures })

/** The file repository the whole app uses. */
export const repository: FileRepository = driveRepository
