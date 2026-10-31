import { browserCodec } from '@/core/images/codec.browser'
import { analyze, pick, type Analysis, type Candidate, type Codec, type Edit } from '@/core/images/pipeline'
import { decide, type PicturesPref } from '@/core/images/plan'
import { ImageError } from '@/core/images/process'
import { defaultDisplaySize } from '@/core/images/resize'
import { pictureIdOf } from '@/core/images/sha256'
import { addChild, setImage } from '@/core/model/commands'
import { LOCAL } from '@/core/model/doc'
import { useSettings } from '@/stores/settings'
import { imageStore, track } from '../images'
import { mapDoc } from '../mapdoc'
import { showNotice } from '../notice'
import { mayEdit } from '../readmode'
import { useEditor, type PictureSource, type PictureTarget } from '../store'
import { CAPTURE_NOTICE, CAPTURE_UNSUPPORTED, canCaptureScreen, captureScreen, chooseFiles, readClipboardImage } from './sources'

const get = useEditor.getState
const set = useEditor.setState

/** The browser's picture tools. Tests swap in a fake. */
let activeCodec: Codec = browserCodec
export const setPictureCodec = (c: Codec) => void (activeCodec = c)

/** These sources open the crop step by default (the picture is usually bigger than what is wanted). Upload crops only if asked. */
export const CROP_BY_DEFAULT: PictureSource[] = ['camera', 'gallery', 'paste', 'capture']

// ---- the originals kept for "Crop again" (this session only) and the recently used pictures ---------------------------
const originals = new Map<string, Blob>()
export const originalFor = (pictureId: string): Blob | undefined => originals.get(pictureId)

const RECENT_KEY = 'wishtaamaps:recent-pictures'
export function recentPictures(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 30) : []
  } catch {
    return []
  }
}
function rememberRecent(id: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recentPictures().filter((x) => x !== id)].slice(0, 30)))
  } catch {
    /* not remembered */
  }
}

/** The pictures already in this map, each once, in reading order. */
export function pictureIdsInMap(): string[] {
  const out: string[] = []
  for (const t of Object.values(get().topics)) if (t.image && !out.includes(t.image.imageId)) out.push(t.image.imageId)
  return out
}

// ---- where a picture goes ---------------------------------------------------------------------------------------------
export function resolveTarget(): PictureTarget {
  const s = get()
  const sel = s.selected[s.selected.length - 1]
  if (sel && s.topics[sel]) return { kind: 'topic', id: sel }
  return { kind: 'child', parentId: s.focusId && s.topics[s.focusId] ? s.focusId : s.rootId }
}

export function openAddPicture(target: PictureTarget = resolveTarget()) {
  if (!mayEdit('Adding a picture')) return
  set({ pictureMenu: target })
}
export const closeAddPicture = () => set({ pictureMenu: null })

/** What the stored picture says about itself when read aloud. */
function defaultAlt(source: PictureSource): string | undefined {
  if (source === 'upload' || source === 'drop') return undefined
  const base = source === 'capture' ? 'Screenshot' : 'Photo'
  return `${base} ${new Date().toLocaleString()}`
}

/** Stores the picture (once: the same bytes are the same picture) and returns its id. */
export async function storePicture(c: Candidate): Promise<string> {
  const id = await pictureIdOf(c.blob)
  if (!(await imageStore.getMeta(id).catch(() => undefined))) {
    await track(imageStore.put({ id, blob: c.blob, width: c.width, height: c.height, type: c.type, size: c.blob.size }))
  }
  rememberRecent(id)
  return id
}

export interface Placed {
  id: string
  width: number
  height: number
  alt?: string
  name?: string
}

/** Puts one or more stored pictures in the map as ONE undo step. The first goes where asked; more become new child topics. */
export function placePictures(items: Placed[], target: PictureTarget): string | null {
  if (!items.length || !mayEdit('Adding a picture')) return null
  let first: string | null = null
  mapDoc.ydoc.transact(() => {
    items.forEach((it, i) => {
      const size = defaultDisplaySize(it.width, it.height)
      const image = { imageId: it.id, width: size.width, height: size.height, ...(it.alt ? { alt: it.alt } : {}) }
      let topicId: string
      if (i === 0 && target.kind !== 'child') topicId = target.id
      else {
        const parent = target.kind === 'child' ? target.parentId : target.id
        topicId = addChild(mapDoc, parent, it.name?.replace(/\.[^.]+$/, '').slice(0, 80) || 'Picture')
      }
      setImage(mapDoc, topicId, image)
      if (first === null) first = topicId
    })
  }, LOCAL)
  if (first) set({ selected: [first], imageSelected: first })
  return first
}

// ---- the choice between Compressed and Original --------------------------------------------------------------------
export function requestChoice(items: { name: string; original: number; compressed: number }[], preview?: { original: Blob; compressed: Blob }) {
  return new Promise<{ choice: 'compressed' | 'original'; remember: boolean } | null>((resolve) => {
    set({
      pictureChoice: {
        items,
        preview,
        resolve: (a) => {
          set({ pictureChoice: null })
          resolve(a)
        },
      },
    })
  })
}

export function rememberChoice(choice: 'compressed' | 'original') {
  useSettings.getState().setPicturesPref(choice === 'compressed' ? 'compress' : 'original')
}

/** What the saved preference says about one picture. */
export const decideFor = (pref: PicturesPref, a: Analysis) => decide(pref, a.original?.blob.size ?? a.source.bytes, a.compressed.blob.size)

/** Works out the stored version for a picture the person has already chosen (or the preference chose). */
export async function finalize(a: Analysis, choice: 'compressed' | 'original', source: Blob): Promise<Candidate> {
  const c = pick(a, choice)
  originals.set(await pictureIdOf(c.blob), source) // for "Crop again", this session only
  return c
}

/** Adds pictures from files or blobs. A single picture from a camera, photos, the clipboard or a screen capture is cropped first. */
export async function addPictures(blobs: Blob[], source: PictureSource, target: PictureTarget, opts: { retake?: () => Promise<Blob | null>; crop?: boolean; codec?: Codec } = {}): Promise<void> {
  if (!mayEdit('Adding a picture')) return
  const images = blobs.filter((b) => b.size > 0)
  if (!images.length) return
  const first = images[0] as Blob
  if (images.length === 1 && (opts.crop ?? CROP_BY_DEFAULT.includes(source))) {
    set({ pictureDraft: { blob: first, source, target, retake: opts.retake } })
    return
  }
  const codec = opts.codec ?? activeCodec
  try {
    const pref = useSettings.getState().picturesPref
    const analyses: Analysis[] = []
    for (const b of images) analyses.push(await analyze(b, {}, codec))
    const decisions = analyses.map((a) => decideFor(pref, a))
    let choices = decisions.map((d) => d.use)
    if (decisions.some((d) => d.ask)) {
      const answer = await requestChoice(
        images.map((b, i) => ({ name: (b as File).name || `Picture ${i + 1}`, original: analyses[i]?.original?.blob.size ?? b.size, compressed: analyses[i]?.compressed.blob.size ?? b.size })),
        images.length === 1 && analyses[0]?.original ? { original: analyses[0].original.blob, compressed: analyses[0].compressed.blob } : undefined
      )
      if (!answer) return
      if (answer.remember) rememberChoice(answer.choice)
      choices = choices.map(() => answer.choice)
    }
    const placed: Placed[] = []
    for (const [i, b] of images.entries()) {
      const a = analyses[i] as Analysis
      let choice = choices[i] as 'compressed' | 'original'
      if (choice === 'original' && !a.original) {
        // The hard limits (10 MB, 4000 px) apply whatever was chosen. Say so, and use Compressed.
        showNotice(`${a.originalProblem ?? 'That picture is too large to keep as it is.'} It was added as Compressed instead.`, 8000)
        choice = 'compressed'
      }
      const c = await finalize(a, choice, b)
      const id = await storePicture(c)
      placed.push({ id, width: c.width, height: c.height, alt: defaultAlt(source), name: (b as File).name })
    }
    placePictures(placed, target)
  } catch (e) {
    showNotice(e instanceof ImageError ? e.message : "Couldn't save that picture in this browser. Storage may be full or blocked.")
  }
}

/** The crop step is done: store the chosen version and put it in the map. */
export async function finishDraft(c: Candidate, source: PictureSource, target: PictureTarget, original: Blob): Promise<void> {
  try {
    const id = await storePicture(c)
    originals.set(id, original)
    placePictures([{ id, width: c.width, height: c.height, alt: defaultAlt(source) }], target)
  } catch (e) {
    showNotice(e instanceof ImageError ? e.message : "Couldn't save that picture in this browser. Storage may be full or blocked.")
  } finally {
    set({ pictureDraft: null })
  }
}

/** Uses a picture that is already stored: a new reference to the same picture, with nothing new to store or upload. */
export async function reusePicture(id: string, target: PictureTarget): Promise<void> {
  const meta = await imageStore.getMeta(id).catch(() => undefined)
  if (!meta) {
    showNotice('That picture is no longer stored in this browser.')
    return
  }
  closeAddPicture()
  rememberRecent(id)
  placePictures([{ id, width: meta.width, height: meta.height }], target)
}

/** Starts one source. Always from a person's action: nothing here runs by itself. */
export async function startSource(source: PictureSource, target: PictureTarget, opts: { crop?: boolean } = {}): Promise<void> {
  closeAddPicture()
  if (!mayEdit('Adding a picture')) return
  switch (source) {
    case 'upload':
    case 'gallery': {
      const files = await chooseFiles({ multiple: true })
      if (files.length) await addPictures(files, source, target, { crop: opts.crop })
      return
    }
    case 'camera': {
      const retake = async () => (await chooseFiles({ camera: true }))[0] ?? null
      const f = await retake()
      if (f) await addPictures([f], 'camera', target, { retake })
      return
    }
    case 'paste': {
      const r = await readClipboardImage()
      if ('error' in r) showNotice(r.error, 7000)
      else await addPictures([r.blob], 'paste', target)
      return
    }
    case 'capture': {
      if (!canCaptureScreen()) {
        showNotice(CAPTURE_UNSUPPORTED, 7000)
        return
      }
      showNotice(CAPTURE_NOTICE, 5000)
      const blob = await captureScreen()
      if (blob) await addPictures([blob], 'capture', target, { retake: captureScreen })
      return
    }
    default:
      return
  }
}

export type { Edit }
