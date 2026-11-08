import { create } from 'zustand'

/** Which account dialog is open. The dialogs themselves live in `auth/AuthHost.tsx`. */
export type AuthDialog =
  | { kind: 'signin'; view?: 'email' | 'password' | 'signup'; reason?: string }
  /** First sign-in on this browser with files already here: add them to the account? */
  | { kind: 'guest-files'; count: number }
  /** Right after Google sign-in: allow Drive in one more click. */
  | { kind: 'drive-allow'; email: string | null }
  /** A Drive account other than the sign-in email was chosen, or "Connect Google Drive" from a non-Google sign-in. */
  | { kind: 'drive-choose' }

interface AuthUiState {
  dialog: AuthDialog | null
  open: (d: AuthDialog) => void
  close: () => void
}

export const useAuthUi = create<AuthUiState>((set) => ({
  dialog: null,
  open: (dialog) => set({ dialog }),
  close: () => set({ dialog: null }),
}))
