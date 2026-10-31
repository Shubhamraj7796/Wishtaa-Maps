import { useEffect, useState, useSyncExternalStore } from 'react'
import { NotUploadedYet } from '@/core/drive/pictures'
import { PictureCache } from '@/core/images/cache'
import { browserCodec } from '@/core/images/codec.browser'
import { ImageGc } from '@/core/images/gc'
import { averageColor } from '@/core/images/color'
import { LOD } from '@/core/images/lod'
import { PICTURE_LIMITS } from '@/core/images/limits'
import { ImageError, processImageFile } from '@/core/images/process'
import { defaultDisplaySize, nudgeSize, originalSize } from '@/core/images/resize'
import { IndexedDbImageStore, MemoryImageStore, type ImageStore, type StoredImage } from '@/core/images/store'
import { makeThumb } from '@/core/images/thumbs'
import { setImage, setImageSize } from '@/core/model/commands'
import { MAX_UNDO } from '@/core/model/doc'
import { newId } from '@/core/model/ids'
import { repository } from '../app/repo'
import { mapDoc } from './mapdoc'
import { showNotice } from './notice'
import { isTouchFriendly } from './pictures/touch'
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

// ---- where a picture comes from when this device does not have it ----
/** Fetches pictures from Drive. `full` stores what it fetched; either may throw "Picture is still uploading". */
export interface PictureFallback {
  full(id: string): Promise<StoredImage | null>
  thumb(id: string): Promise<Blob | null>
}
let fallback: PictureFallback | null = null
export const setPictureFallback = (f: PictureFallback | null) => void (fallback = f)

// ---- object URLs for display ----
// Full pictures are keyed by their id, small versions by `${id}#t`. A picture's address is made when it is first shown and
// revoked when it falls out of the memory budget (and is not on screen) or when no topic uses it any more.
const THUMB = '#t'
const urls = new Map<string, string>()
const loading = new Map<string, Promise<string | null>>()
const baseId = (key: string) => (key.endsWith(THUMB) ? key.slice(0, -THUMB.length) : key)

/** Decoded pictures kept within a memory budget: least recently used ones with nobody showing them go first. */
export const pictureCache = new PictureCache(
  () => (isTouchFriendly() ? PICTURE_LIMITS.memoryTouch : PICTURE_LIMITS.memoryDesktop),
  (key) => releaseKey(key)
)

// So the benchmark (bench/run500.mjs) can read the app's own cache. Development only.
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __pictureCache?: PictureCache }).__pictureCache = pictureCache

/** At most a few pictures are read and decoded at the same time, so a big map never freezes the page. */
let busy = 0
const waiting: (() => void)[] = []
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  while (busy >= PICTURE_LIMITS.concurrentLoads) await new Promise<void>((r) => waiting.push(r))
  busy++
  try {
    return await fn()
  } finally {
    busy--
    waiting.shift()?.()
  }
}

function stored(key: string, blob: Blob, width: number, height: number): string {
  const url = URL.createObjectURL(blob)
  urls.set(key, url)
  pictureCache.add(key, Math.max(1, width) * Math.max(1, height) * 4)
  return url
}

/** The picture is not in Drive yet (another device is still sending it). */
class Pending extends Error {}

function loadKey(key: string): Promise<string | null> {
  const known = urls.get(key)
  if (known) {
    pictureCache.touch(key)
    return Promise.resolve(known)
  }
  let p = loading.get(key)
  if (!p) {
    const id = baseId(key)
    const thumb = key !== id
    p = slot(() => (thumb ? loadThumb(key, id) : loadFull(key, id)))
      .catch((e) => {
        if (e instanceof Pending) throw e
        return null
      })
      .finally(() => loading.delete(key))
    loading.set(key, p)
  }
  return p
}

async function fromFallback<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof NotUploadedYet) throw new Pending()
    throw e
  }
}

async function loadFull(key: string, id: string): Promise<string | null> {
  let img = await imageStore.get(id)
  if (!img && fallback) img = (await fromFallback(() => (fallback as PictureFallback).full(id))) ?? undefined
  return img ? stored(key, img.blob, img.width, img.height) : null
}

async function loadThumb(key: string, id: string): Promise<string | null> {
  let blob = await imageStore.getThumb(id)
  if (!blob) {
    const full = await imageStore.get(id)
    if (full) blob = (await makeThumb(full.blob, browserCodec)) ?? undefined
    else if (fallback) blob = (await fromFallback(() => (fallback as PictureFallback).thumb(id))) ?? undefined
    if (blob) {
      const kept = blob
      void averageColor(kept, browserCodec).then((c) => imageStore.putThumb(id, kept, c ?? undefined)).catch(() => undefined)
    }
  }
  // No small version could be made: the full picture is shown instead.
  if (!blob) return loadKey(id)
  return stored(key, blob, PICTURE_LIMITS.thumbSide, PICTURE_LIMITS.thumbSide)
}

function releaseKey(key: string) {
  const url = urls.get(key)
  if (url) URL.revokeObjectURL(url)
  urls.delete(key)
  pictureCache.remove(key)
}
function releaseUrl(id: string) {
  releaseKey(id)
  releaseKey(id + THUMB)
}

/** Makes (and keeps) the small version of a picture and its average colour; used right after a picture is added. */
export async function ensureThumb(id: string): Promise<void> {
  try {
    if (await imageStore.getThumb(id)) return
    const full = await imageStore.get(id)
    const blob = full && (await makeThumb(full.blob, browserCodec))
    if (blob) await imageStore.putThumb(id, blob, (await averageColor(blob, browserCodec)) ?? undefined)
  } catch {
    /* the small version is made when it is first needed */
  }
}

// ---- the flat colour drawn for a picture that is tiny on screen ----
const colors = new Map<string, string>()
const colorLoading = new Map<string, Promise<string | null>>()

async function loadColor(id: string): Promise<string | null> {
  const known = colors.get(id)
  if (known) return known
  let p = colorLoading.get(id)
  if (!p) {
    p = (async () => {
      let c = (await imageStore.getThumbColor(id).catch(() => undefined)) ?? null
      if (!c) {
        // A small version made before colours were kept (or fetched from Drive): read the colour from it once, and keep it.
        const thumb = await imageStore.getThumb(id).catch(() => undefined)
        c = thumb ? await averageColor(thumb, browserCodec) : null
        if (c) void imageStore.setThumbColor(id, c).catch(() => undefined)
      }
      if (c) colors.set(id, c)
      return c
    })().finally(() => colorLoading.delete(id))
    colorLoading.set(id, p)
  }
  return p
}

/** The picture's average colour (null until known); `enabled=false` looks nothing up. */
export function usePictureColor(id: string, enabled: boolean): string | null {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!enabled || colors.has(id)) return
    let cancelled = false
    void loadColor(id).then((c) => {
      if (c && !cancelled) tick((n) => n + 1)
    })
    return () => {
      cancelled = true
    }
  }, [id, enabled])
  return colors.get(id) ?? null
}

// ---- is the view being moved right now? (small versions are drawn while it is) ----
let moving = false
/** Counts gestures: a picture upgraded to full size after one is cheap again when the next begins. */
let epoch = 0
let movingTimer: ReturnType<typeof setTimeout> | undefined
const movingListeners = new Set<() => void>()
/** Called by every pan and zoom step; "moving" ends 150 ms after the last one. */
export function noteViewportActivity() {
  if (!moving) {
    moving = true
    epoch++
    upgrades.length = 0
    movingListeners.forEach((l) => l())
  }
  clearTimeout(movingTimer)
  movingTimer = setTimeout(() => {
    moving = false
    movingListeners.forEach((l) => l())
  }, LOD.idleMs)
}

// Pictures that want their full-size version after a gesture get it a few per frame, so it never holds up a frame.
const upgrades: (() => void)[] = []
let pumping = false
function pump() {
  if (pumping || typeof requestAnimationFrame === 'undefined') return
  pumping = true
  const step = () => {
    for (let i = 0; i < LOD.upgradesPerFrame; i++) upgrades.shift()?.()
    pumping = false
    if (upgrades.length) pump()
  }
  requestAnimationFrame(step)
}

/**
 * True once this picture may show its full version: not while the view is moving, and after the gesture ends only in turn (a few
 * pictures per frame). `wants=false` (it is not at full detail) asks for nothing.
 */
export function useUpgrade(wants: boolean): boolean {
  const gesture = useSyncExternalStore(
    (l) => {
      movingListeners.add(l)
      return () => void movingListeners.delete(l)
    },
    () => (moving ? -epoch : epoch),
    () => 0
  )
  const [granted, setGranted] = useState(-1)
  useEffect(() => {
    if (!wants || gesture < 0 || granted === gesture) return
    let live = true
    const go = () => live && setGranted(gesture)
    if (typeof requestAnimationFrame === 'undefined') go()
    else {
      upgrades.push(go)
      pump()
    }
    return () => {
      live = false
      const i = upgrades.indexOf(go)
      if (i >= 0) upgrades.splice(i, 1)
    }
  }, [wants, gesture, granted])
  return wants && gesture >= 0 && granted === gesture
}
/** True while the view is being moved (and for 150 ms after). */
export function useViewMoving(): boolean {
  return useSyncExternalStore(
    (l) => {
      movingListeners.add(l)
      return () => void movingListeners.delete(l)
    },
    () => moving,
    () => false
  )
}

export interface ImageUrlState {
  url: string | null
  missing: boolean
  /** Not in Drive yet: another device is still sending it. */
  pending: boolean
}

/**
 * The picture's address, keyed by its id (its content hash): when the id changes (a picture was replaced or cropped again) the
 * old address is NEVER shown for the new picture, not even for a moment.
 *
 * `thumb` asks for the small version (zoomed far out, or while the view moves). `enabled=false` (far off screen) loads nothing
 * and lets go of the picture's memory.
 */
export function useImageUrl(id: string, opts: { thumb?: boolean; enabled?: boolean } = {}): ImageUrlState {
  const enabled = opts.enabled ?? true
  const key = opts.thumb ? id + THUMB : id
  const [state, setState] = useState<{ key: string; url: string | null; missing: boolean; pending: boolean }>(() => ({ key, url: urls.get(key) ?? null, missing: false, pending: false }))
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let held: string | null = null
    void loadKey(key).then(
      (url) => {
        if (cancelled) return
        if (url) {
          // The small version may have fallen back to the full picture: hold whichever address is really being shown.
          held = urls.get(key) === url ? key : id
          pictureCache.acquire(held)
        }
        setState(url ? { key, url, missing: false, pending: false } : { key, url: null, missing: true, pending: false })
      },
      () => {
        if (cancelled) return
        setState({ key, url: null, missing: false, pending: true })
        timer = setTimeout(() => setRetry((n) => n + 1), 8000)
      }
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
      if (held) pictureCache.release(held)
    }
  }, [key, id, enabled, retry])
  // Only addresses that are still valid are returned (one that was let go while off screen is simply made again). The full picture
  // stands in for its small version when it is already there.
  const live = urls.get(key) ?? urls.get(id) ?? null
  if (state.key !== key) return { url: live, missing: false, pending: false }
  return { url: live, missing: state.missing, pending: state.pending }
}

/**
 * Frees the cached addresses of pictures no topic uses any more (after a replace, a crop again, or a delete). If undo brings one
 * back, its address is simply made again when it is next shown.
 */
export function releaseUnusedUrls() {
  const used = new Set<string>()
  for (const t of Object.values(get().topics)) if (t.image) used.add(t.image.imageId)
  for (const key of [...urls.keys()]) if (!used.has(baseId(key)) && get().lightbox !== baseId(key)) releaseKey(key)
}

// ---- how many pictures this map holds, and how big ----
export interface PictureUsage {
  count: number
  bytes: number
}

/** The pictures the open map uses (each distinct one once) and their total stored size. */
export async function mapPictureUsage(): Promise<PictureUsage> {
  const ids = new Set<string>()
  for (const t of Object.values(get().topics)) if (t.image) ids.add(t.image.imageId)
  let bytes = 0
  for (const id of ids) bytes += (await imageStore.getMeta(id).catch(() => undefined))?.size ?? 0
  return { count: ids.size, bytes }
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
