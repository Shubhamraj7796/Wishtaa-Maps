import { isTouchFriendly } from './touch'

/** What this browser can do, found by asking it, never by guessing from the user agent. */
export const canCaptureScreen = (): boolean => typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function'
export const canReadClipboardImage = (): boolean => typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function'
/** A camera is worth offering on touch devices, and anywhere the browser can reach one. */
export const canTakePhoto = (): boolean => isTouchFriendly() || (typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function')

export const CAPTURE_NOTICE = 'Choose what to share; only one image will be taken.'
export const CAPTURE_UNSUPPORTED = "Screen capture isn't supported in this browser; use Take photo or Choose from Photos."

/** Opens the file chooser (or, with `capture`, the camera app). Resolves with the chosen files, or none if cancelled. */
export function chooseFiles(opts: { camera?: boolean; multiple?: boolean } = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    if (opts.camera) input.setAttribute('capture', 'environment')
    if (opts.multiple && !opts.camera) input.multiple = true
    input.onchange = () => resolve([...(input.files ?? [])])
    input.oncancel = () => resolve([])
    input.click()
  })
}

export type ClipboardResult = { blob: Blob } | { error: string }

/** Reads an image from the clipboard (a button press is the permission gesture), with friendly messages. */
export async function readClipboardImage(): Promise<ClipboardResult> {
  if (!canReadClipboardImage()) return { error: 'This browser cannot read the clipboard from a button. Select the topic and press Ctrl+V (or Cmd+V) instead.' }
  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith('image/'))
      if (type) return { blob: await item.getType(type) }
    }
    return { error: 'There is no picture on the clipboard. Copy a picture first, then try again.' }
  } catch (e) {
    const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
    return { error: denied ? 'The browser did not allow reading the clipboard. Allow it in the address bar, or select the topic and press Ctrl+V.' : 'Could not read the clipboard.' }
  }
}

/**
 * Takes ONE picture of what the person chooses to share. The browser's own picker asks what; nothing is recorded: one frame is
 * drawn to a canvas at the real size of the shared surface, and every track is stopped straight away, whatever happens.
 */
export async function captureScreen(): Promise<Blob | null> {
  if (!canCaptureScreen()) return null
  let stream: MediaStream | null = null
  let video: HTMLVideoElement | null = null
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
    const track = stream.getVideoTracks()[0]
    if (!track) return null
    video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = stream
    await new Promise<void>((resolve, reject) => {
      const v = video as HTMLVideoElement
      v.onloadedmetadata = () => resolve()
      v.onerror = () => reject(new Error('video'))
      track.onended = () => reject(new Error('The share ended before a picture could be taken.'))
    })
    await video.play()
    // One real frame, after the browser has started drawing.
    await new Promise<void>((resolve) => {
      const v = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => void }
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => resolve())
      else setTimeout(resolve, 150)
    })
    const settings = track.getSettings()
    const w = video.videoWidth || settings.width || 0
    const h = video.videoHeight || settings.height || 0
    if (!w || !h) return null
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')?.drawImage(video, 0, 0, w, h)
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  } catch {
    return null // cancelled, refused, or the share ended
  } finally {
    stream?.getTracks().forEach((t) => t.stop())
    if (video) {
      video.pause()
      video.srcObject = null
    }
  }
}
