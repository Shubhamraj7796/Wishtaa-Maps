/** Small choices about the PDF screen that are kept on this device (not in the map): the thumbnail strip and the pen bar's auto-collapse. */
export interface PdfUi {
  /** The page thumbnail strip is showing (off by default). */
  thumbs: boolean
  /** The floating pen bar folds to a small button after a few seconds without drawing (on by default). */
  autoCollapse: boolean
}

const KEY = 'wishtaamaps:pdf-ui'
const HINT = 'wishtaamaps:pdf-hint-seen:'

export const DEFAULT_UI: PdfUi = { thumbs: false, autoCollapse: true }

const safe = (): Storage | undefined => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

export function loadPdfUi(store: Pick<Storage, 'getItem'> | undefined = safe()): PdfUi {
  try {
    const v = JSON.parse(store?.getItem(KEY) ?? '{}') as Partial<PdfUi>
    return { thumbs: v.thumbs === true, autoCollapse: v.autoCollapse !== false }
  } catch {
    return DEFAULT_UI
  }
}

export function savePdfUi(ui: PdfUi, store: Pick<Storage, 'setItem'> | undefined = safe()) {
  try {
    store?.setItem(KEY, JSON.stringify(ui))
  } catch {
    /* not remembered */
  }
}

/** The "looks scanned" hint is shown once per PDF (by its file hash). */
export const hintSeen = (hash: string, store: Pick<Storage, 'getItem'> | undefined = safe()) => {
  try {
    return store?.getItem(HINT + hash) === '1'
  } catch {
    return false
  }
}
export const markHintSeen = (hash: string, store: Pick<Storage, 'setItem'> | undefined = safe()) => {
  try {
    store?.setItem(HINT + hash, '1')
  } catch {
    /* shown again next time */
  }
}
