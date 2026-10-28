import { DriveAuth, type AuthStorage } from '@/core/drive/auth'
import { DriveClient, type FolderCache } from '@/core/drive/client'

/** Browser-safe settings from the environment. Nothing secret lives here: a client id and a restricted API key. */
export const driveConfig = {
  clientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || undefined,
  apiKey: (import.meta.env.VITE_GOOGLE_API_KEY as string | undefined)?.trim() || undefined,
}

function safeStorage(): AuthStorage | undefined {
  try {
    if (typeof localStorage === 'undefined') return undefined
    return localStorage
  } catch {
    return undefined
  }
}

const FOLDER_KEY = 'wishtaamaps:drive-folder'
const folderCache: FolderCache = {
  get: () => {
    try {
      return safeStorage()?.getItem(FOLDER_KEY) ?? null
    } catch {
      return null
    }
  },
  set: (id) => {
    try {
      if (id) safeStorage()?.setItem(FOLDER_KEY, id)
      else safeStorage()?.removeItem(FOLDER_KEY)
    } catch {
      /* ignore */
    }
  },
}

/** Google sign-in for Drive. Tokens are kept in memory only. */
export const driveAuth = new DriveAuth({ clientId: driveConfig.clientId, storage: safeStorage() })
export const driveClient = new DriveClient(driveAuth, folderCache)
