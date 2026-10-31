// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { addChild } from '@/core/model/commands'
import { useSettings } from '@/stores/settings'
import { fakeCodec, source } from '../../test/fakeCodec'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import * as A from '../actions'
import { imageStore } from '../images'
import { enterReadMode } from '../readmode'
import { closeFile, mapDoc, openFile } from '../session'
import { useEditor } from '../store'
import { AddPictureMenu } from '../ui/AddPictureMenu'
import { CropOverlay } from '../ui/CropOverlay'
import { PictureChoiceDialog } from '../ui/PictureChoiceDialog'
import { addPictures, finishDraft, setPictureCodec, openAddPicture, originalFor, pictureIdsInMap, recentPictures, resolveTarget, reusePicture, startSource } from './flow'
import * as sources from './sources'

vi.mock('./sources', async (orig) => ({
  ...(await orig<typeof import('./sources')>()),
  chooseFiles: vi.fn(),
  readClipboardImage: vi.fn(),
  captureScreen: vi.fn(),
}))

let t = 1_700_000_000_000
let child = ''
const st = () => useEditor.getState()
const undoSteps = () => mapDoc.undo.undoStack.length
const KB = 1024
const touchOn = (on: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: on && /pointer: coarse|hover: none/.test(q), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }))
const { codec, log } = fakeCodec({ webp: true })
const photo = (kb: number, w = 3000, h = 2000, name = 'a.jpg') => Object.assign(source(w, h, 'photo', kb * KB, 'image/jpeg'), { name }) as File

beforeEach(async () => {
  installMemoryLocalStorage()
  touchOn(false)
  setPictureCodec(codec)
  useSettings.setState({ picturesPref: 'ask', touchControls: 'auto' })
  const repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'kb', name: 'Pics', content: buildStarterContent('kb') })
  await openFile(f.id, repo)
  child = addChild(mapDoc, st().rootId, 'Topic')
  await act(async () => void (await new Promise((r) => setTimeout(r, 30))))
  A.selectOnly(child)
  mapDoc.undo.stopCapturing()
  mapDoc.undo.clear()
  act(() => useEditor.setState({ pictureMenu: null, pictureDraft: null, pictureChoice: null, notice: null }))
  log.encoded.length = 0
  vi.mocked(sources.chooseFiles).mockReset()
  vi.mocked(sources.readClipboardImage).mockReset()
  vi.mocked(sources.captureScreen).mockReset()
})
afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  await closeFile()
})

const image = (id: string) => st().topics[id]?.image

describe('where a picture goes', () => {
  it('a selected topic gets it; with nothing selected it becomes a new child of the focused topic (or the centre)', () => {
    expect(resolveTarget()).toEqual({ kind: 'topic', id: child })
    A.clearSelection()
    expect(resolveTarget()).toEqual({ kind: 'child', parentId: st().rootId })
    act(() => useEditor.setState({ focusId: child }))
    expect(resolveTarget()).toEqual({ kind: 'child', parentId: child })
  })

  it('a small picture goes in silently, as ONE undo step, with the size the map shows it at', async () => {
    await addPictures([photo(40, 600, 400)], 'upload', { kind: 'topic', id: child }, { codec })
    const img = image(child)
    expect(img?.imageId).toMatch(/^p-[0-9a-f]{40}$/)
    expect(img?.width).toBeGreaterThanOrEqual(40)
    expect(img?.width).toBeLessThanOrEqual(1200)
    expect(undoSteps()).toBe(1)
    expect(st().pictureChoice).toBeNull() // too small to be worth a question
    expect(st().imageSelected).toBe(child)
    act(() => A.cmdUndo())
    expect(image(child)).toBeFalsy()
  })

  it('into a new child topic when asked, still one undo step', async () => {
    const before = Object.keys(st().topics).length
    await addPictures([photo(40, 600, 400, 'plan.jpg')], 'upload', { kind: 'child', parentId: child }, { codec })
    expect(Object.keys(st().topics)).toHaveLength(before + 1)
    const made = Object.values(st().topics).find((x) => x.parentId === child)
    expect(made?.image).toBeTruthy()
    expect(made?.text).toBe('plan')
    expect(undoSteps()).toBe(1)
  })

  it('"Replace" puts the new picture in place of the old one', async () => {
    await addPictures([photo(40, 600, 400)], 'upload', { kind: 'topic', id: child }, { codec })
    const first = image(child)?.imageId
    await addPictures([photo(60, 700, 500)], 'upload', { kind: 'replace', id: child }, { codec })
    expect(image(child)?.imageId).not.toBe(first)
    expect(undoSteps()).toBe(2)
  })

  it('several files: the first goes where asked, the others become children, all in one undo step', async () => {
    await addPictures([photo(30, 500, 400, 'one.jpg'), photo(31, 500, 410, 'two.jpg'), photo(32, 500, 420, 'three.jpg')], 'upload', { kind: 'topic', id: child }, { codec })
    expect(image(child)).toBeTruthy()
    expect(Object.values(st().topics).filter((x) => x.parentId === child && x.image)).toHaveLength(2)
    expect(undoSteps()).toBe(1)
  })

  it('the same picture added twice is stored once', async () => {
    const same = photo(40, 600, 400)
    const puts = vi.spyOn(imageStore, 'put')
    await addPictures([same], 'upload', { kind: 'topic', id: child }, { codec })
    A.cmdAddChild()
    const other = Object.values(st().topics).find((x) => x.parentId === child) as { id: string }
    await addPictures([same], 'upload', { kind: 'topic', id: other.id }, { codec })
    expect(image(child)?.imageId).toBe(image(other.id)?.imageId)
    expect(puts.mock.calls.length).toBeLessThanOrEqual(1) // stored at most once: the same bytes are the same picture
  })

  it('a default description for camera and screen pictures, none for plain uploads', async () => {
    await addPictures([photo(40, 600, 400)], 'upload', { kind: 'topic', id: child }, { codec })
    expect(image(child)?.alt).toBeUndefined()
    await addPictures([photo(41, 600, 400)], 'gallery', { kind: 'replace', id: child }, { codec, crop: false })
    expect(image(child)?.alt).toMatch(/^Photo /)
    await addPictures([photo(42, 600, 400)], 'capture', { kind: 'replace', id: child }, { codec, crop: false })
    expect(image(child)?.alt).toMatch(/^Screenshot /)
  })

  it('does nothing in Read mode', async () => {
    await act(async () => void (await enterReadMode()))
    openAddPicture()
    expect(st().pictureMenu).toBeNull()
    await addPictures([photo(40, 600, 400)], 'upload', { kind: 'topic', id: child }, { codec })
    expect(image(child)).toBeFalsy()
    expect(undoSteps()).toBe(0)
  })
})

describe('the choice between Compressed and Original', () => {
  it('big photo, "Ask each time": asks, and Compressed stores the small version', async () => {
    const run = addPictures([photo(5000)], 'upload', { kind: 'topic', id: child }, { codec })
    await waitFor(() => expect(st().pictureChoice).not.toBeNull())
    const req = st().pictureChoice
    expect(req?.items[0]?.original).toBeGreaterThan(req?.items[0]?.compressed ?? 0)
    act(() => req?.resolve({ choice: 'compressed', remember: false }))
    await run
    expect(Math.max(image(child)?.width ?? 0, 1)).toBeGreaterThan(0)
    const stored = await imageStore.getMeta(image(child)?.imageId as string)
    expect(Math.max(stored?.width ?? 0, stored?.height ?? 0)).toBe(1280)
    expect(stored?.size).toBeLessThan(500 * KB)
  })

  it('Original keeps the picture as it is', async () => {
    const run = addPictures([photo(5000)], 'upload', { kind: 'topic', id: child }, { codec })
    await waitFor(() => expect(st().pictureChoice).not.toBeNull())
    act(() => st().pictureChoice?.resolve({ choice: 'original', remember: false }))
    await run
    const stored = await imageStore.getMeta(image(child)?.imageId as string)
    expect(stored?.width).toBe(3000)
  })

  it('cancelling the question adds nothing', async () => {
    const run = addPictures([photo(5000)], 'upload', { kind: 'topic', id: child }, { codec })
    await waitFor(() => expect(st().pictureChoice).not.toBeNull())
    act(() => st().pictureChoice?.resolve(null))
    await run
    expect(image(child)).toBeFalsy()
    expect(undoSteps()).toBe(0)
  })

  it('"Don\'t ask again" is remembered, and the next big picture goes in without a question', async () => {
    const run = addPictures([photo(5000)], 'upload', { kind: 'topic', id: child }, { codec })
    await waitFor(() => expect(st().pictureChoice).not.toBeNull())
    act(() => st().pictureChoice?.resolve({ choice: 'compressed', remember: true }))
    await run
    expect(useSettings.getState().picturesPref).toBe('compress')
    expect(JSON.parse(localStorage.getItem('wishtaamaps:settings') ?? '{}').picturesPref).toBe('compress')
    await addPictures([photo(6000)], 'upload', { kind: 'replace', id: child }, { codec })
    expect(st().pictureChoice).toBeNull()
    const stored = await imageStore.getMeta(image(child)?.imageId as string)
    expect(Math.max(stored?.width ?? 0, stored?.height ?? 0)).toBe(1280)
  })

  it('can be reset in Preferences back to asking', async () => {
    useSettings.getState().setPicturesPref('original')
    useSettings.getState().setPicturesPref('ask')
    const run = addPictures([photo(5000)], 'upload', { kind: 'topic', id: child }, { codec })
    await waitFor(() => expect(st().pictureChoice).not.toBeNull())
    act(() => st().pictureChoice?.resolve(null))
    await run
  })

  it('"Always keep original": never asks, keeps it, but the hard limits still apply and are explained', async () => {
    useSettings.getState().setPicturesPref('original')
    await addPictures([photo(5000)], 'upload', { kind: 'topic', id: child }, { codec })
    expect(st().pictureChoice).toBeNull()
    expect((await imageStore.getMeta(image(child)?.imageId as string))?.width).toBe(3000)
    // over 4000 px: cannot be kept as it is
    await addPictures([photo(5000, 6000, 4000)], 'upload', { kind: 'replace', id: child }, { codec })
    expect(st().notice?.text).toMatch(/4000 px.*Compressed instead/)
    expect((await imageStore.getMeta(image(child)?.imageId as string))?.width).toBeLessThanOrEqual(1280)
  })

  it('"Always compress": never asks', async () => {
    useSettings.getState().setPicturesPref('compress')
    await addPictures([photo(5000)], 'upload', { kind: 'topic', id: child }, { codec })
    expect(st().pictureChoice).toBeNull()
    expect((await imageStore.getMeta(image(child)?.imageId as string))?.width).toBeLessThanOrEqual(1280)
  })

  it('several big files: ONE question with the totals', async () => {
    const run = addPictures([photo(4000, 3000, 2000, 'a.jpg'), photo(4000, 3000, 2000, 'b.jpg'), photo(4000, 3000, 2000, 'c.jpg')], 'upload', { kind: 'topic', id: child }, { codec })
    await waitFor(() => expect(st().pictureChoice).not.toBeNull())
    render(<PictureChoiceDialog />)
    expect(screen.getByTestId('choice-summary').textContent).toMatch(/3 pictures: 11\.7 MB to/)
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await run
    expect(Object.values(st().topics).filter((x) => x.image)).toHaveLength(3)
  })

  it('the dialog shows both sizes and the segmented choice, with Compressed pre-selected', async () => {
    const run = addPictures([photo(5000)], 'upload', { kind: 'topic', id: child }, { codec })
    await waitFor(() => expect(st().pictureChoice).not.toBeNull())
    render(<PictureChoiceDialog />)
    const group = screen.getByRole('radiogroup', { name: 'Picture size' })
    const compressed = within(group).getByRole('radio', { name: /Compressed \(readable\) - \d+ KB/ })
    expect(compressed.getAttribute('aria-checked')).toBe('true')
    expect(within(group).getByRole('radio', { name: /Original - 4\.9 MB/ })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: /Don't ask me again/ })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await run
  })
})

describe('the sources', () => {
  it('upload and gallery: choose files; upload goes straight in, gallery goes to the crop step', async () => {
    vi.mocked(sources.chooseFiles).mockResolvedValue([photo(40, 600, 400)])
    await startSource('upload', { kind: 'topic', id: child })
    await waitFor(() => expect(image(child) || st().pictureDraft).toBeTruthy())
    expect(sources.chooseFiles).toHaveBeenCalledWith({ multiple: true })
    act(() => useEditor.setState({ pictureDraft: null }))
    vi.mocked(sources.chooseFiles).mockResolvedValue([photo(40, 600, 400)])
    await startSource('gallery', { kind: 'topic', id: child })
    expect(st().pictureDraft?.source).toBe('gallery')
  })

  it('upload and crop opens the crop step', async () => {
    vi.mocked(sources.chooseFiles).mockResolvedValue([photo(40, 600, 400)])
    await startSource('upload', { kind: 'topic', id: child }, { crop: true })
    expect(st().pictureDraft?.source).toBe('upload')
  })

  it('camera opens the camera chooser, crops, and can retake', async () => {
    vi.mocked(sources.chooseFiles).mockResolvedValueOnce([photo(40)])
    await startSource('camera', { kind: 'topic', id: child })
    expect(sources.chooseFiles).toHaveBeenCalledWith({ camera: true })
    expect(st().pictureDraft?.source).toBe('camera')
    vi.mocked(sources.chooseFiles).mockResolvedValueOnce([photo(50, 800, 600)])
    const again = await st().pictureDraft?.retake?.()
    expect(again?.size).toBe(50 * KB)
  })

  it('a cancelled picker adds nothing', async () => {
    vi.mocked(sources.chooseFiles).mockResolvedValue([])
    await startSource('camera', { kind: 'topic', id: child })
    expect(st().pictureDraft).toBeNull()
    expect(undoSteps()).toBe(0)
  })

  it('paste from the clipboard: a picture opens the crop step; no picture or no permission gives a friendly message', async () => {
    vi.mocked(sources.readClipboardImage).mockResolvedValueOnce({ blob: photo(40) })
    await startSource('paste', { kind: 'topic', id: child })
    expect(st().pictureDraft?.source).toBe('paste')
    act(() => useEditor.setState({ pictureDraft: null }))
    vi.mocked(sources.readClipboardImage).mockResolvedValueOnce({ error: 'There is no picture on the clipboard. Copy a picture first, then try again.' })
    await startSource('paste', { kind: 'topic', id: child })
    expect(st().notice?.text).toMatch(/no picture on the clipboard/)
    expect(st().pictureDraft).toBeNull()
  })

  it('screen capture: says what will happen, takes one picture, and can retake', async () => {
    vi.spyOn(sources, 'canCaptureScreen').mockReturnValue(true)
    vi.mocked(sources.captureScreen).mockResolvedValueOnce(photo(300, 2560, 1440))
    await startSource('capture', { kind: 'topic', id: child })
    expect(st().pictureDraft?.source).toBe('capture')
    expect(sources.captureScreen).toHaveBeenCalledTimes(1)
    expect(st().pictureDraft?.retake).toBe(sources.captureScreen)
  })

  it('screen capture where it is not supported: a note, and nothing is started', async () => {
    vi.spyOn(sources, 'canCaptureScreen').mockReturnValue(false)
    await startSource('capture', { kind: 'topic', id: child })
    expect(st().notice?.text).toMatch(/Screen capture isn't supported/)
    expect(sources.captureScreen).not.toHaveBeenCalled()
  })
})

describe('screen capture itself', () => {
  async function run(opts: { endBefore?: boolean; refuse?: boolean } = {}) {
    const real = await vi.importActual<typeof import('./sources')>('./sources')
    const stops = { n: 0 }
    const track = { stop: () => void stops.n++, getSettings: () => ({ width: 2560, height: 1440 }), onended: null as null | (() => void) }
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] }
    const getDisplayMedia = vi.fn(async () => {
      if (opts.refuse) throw new DOMException('no', 'NotAllowedError')
      return stream
    })
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getDisplayMedia } })
    const video: Record<string, unknown> = { videoWidth: 2560, videoHeight: 1440, play: async () => undefined, pause: () => undefined, muted: false, playsInline: false }
    Object.defineProperty(video, 'srcObject', { set: () => queueMicrotask(() => (opts.endBefore ? track.onended?.() : (video.onloadedmetadata as () => void)?.())), get: () => null })
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: vi.fn() }), toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['x'], { type: 'image/png' })) }
    const create = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => (tag === 'video' ? video : tag === 'canvas' ? canvas : create(tag))) as never)
    const blob = await real.captureScreen()
    return { blob, stops: stops.n, getDisplayMedia, canvas }
  }

  it('draws ONE frame at the real size of what was shared, and stops every track at once', async () => {
    const r = await run()
    expect(r.getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: false })
    expect(r.blob?.type).toBe('image/png')
    expect(r.canvas.width).toBe(2560)
    expect(r.canvas.height).toBe(1440)
    expect(r.stops).toBe(1)
  })

  it('stops the tracks when the person cancels the browser\'s picker, and when the share ends mid-capture', async () => {
    const refused = await run({ refuse: true })
    expect(refused.blob).toBeNull()
    cleanup()
    vi.restoreAllMocks()
    const ended = await run({ endBefore: true })
    expect(ended.blob).toBeNull()
    expect(ended.stops).toBe(1)
  })
})

describe('what this browser can do is found by asking it', () => {
  it('feature detection, not user-agent guessing', () => {
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: undefined, clipboard: undefined, userAgent: 'iPad iPhone Android' })
    expect(sources.canCaptureScreen()).toBe(false)
    expect(sources.canReadClipboardImage()).toBe(false)
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getDisplayMedia: () => undefined }, clipboard: { read: () => undefined }, userAgent: 'x' })
    expect(sources.canCaptureScreen()).toBe(true)
    expect(sources.canReadClipboardImage()).toBe(true)
  })

  it('a clipboard without a picture, or refused, gives a clear message', async () => {
    const real = await vi.importActual<typeof import('./sources')>('./sources')
    vi.stubGlobal('navigator', { ...navigator, clipboard: { read: async () => [{ types: ['text/plain'], getType: async () => new Blob() }] } })
    expect(await real.readClipboardImage()).toEqual({ error: expect.stringMatching(/no picture on the clipboard/) })
    vi.stubGlobal('navigator', { ...navigator, clipboard: { read: async () => Promise.reject(new DOMException('x', 'NotAllowedError')) } })
    expect(await real.readClipboardImage()).toEqual({ error: expect.stringMatching(/did not allow/) })
    vi.stubGlobal('navigator', { ...navigator, clipboard: { read: async () => [{ types: ['image/png'], getType: async () => new Blob(['p'], { type: 'image/png' }) }] } })
    expect('blob' in (await real.readClipboardImage())).toBe(true)
  })
})

describe('the Add picture menu', () => {
  it('lists the sources, hides itself in Read mode, and shows what is being used', async () => {
    vi.spyOn(sources, 'canCaptureScreen').mockReturnValue(true)
    act(() => openAddPicture({ kind: 'topic', id: child }))
    render(<AddPictureMenu />)
    const menu = screen.getByRole('menu')
    for (const n of [/Upload file/, /Upload and crop/, /Choose from gallery/, /Capture screen/]) expect(within(menu).getByRole('menuitem', { name: n })).toBeTruthy()
    expect(screen.getByText(/Using: ask each time/)).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: /Pictures:/ }), { target: { value: 'compress' } })
    expect(screen.getByText(/Using: always compress/)).toBeTruthy()
    cleanup()
    await act(async () => void (await enterReadMode()))
    render(<AddPictureMenu />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('"Capture screen" is shown as unavailable with the reason where the browser cannot do it', () => {
    vi.spyOn(sources, 'canCaptureScreen').mockReturnValue(false)
    act(() => openAddPicture({ kind: 'topic', id: child }))
    render(<AddPictureMenu />)
    const item = screen.getByRole('menuitem', { name: /Capture screen/ }) as HTMLButtonElement
    expect(item.disabled).toBe(true)
    expect(item.textContent).toMatch(/isn't supported/)
  })

  it('"Replace" has its own title, and Esc closes it', () => {
    act(() => openAddPicture({ kind: 'replace', id: child }))
    render(<AddPictureMenu />)
    expect(screen.getByRole('dialog', { name: 'Replace picture' })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(st().pictureMenu).toBeNull()
  })

  it('on a touch screen it is a bottom sheet with big targets, even in a wide window ("Desktop site")', () => {
    touchOn(true)
    vi.stubGlobal('innerWidth', 1366)
    act(() => openAddPicture({ kind: 'topic', id: child }))
    render(<AddPictureMenu />)
    expect(screen.getByRole('dialog').className).toMatch(/bottom-0/)
    for (const item of screen.getAllByRole('menuitem')) expect(item.className).toMatch(/min-h-11/)
    expect(screen.getAllByRole('menuitem', { name: /Choose from Photos/ }).length).toBeGreaterThan(0)
  })

  it('on a mouse desktop it is a popover with normal targets; the preference can force touch on or off', () => {
    act(() => openAddPicture({ kind: 'topic', id: child }))
    const { unmount } = render(<AddPictureMenu />)
    expect(screen.getByRole('dialog').className).not.toMatch(/bottom-0 rounded-t/)
    unmount()
    useSettings.getState().setTouchControls('on')
    render(<AddPictureMenu />)
    expect(screen.getByRole('dialog').className).toMatch(/bottom-0/)
    cleanup()
    touchOn(true)
    useSettings.getState().setTouchControls('off')
    render(<AddPictureMenu />)
    expect(screen.getByRole('dialog').className).not.toMatch(/rounded-t-ui pb-/)
  })

  it('Insert from my pictures: reuses a stored picture as a new reference, with nothing new stored', async () => {
    await addPictures([photo(40, 600, 400)], 'upload', { kind: 'topic', id: child }, { codec })
    const id = image(child)?.imageId as string
    expect(pictureIdsInMap()).toEqual([id])
    expect(recentPictures()[0]).toBe(id)
    act(() => A.cmdAddChild())
    const other = st().selected[0] as string
    const puts = vi.spyOn(imageStore, 'put')
    act(() => openAddPicture({ kind: 'topic', id: other }))
    render(<AddPictureMenu />)
    expect(screen.getByRole('region', { name: 'Insert from my pictures' })).toBeTruthy()
    mapDoc.undo.stopCapturing()
    mapDoc.undo.clear()
    await reusePicture(id, { kind: 'topic', id: other })
    expect(image(other)?.imageId).toBe(id)
    expect(puts).not.toHaveBeenCalled()
    expect(undoSteps()).toBe(1)
  })
})

describe('the crop step', () => {
  const draft = (blob: Blob, retake?: () => Promise<Blob | null>) => act(() => useEditor.setState({ pictureDraft: { blob, source: 'gallery', target: { kind: 'topic', id: child }, retake } }))
  const sizeText = () => screen.getByTestId('crop-size').textContent ?? ''

  it('shows the whole picture first, with its size and a live estimate', async () => {
    draft(source(2000, 1000, 'photo', 800 * KB, 'image/jpeg'))
    render(<CropOverlay codec={codec} />)
    await waitFor(() => expect(sizeText()).toMatch(/2000 × 1000 px/))
    await waitFor(() => expect(sizeText()).toMatch(/about \d+ KB/))
    expect(screen.getByRole('dialog', { name: 'Crop picture' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Rotate/ })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Full image' })).toBeTruthy()
  })

  it('has handles on all four corners and sides, large when touch is on', async () => {
    touchOn(true)
    draft(source(2000, 1000, 'photo', 800 * KB, 'image/jpeg'))
    const { container } = render(<CropOverlay codec={codec} />)
    await waitFor(() => expect(container.querySelectorAll('[data-handle]')).toHaveLength(8))
    expect((container.querySelector('[data-handle=nw]') as HTMLElement).style.width).toBe('28px')
  })

  it('arrow keys nudge the rectangle; Esc cancels without adding anything', async () => {
    draft(source(2000, 1000, 'photo', 800 * KB, 'image/jpeg'))
    render(<CropOverlay codec={codec} />)
    await waitFor(() => expect(sizeText()).toMatch(/2000 × 1000/))
    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'ArrowLeft', altKey: true, shiftKey: true }) // resize from the corner
    await waitFor(() => expect(sizeText()).toMatch(/1990 × 1000/))
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(st().pictureDraft).toBeNull()
    expect(image(child)).toBeFalsy()
  })

  it('rotating turns the picture; Full image puts the whole rectangle back', async () => {
    draft(source(2000, 1000, 'photo', 800 * KB, 'image/jpeg'))
    render(<CropOverlay codec={codec} />)
    await waitFor(() => expect(sizeText()).toMatch(/2000 × 1000/))
    fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }))
    await waitFor(() => expect(sizeText()).toMatch(/1000 × 2000/))
    fireEvent.click(screen.getByRole('button', { name: 'Rotate left' }))
    await waitFor(() => expect(sizeText()).toMatch(/2000 × 1000/))
    fireEvent.click(screen.getByRole('button', { name: 'Full image' }))
    expect(sizeText()).toMatch(/2000 × 1000/)
  })

  it('"Use selection" stores the picture, adds it as one undo step, and keeps the original for Crop again (this session)', async () => {
    useSettings.getState().setPicturesPref('compress')
    const src = source(2000, 1000, 'photo', 800 * KB, 'image/jpeg')
    draft(src)
    render(<CropOverlay codec={codec} />)
    await waitFor(() => expect((screen.getByRole('button', { name: 'Use selection' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Use selection' }))
    await waitFor(() => expect(image(child)).toBeTruthy())
    expect(st().pictureDraft).toBeNull()
    expect(undoSteps()).toBe(1)
    expect(originalFor(image(child)?.imageId as string)).toBe(src)
  })

  it('the size choice appears only when compressing would save a good amount, with live sizes and "don\'t ask again"', async () => {
    draft(source(3000, 2000, 'photo', 5000 * KB, 'image/jpeg'))
    render(<CropOverlay codec={codec} />)
    const group = await screen.findByRole('radiogroup', { name: 'Picture size' })
    expect(within(group).getByRole('radio', { name: /Compressed \(readable\) - \d+ KB/ }).getAttribute('aria-checked')).toBe('true')
    expect(within(group).getByRole('radio', { name: /Original - 4\.9 MB/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: /Don't ask me again/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Use selection' }))
    await waitFor(() => expect(image(child)).toBeTruthy())
    expect(useSettings.getState().picturesPref).toBe('compress')
  })

  it('no question for a small picture: it is kept as it is', async () => {
    draft(source(500, 400, 'photo', 20 * KB, 'image/jpeg'))
    render(<CropOverlay codec={codec} />)
    await waitFor(() => expect(sizeText()).toMatch(/about/))
    expect(screen.queryByRole('radiogroup', { name: 'Picture size' })).toBeNull()
  })

  it('Retake brings a new picture', async () => {
    const next = source(800, 600, 'photo', 200 * KB, 'image/jpeg')
    draft(source(2000, 1000, 'photo', 800 * KB, 'image/jpeg'), async () => next)
    render(<CropOverlay codec={codec} />)
    await waitFor(() => expect(sizeText()).toMatch(/2000 × 1000/))
    fireEvent.click(screen.getByRole('button', { name: 'Retake' }))
    await waitFor(() => expect(sizeText()).toMatch(/800 × 600/))
  })

  it('a picture that cannot be read says so, with the HEIC hint', async () => {
    const bad = fakeCodec({ failDecode: true })
    draft(source(10, 10, 'photo', 100))
    render(<CropOverlay codec={bad.codec} />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/Most compatible/)
  })

  it('finishDraft always clears the draft', async () => {
    await finishDraft({ blob: new Blob(['x'], { type: 'image/webp' }), width: 100, height: 80, type: 'image/webp' }, 'gallery', { kind: 'topic', id: child }, new Blob(['o']))
    expect(st().pictureDraft).toBeNull()
    expect(image(child)).toBeTruthy()
  })
})
