import { useMemo, useSyncExternalStore } from 'react'
import type { DriveAuthState } from '@/core/drive/auth'
import { DriveError } from '@/core/drive/errors'
import type { DriveFolderRef } from '@/core/drive/placement'
import { pickDriveFolder, pickOpenableFiles } from '@/core/drive/picker'
import type { ConflictChoice, DriveConflict } from '@/core/drive/repository'
import type { FileRecord } from '@/core/files/types'
import { currentFileId, reopenFile } from '@/editor/session'
import { driveAuth, driveClient, driveConfig } from './drive'
import { useFiles } from './FilesContext'
import { driveRepository } from './repo'

export const useDriveAuth = (): DriveAuthState => useSyncExternalStore(driveAuth.subscribe, driveAuth.getState)
export const useDriveConflicts = (): DriveConflict[] => useSyncExternalStore(driveRepository.subscribeSync, driveRepository.conflicts)

const messageOf = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Something went wrong with Google Drive.')

/** Everything the screens can do with Google Drive. Failures are shown as a short message, never thrown at the screen. */
export function useDriveActions() {
  const { notify, open, files, setDialog } = useFiles()
  return useMemo(() => {
    const run = async <T,>(work: () => Promise<T>): Promise<T | null> => {
      try {
        return await work()
      } catch (e) {
        // Closing the sign-in window is the user's choice, not a failure worth a message.
        if (!(e instanceof DriveError && e.kind === 'auth' && /window was closed/.test(e.message))) notify(messageOf(e))
        return null
      }
    }

    /** Signs in, creates the "Wishtaa Maps" folder on first use, and brings files up to date. */
    const connect = () =>
      run(async () => {
        await driveAuth.connect()
        const account = await driveClient.account()
        driveAuth.setAccount(account)
        await driveClient.ensureAppFolder()
        notify('Google Drive connected.')
        void driveRepository.syncAll()
        return true
      })

    const ensureConnected = async () => {
      if (driveAuth.ready()) return true
      return (await connect()) === true
    }

    return {
      configured: !!driveConfig.clientId,
      connect,
      /** Signs in first if needed. True when Drive is ready to use. */
      ensureConnected,
      disconnect: () =>
        run(async () => {
          await driveAuth.disconnect()
          notify('Google Drive disconnected. Files stay saved in this browser.')
          return true
        }),
      /** Opens a file from the app's Drive folder (also used by the Drive browser). */
      openDriveFile: (driveFileId: string) =>
        run(async () => {
          if (!(await ensureConnected())) return null
          const rec = await driveRepository.openFromDrive(driveFileId)
          open(rec)
          return rec
        }),
      /**
       * "Open from Google Drive": choose .wishtaa and .emmx files with the Google Picker (several at once). A .wishtaa opens
       * and autosaves to the same Drive file; an .emmx is converted into a NEW .wishtaa copy. The dialog does the rest.
       */
      openFromGoogleDrive: () =>
        run(async () => {
          if (!(await ensureConnected())) return null
          const token = await driveAuth.getToken()
          const docs = await pickOpenableFiles({ token, apiKey: driveConfig.apiKey, clientId: driveConfig.clientId })
          if (!docs.length) return null
          setDialog({ kind: 'driveOpen', docs })
          return docs
        }),
      moveToDrive: (file: FileRecord) =>
        run(async () => {
          if (!(await ensureConnected())) return null
          const rec = await driveRepository.moveToDrive(file.id)
          notify(`"${rec.name}" is now stored in Google Drive.`)
          return rec
        }),
      /** Google Picker in folder mode: where new files should be saved. */
      pickFolder: () =>
        run(async (): Promise<DriveFolderRef | null> => {
          if (!(await ensureConnected())) return null
          const token = await driveAuth.getToken()
          const picked = await pickDriveFolder({ token, apiKey: driveConfig.apiKey, clientId: driveConfig.clientId })
          return picked ? { id: picked.id, name: picked.name } : null
        }),
      /** Brings a Drive file into this browser and moves the Drive copy to Drive's bin. */
      moveToLocal: (file: FileRecord) =>
        run(async () => {
          if (!(await ensureConnected())) return null
          const rec = await driveRepository.moveToLocal(file.id)
          notify(`"${rec.name}" is now stored in this browser only. The copy in Google Drive was moved to the Drive bin.`)
          return rec
        }),
      keepLocal: (file: FileRecord) =>
        run(async () => {
          await driveRepository.keepLocal(file.id)
          notify(`"${file.name}" stays in this browser only. The copy in Drive was left as it is.`)
          return true
        }),
      resolveConflict: (fileId: string, choice: ConflictChoice) =>
        run(async () => {
          await driveRepository.resolveConflict(fileId, choice)
          // The editor still shows the old content when Drive's version was taken: load the file again.
          if (choice !== 'mine' && currentFileId() === fileId) await reopenFile(fileId)
          notify(choice === 'mine' ? 'Kept your version and updated Google Drive.' : choice === 'drive' ? "Kept Google Drive's version." : 'Saved your version as a copy and kept the one from Drive.')
          return true
        }),
      isInDrive: (driveFileId: string) => files.some((f) => f.storage === 'drive' && f.contentRef === driveFileId && !f.trashed),
    }
  }, [notify, open, files, setDialog])
}
