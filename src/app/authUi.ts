import { create } from 'zustand'
import type { PickerFailure, PickerKind } from '@/core/drive/errors'
import type { DriveProblem } from './driveConnect'
import type { PickerChoice } from './pickerNotice'

/** Which account dialog is open. The dialogs themselves live in `auth/AuthHost.tsx`. */
export type AuthDialog =
  | { kind: 'signin'; view?: 'email' | 'password' | 'signup'; reason?: string }
  /** First sign-in on this browser with files already here: add them to the account? */
  | { kind: 'guest-files'; count: number }
  /** Right after Google sign-in: allow Drive in one more click. */
  | { kind: 'drive-allow'; email: string | null }
  /** A Drive account other than the sign-in email was chosen, or "Connect Google Drive" from a non-Google sign-in. */
  | { kind: 'drive-choose' }
  /** Something went wrong connecting Drive that the person can act on (wrong account, Google blocked it, popup blocked). */
  | { kind: 'drive-problem'; problem: DriveProblem; expected?: string | null }
  /** Google's file picker could not open in this browser. `answer` tells the picker's caller what was chosen. */
  | { kind: 'picker-problem'; which: PickerKind; reason: PickerFailure; answer: (c: PickerChoice) => void }

interface AuthUiState {
  dialog: AuthDialog | null
  /** Dialogs waiting their turn (a second one never replaces the one the person is in). */
  queue: AuthDialog[]
  /** Shows a dialog now, or after the current one is closed. */
  open: (d: AuthDialog) => void
  /** Shows a dialog now, replacing the current one (the person asked for it). */
  openNow: (d: AuthDialog) => void
  close: () => void
}

export const useAuthUi = create<AuthUiState>((set, get) => ({
  dialog: null,
  queue: [],
  open: (d) => (get().dialog ? set({ queue: [...get().queue, d] }) : set({ dialog: d })),
  openNow: (dialog) => set({ dialog }),
  close: () => {
    const [next, ...rest] = get().queue
    set({ dialog: next ?? null, queue: rest })
  },
}))
