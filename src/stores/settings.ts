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

/** What a plain mouse wheel does on the map. A trackpad's two-finger scroll always moves it. */
export type MouseWheelMode = 'move' | 'zoom'

interface Saved {
  theme?: unknown
  mouseWheel?: unknown
  openAllReadOnly?: unknown
  wheelHintSeen?: unknown
}

function readSaved(storage: Pick<Storage, 'getItem'> | undefined): Saved {
  try {
    const raw = storage?.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? (parsed as Saved) : {}
  } catch {
    return {}
  }
}

interface SettingsState {
  theme: ThemeMode
  toggleTheme: () => void
  mouseWheel: MouseWheelMode
  setMouseWheel: (m: MouseWheelMode) => void
  /** Open every file in Read mode (a Preferences option, off by default). */
  openAllReadOnly: boolean
  setOpenAllReadOnly: (on: boolean) => void
  /** The one-time tip about Ctrl + wheel and pinch has been shown. */
  wheelHintSeen: boolean
  markWheelHintSeen: () => void
}

const storage = typeof localStorage === 'undefined' ? undefined : localStorage
const saved = readSaved(storage)
const initial = readSavedTheme(storage)

export const useSettings = create<SettingsState>((set, get) => {
  const persist = () => {
    const { theme, mouseWheel, openAllReadOnly, wheelHintSeen } = get()
    try {
      localStorage.setItem(KEY, JSON.stringify({ theme, mouseWheel, openAllReadOnly, wheelHintSeen }))
    } catch {
      /* ignore */
    }
  }
  return {
    theme: initial,
    toggleTheme: () => {
      set({ theme: get().theme === 'light' ? 'dark' : 'light' })
      persist()
    },
    mouseWheel: saved.mouseWheel === 'zoom' ? 'zoom' : 'move',
    setMouseWheel: (mouseWheel) => {
      set({ mouseWheel })
      persist()
    },
    openAllReadOnly: saved.openAllReadOnly === true,
    setOpenAllReadOnly: (openAllReadOnly) => {
      set({ openAllReadOnly })
      persist()
    },
    wheelHintSeen: saved.wheelHintSeen === true,
    markWheelHintSeen: () => {
      if (get().wheelHintSeen) return
      set({ wheelHintSeen: true })
      persist()
    },
  }
})
