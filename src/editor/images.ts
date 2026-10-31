import { useEffect, useState } from 'react'
import { ImageGc } from '@/core/images/gc'
import { ImageError, processImageFile } from '@/core/images/process'
import { defaultDisplaySize, nudgeSize, originalSize } from '@/core/images/resize'
import { IndexedDbImageStore, MemoryImageStore, type ImageStore } from '@/core/images/store'
import { setImage, setImageSize } from '@/core/model/commands'
import { MAX_UNDO } from '@/core/model/doc'
import { newId } from '@/core/model/ids'
import { repository } from '../app/repo'
import { mapDoc } from './mapdoc'
import { showNotice } from './notice'
import { useEditor, type ImageLive } from './store'

const get = useEditor.getState
const set = useEditor.setState

function createStore(): ImageStore {
  try {
    if (typeof indexedDB !== 'undefined') return new IndexedDbImageStore()
  } catch {
    /* fall through */
  }
  return new MemoryImageStore()
}

/** Swap this for a Supabase Storage implementation when cloud save arrives. */
export const imageStore: ImageStore = createStore()

// ---- pending writes (the autosaver waits for these before writing the map) ----
const pending = new Set<Promise<unknown>>()
export function track<T>(p: Promise<T>): Promise<T> {
  pending.add(p)
  const done = () => void pending.delete(p)
  p.then(done, done)
  return p
}
export async function imagesIdle(): Promise<void> {
  while (pending.size) await Promise.allSettled([...pending])
}

// ---- object URLs for display ----
const urls = new Map<string, string>()
const loading = new Map<string, Promise<string | null>>()

function loadUrl(id: string): Promise<string | null> {
  const known = urls.get(id)
  if (known) return Promise.resolve(known)
  let p = loading.get(id)
  if (!p) {
    p = imageStore
      .get(id)
      .then((img) => {
        if (!img) return null
        const url = URL.createObjectURL(img.blob)
        urls.set(id, url)
        return url
      })
      .catch(() => null)
      .finally(() => loading.delete(id))
    loading.set(id, p)
  }
  return p
}

function releaseUrl(id: string) {
  const url = urls.get(id)
  if (url) URL.revokeObjectURL(url)
  urls.delete(id)
}

/**
 * The picture's address, keyed by its id (its content hash): when the id changes (a picture was replaced or cropped again) the
 * old address is NEVER shown for the new picture, not even for a moment.
 */
export function useImageUrl(id: string): { url: string | null; missing: boolean } {
  const [state, setState] = useState<{ id: string; url: string | null; missing: boolean }>(() => ({ id, url: urls.get(id) ?? null, missing: false }))
  useEffect(() => {
    let cancelled = false
    void loadUrl(id).then((url) => {
      if (!cancelled) setState(url ? { id, url, missing: false } : { id, url: null, missing: true })
    })
    return () => {
      cancelled = true
    }
  }, [id])
  if (state.id !== id) return { url: urls.get(id) ?? null, missing: false }
  return { url: state.url ?? urls.get(id) ?? null, missing: state.missing }
}

/**
 * Frees the cached addresses of pictures no topic uses any more (after a replace, a crop again, or a delete). If undo brings one
 * back, its address is simply made again when it is next shown.
 */
export function releaseUnusedUrls() {
  const used = new Set<string>()
  for (const t of Object.values(get().topics)) if (t.image) used.add(t.image.imageId)
  for (const id of [...urls.keys()]) if (!used.has(id) && get().lightbox !== id) releaseUrl(id)
}

// ---- cleanup of unused blobs ----
const referenceSources: (() => Iterable<string>)[] = []
/** Lets other modules (e.g. the clipboard) keep images alive. */
export function addImageReferenceSource(fn: () => Iterable<string>) {
  referenceSources.push(fn)
}

async function referencedIds(): Promise<Set<string>> {
  const ids = await repository.referencedImageIds()
  for (const t of Object.values(get().topics)) if (t.image) ids.add(t.image.imageId)
  for (const src of referenceSources) for (const id of src()) ids.add(id)
  return ids
}

const gc = new ImageGc(imageStore, referencedIds, MAX_UNDO)
export const noteUndoStep = () => gc.noteStep()

let gcTimer: ReturnType<typeof setTimeout> | undefined
/** Looks for unused blobs shortly after things settle. */
export function scheduleImageGc() {
  clearTimeout(gcTimer)
  gcTimer = setTimeout(() => {
    gc.scan()
      .then((deleted) => deleted.forEach(releaseUrl))
      .catch(() => {})
  }, 2000)
}

/** At start-up undo history is empty, so every unused blob can go. */
export async function sweepUnusedImages() {
  try {
    ;(await gc.sweepAll()).forEach(releaseUrl)
  } catch {
    /* storage unavailable: nothing to clean */
  }
}

// ---- actions ----
export const currentTopicId = (): string | null => {
  const s = get()
  return s.editingId ?? s.selected[s.selected.length - 1] ?? null
}

/** Topic whose image is currently selected, if any. */
export function selectedImageTopic(): string | null {
  const s = get()
  const id = s.imageSelected
  return id && s.selected.length === 1 && s.selected[0] === id && s.topics[id]?.image ? id : null
}

export function selectImage(topicId: string) {
  if (get().topics[topicId]?.image) set({ selected: [topicId], imageSelected: topicId })
}
export const clearImageSelection = () => set({ imageSelected: null })

export async function addImageToTopic(file: Blob, topicId: string, source: 'paste' | 'drop' = 'drop'): Promise<void> {
  if (!get().topics[topicId]) {
    showNotice('Select a topic first, then add the image.')
    return
  }
  const { addPictures } = await import('./pictures/flow')
  await addPictures([file], source, { kind: 'topic', id: topicId })
}

/** The old way: store at the fixed size without asking. Kept for code that still needs a plain add. */
export async function addImagePlain(file: Blob, topicId: string): Promise<void> {
  try {
    const p = await processImageFile(file)
    const id = newId()
    // The blob is stored before the map references it.
    await track(imageStore.put({ id, blob: p.blob, width: p.width, height: p.height, type: p.type, size: p.blob.size }))
    if (!get().topics[topicId]) {
      void imageStore.delete(id).catch(() => {})
      return
    }
    const size = defaultDisplaySize(p.width, p.height)
    setImage(mapDoc, topicId, { imageId: id, width: size.width, height: size.height })
    set({ selected: [topicId], imageSelected: topicId })
  } catch (e) {
    showNotice(
      e instanceof ImageError ? e.message : "Couldn't save that image in this browser. Storage may be full or blocked."
    )
  }
}

export function removeImage(topicId: string | null = selectedImageTopic() ?? currentTopicId()) {
  if (!topicId || !get().topics[topicId]?.image) return
  setImage(mapDoc, topicId, null)
  if (get().imageSelected === topicId) set({ imageSelected: null })
}

export async function resetImageSize(topicId: string | null = currentTopicId()) {
  const image = topicId ? get().topics[topicId]?.image : null
  if (!topicId || !image) return
  const meta = await imageStore.getMeta(image.imageId).catch(() => undefined)
  if (!meta) return
  const s = originalSize(meta.width, meta.height)
  setImageSize(mapDoc, topicId, s.width, s.height)
}

/** Keyboard resize: changes the selected image's width by `delta` px, keeping its shape. */
export function nudgeImage(delta: number) {
  const id = selectedImageTopic()
  const image = id ? get().topics[id]?.image : null
  if (!id || !image) return
  const s = nudgeSize(image.width, image.height, delta)
  setImageSize(mapDoc, id, s.width, s.height)
}

export const setImageLive = (live: ImageLive | null) => set({ imageLive: live })
export const commitImageSize = (topicId: string, w: number, h: number) => setImageSize(mapDoc, topicId, w, h)

export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

/** Opens the Add picture menu for a topic (or, with none selected, for a new child of the focused topic). */
export async function cmdAddImage(topicId: string | null = currentTopicId()) {
  const { openAddPicture } = await import('./pictures/flow')
  openAddPicture(topicId ? { kind: 'topic', id: topicId } : undefined)
}

/** First image in a clipboard or drag payload. */
export function firstImageFile(dt: DataTransfer | null): File | null {
  if (!dt) return null
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile()
      if (f) return f
    }
  }
  return Array.from(dt.files ?? []).find((f) => f.type.startsWith('image/')) ?? null
}

export function hasFiles(dt: DataTransfer | null): boolean {
  return !!dt && Array.from(dt.types ?? []).includes('Files')
}

/** Saves a topic's picture to the computer. */
export async function downloadImage(imageId: string, name: string) {
  const stored = await imageStore.get(imageId).catch(() => undefined)
  if (!stored) {
    showNotice('That picture is no longer stored in this browser.')
    return
  }
  const ext = stored.type === 'image/webp' ? 'webp' : stored.type === 'image/jpeg' ? 'jpg' : 'png'
  const url = URL.createObjectURL(stored.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 60) || 'picture'}.${ext}`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** Replaces a topic's picture with a new file (the old one is cleaned up later). */
export async function replaceImage(topicId: string) {
  const { openAddPicture } = await import('./pictures/flow')
  openAddPicture({ kind: 'replace', id: topicId })
}

/** Puts a picture on the clipboard, where the browser allows it. */
export async function copyImage(imageId: string): Promise<boolean> {
  const stored = await imageStore.get(imageId).catch(() => undefined)
  const Item = (globalThis as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem
  if (!stored || !Item || !navigator.clipboard?.write) {
    showNotice('This browser cannot copy a picture. Use Download instead.')
    return false
  }
  try {
    await navigator.clipboard.write([new Item({ [stored.type]: stored.blob })])
    showNotice('Picture copied.')
    return true
  } catch {
    showNotice('Could not copy the picture.')
    return false
  }
}

export async function loadImageBlob(imageId: string): Promise<Blob | null> {
  return (await imageStore.get(imageId).catch(() => undefined))?.blob ?? null
}
