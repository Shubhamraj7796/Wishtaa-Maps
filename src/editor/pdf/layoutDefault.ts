import { layoutFrom, type SourceView } from './workspace'

/** The layout choices that can be remembered as the starting layout of new PDFs on this device. */
export type Layout = Pick<SourceView, 'two' | 'cover' | 'paged' | 'rtl' | 'fit'>

const KEY = 'wishtaamaps:pdf-default-layout'
/** New PDFs start in the remembered layout only on a screen at least this wide (a phone keeps one page). */
export const WIDE_SCREEN = 900

export const isWideScreen = (width: number) => width >= WIDE_SCREEN

const safe = (): Storage | undefined => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

/** The layout last chosen on this device (empty when none was, or when it was reset). */
export function loadDefaultLayout(store: Pick<Storage, 'getItem'> | undefined = safe()): Layout {
  try {
    const raw = store?.getItem(KEY)
    return raw ? layoutFrom(JSON.parse(raw) as Partial<SourceView>) : {}
  } catch {
    return {}
  }
}

export function saveDefaultLayout(layout: Partial<SourceView>, store: Pick<Storage, 'setItem'> | undefined = safe()) {
  try {
    store?.setItem(KEY, JSON.stringify(layoutFrom(layout)))
  } catch {
    /* not remembered */
  }
}

export function resetDefaultLayout(store: Pick<Storage, 'removeItem'> | undefined = safe()) {
  try {
    store?.removeItem(KEY)
  } catch {
    /* nothing to forget */
  }
}

/** The layout a new PDF starts in: the remembered one on a wide screen, otherwise nothing (one page, scrolling, fit width). */
export const startingLayout = (screenWidth: number, store?: Pick<Storage, 'getItem'>): Layout => (isWideScreen(screenWidth) ? loadDefaultLayout(store) : {})
