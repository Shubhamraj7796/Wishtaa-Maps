import { create } from 'zustand'

export type ThemeMode = 'light' | 'dark'

const KEY = 'wishtaamaps:settings'

export function readSavedTheme(storage: Pick<Storage, 'getItem'> | undefined): ThemeMode {
  try {
    const raw = storage?.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object' && 'theme' in parsed) {
      const t = (parsed as { theme: unknown }).theme
      if (t === 'dark' || t === 'light') return t
    }
  } catch {
    /* storage unavailable or corrupt: fall through to default */
  }
  return 'light'
}

interface SettingsState {
  theme: ThemeMode
  toggleTheme: () => void
}

const initial = readSavedTheme(typeof localStorage === 'undefined' ? undefined : localStorage)

export const useSettings = create<SettingsState>((set, get) => ({
  theme: initial,
  toggleTheme: () => {
    const theme: ThemeMode = get().theme === 'light' ? 'dark' : 'light'
    set({ theme })
    try {
      localStorage.setItem(KEY, JSON.stringify({ theme }))
    } catch {
      /* ignore */
    }
  },
}))
