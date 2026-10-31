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

/** When the settings panel appears: by itself (Auto), always, or only from its handle (Manual). */
export type PanelMode = 'auto' | 'always' | 'manual'

/** What to do when a picture could be made smaller: ask each time, always compress, or always keep the original. */
export type PicturesPref = 'ask' | 'compress' | 'original'

/** Big, touch-sized controls: decided by the device (Auto), or forced on or off. */
export type TouchControls = 'auto' | 'on' | 'off'

interface Saved {
  theme?: unknown
  mouseWheel?: unknown
  openAllReadOnly?: unknown
  panelMode?: unknown
  picturesPref?: unknown
  touchControls?: unknown
  panelPinned?: unknown
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
  panelMode: PanelMode
  setPanelMode: (m: PanelMode) => void
  picturesPref: PicturesPref
  setPicturesPref: (p: PicturesPref) => void
  touchControls: TouchControls
  setTouchControls: (t: TouchControls) => void
  /** The settings panel stays docked open (large screens). */
  panelPinned: boolean
  setPanelPinned: (on: boolean) => void
  /** The one-time tip about Ctrl + wheel and pinch has been shown. */
  wheelHintSeen: boolean
  markWheelHintSeen: () => void
}

const storage = typeof localStorage === 'undefined' ? undefined : localStorage
const saved = readSaved(storage)
const initial = readSavedTheme(storage)

export const useSettings = create<SettingsState>((set, get) => {
  const persist = () => {
    const { theme, mouseWheel, openAllReadOnly, wheelHintSeen, panelMode, panelPinned, picturesPref, touchControls } = get()
    try {
      localStorage.setItem(KEY, JSON.stringify({ theme, mouseWheel, openAllReadOnly, wheelHintSeen, panelMode, panelPinned, picturesPref, touchControls }))
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
    panelMode: saved.panelMode === 'always' || saved.panelMode === 'manual' ? saved.panelMode : 'auto',
    picturesPref: saved.picturesPref === 'compress' || saved.picturesPref === 'original' ? saved.picturesPref : 'ask',
    setPicturesPref: (picturesPref) => {
      set({ picturesPref })
      persist()
    },
    touchControls: saved.touchControls === 'on' || saved.touchControls === 'off' ? saved.touchControls : 'auto',
    setTouchControls: (touchControls) => {
      set({ touchControls })
      persist()
    },
    setPanelMode: (panelMode) => {
      set({ panelMode })
      persist()
    },
    panelPinned: saved.panelPinned === true,
    setPanelPinned: (panelPinned) => {
      set({ panelPinned })
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
