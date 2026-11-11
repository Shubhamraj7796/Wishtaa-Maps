// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { addChild, setImage } from '@/core/model/commands'
import type { PdfHandle } from '@/core/pdf/engine'
import type { PdfSource } from '@/core/pdf/types'
import { useSettings } from '@/stores/settings'
import { fakeCodec, source as pictureSource } from '../../test/fakeCodec'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import * as A from '../actions'
import { imageStore } from '../images'
import { enterEditMode, enterReadMode } from '../readmode'
import { setPictureCodec } from '../pictures/flow'
import { closeFile, mapDoc, openFile } from '../session'
import { closedPdfPanel, useEditor } from '../store'
import { setPdfTool } from './actions'
import { beginPickTarget, captureArea, setCaptureKeep, setCaptureMode, setCaptureOption } from './capture'
import { loadCaptureOptions } from '../store'
import { CaptureBar } from './CaptureBar'

// Drawing the page needs a real canvas; here a rectangle just becomes a "picture" of the size the test chooses.
const shot = vi.hoisted(() => ({ make: null as null | (() => Blob) }))
vi.mock('./render', () => ({ renderRegion: async () => shot.make?.() ?? null, renderPage: () => ({ cancel: () => undefined, done: Promise.resolve(false) }), releaseCanvas: () => undefined }))

let t = 1_700_000_000_000
const st = () => useEditor.getState()
const cap = () => st().pdfPanel.capture
const { codec } = fakeCodec({ webp: true })
const src: PdfSource = { id: 'pdf1', name: 'Audit may 24.pdf', size: 10, hash: 'h1', pages: 20, addedAt: 1 }
const src2: PdfSource = { id: 'pdf2', name: 'Tax.pdf', size: 10, hash: 'h2', pages: 20, addedAt: 2 }
const handle = {} as PdfHandle
const rect = { x: 0.1, y: 0.2, w: 0.5, h: 0.3 }
let seed = 0
/** A new, different picture each time (a different size) unless told to repeat one. */
const nextShot = () => {
  seed++
  return pictureSource(900 + seed * 10, 600 + seed * 5, 'photo', 40 * 1024, 'image/png')
}
let chapter = ''
let other = ''

beforeEach(async () => {
  installMemoryLocalStorage()
  setPictureCodec(codec)
  seed = 0
  shot.make = nextShot
  useSettings.setState({ picturesPref: 'compress', capturedPictureWidth: 320 })
  const repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'map', name: 'Capture', content: buildStarterContent('blank') })
  await openFile(f.id, repo)
  act(() => (mapDoc.pdfSources.set(src.id, src), mapDoc.pdfSources.set(src2.id, src2)))
  chapter = addChild(mapDoc, st().rootId, 'Chapter 5')
  other = addChild(mapDoc, st().rootId, 'Chapter 6')
  await act(async () => void (await new Promise((r) => setTimeout(r, 30))))
  A.clearSelection()
  mapDoc.undo.clear()
  act(() => useEditor.setState({ pdfPanel: { ...closedPdfPanel(), open: true, sourceId: src.id, tabs: [src.id, src2.id] }, notice: null, pictureChoice: null }))
})
afterEach(async () => {
  cleanup()
  await closeFile()
})

const kids = (id: string) => Object.values(st().topics).filter((x) => x.parentId === id).sort((a, b) => a.order - b.order)
const start = (selected?: string) => {
  if (selected) A.selectOnly(selected)
  act(() => setPdfTool('capture'))
}
const take = async (s = src, page = 12) => {
  await act(async () => void (await captureArea(s, handle, page, rect)))
}

describe('a capture always adds a NEW topic', () => {
  it('never changes the picture of a topic that already has one, even when that topic is selected', async () => {
    const original = { imageId: 'existing-picture', width: 200, height: 100 }
    setImage(mapDoc, chapter, original)
    start(chapter) // the topic WITH a picture is selected when capture starts
    await take()
    expect(st().topics[chapter]?.image).toEqual(original) // untouched
    const made = kids(chapter)
    expect(made).toHaveLength(1)
    expect(made[0]?.image?.imageId).not.toBe('existing-picture')
    // Keep capturing with that topic's own new child selected: the next capture still does not replace the previous one.
    act(() => (setCaptureKeep(true), setPdfTool('capture')))
    A.selectOnly(made[0]!.id)
    await take()
    expect(kids(chapter)).toHaveLength(2)
    expect(st().topics[made[0]!.id]?.image?.imageId).toBe(made[0]?.image?.imageId)
  })

  it('stores the picture once however many captures use it, and links each topic to the PDF, page and rectangle', async () => {
    const same = pictureSource(900, 600, 'photo', 40 * 1024, 'image/png')
    shot.make = () => same
    start(chapter)
    act(() => setCaptureKeep(true))
    await take(src, 3)
    await take(src2, 8)
    const [a, b] = kids(chapter) as [ReturnType<typeof kids>[number], ReturnType<typeof kids>[number]]
    expect(a.image?.imageId).toBe(b.image?.imageId) // the same bytes are the same picture
    expect(await imageStore.getMeta(a.image?.imageId as string)).toBeTruthy()
    expect(a.source).toEqual({ sourceId: 'pdf1', page: 3, rect })
    expect(b.source).toEqual({ sourceId: 'pdf2', page: 8, rect }) // a capture from a second PDF tab links to that PDF
  })
})

describe('the pinned target', () => {
  it('is the topic selected when capture starts, and stays when the selection changes elsewhere', async () => {
    start(chapter)
    expect(cap().targetId).toBe(chapter)
    A.selectOnly(other) // clicking another topic in the map
    expect(cap().targetId).toBe(chapter)
    await take()
    expect(kids(chapter)).toHaveLength(1)
    expect(kids(other)).toHaveLength(0)
  })

  it('with nothing selected it is the last target used for this PDF, else the central topic', async () => {
    start()
    expect(cap().targetId).toBe(st().rootId)
    act(() => (setPdfTool('select'), void 0))
    start(chapter)
    await take() // remembers chapter for this PDF
    A.clearSelection()
    act(() => setPdfTool('capture'))
    expect(cap().targetId).toBe(chapter)
    act(() => useEditor.setState({ pdfPanel: { ...st().pdfPanel, sourceId: src2.id, tool: 'select' } }))
    act(() => setPdfTool('capture'))
    expect(cap().targetId).toBe(st().rootId) // another PDF has no last target yet
  })

  it('changes only on purpose: Change, then a topic', async () => {
    start(chapter)
    render(<CaptureBar />) // the bar listens for the chosen topic while "Change" is waiting
    act(() => beginPickTarget())
    expect(cap().picking).toBe(true)
    expect(st().selected).toEqual([])
    act(() => A.selectOnly(other))
    expect(cap().targetId).toBe(other)
    expect(cap().picking).toBe(false)
    await take()
    expect(kids(other)).toHaveLength(1)
  })

  it('a deleted target falls back to the central topic instead of failing', async () => {
    start(chapter)
    act(() => void mapDoc.topics.delete(chapter))
    await take()
    expect(kids(st().rootId).filter((x) => x.image)).toHaveLength(1)
  })
})

describe('Add as', () => {
  it('Sub-topic (the default): new topics go after the existing ones, in capture order', async () => {
    const first = addChild(mapDoc, chapter, 'Existing')
    start(chapter)
    expect(cap().mode).toBe('sub')
    act(() => setCaptureKeep(true))
    await take(src, 1)
    await take(src, 2)
    await take(src, 3)
    const list = kids(chapter)
    expect(list.map((x) => x.source?.page ?? 0)).toEqual([0, 1, 2, 3])
    expect(list[0]?.id).toBe(first)
  })

  it('Next sibling: right after the target, and captures in a row keep their order', async () => {
    start(chapter)
    act(() => (setCaptureMode('sibling'), setCaptureKeep(true)))
    await take(src, 1)
    await take(src, 2)
    const roots = kids(st().rootId)
    expect(roots.map((x) => x.id === chapter || x.id === other || (x.source?.page ?? 0))).toEqual([true, 1, 2, true]) // Chapter 5, capture 1, capture 2, Chapter 6
  })

  it('Next sibling on the central topic (which has no siblings) goes under it instead', async () => {
    start() // the central topic is the target
    act(() => setCaptureMode('sibling'))
    await take()
    expect(kids(st().rootId).some((x) => x.image)).toBe(true)
  })

  it('New branch: a new topic under the central topic, whatever the target', async () => {
    start(chapter)
    act(() => setCaptureMode('branch'))
    await take()
    expect(kids(chapter)).toHaveLength(0)
    expect(kids(st().rootId).filter((x) => x.image)).toHaveLength(1)
  })
})

describe('Keep capturing, undo and the confirmation', () => {
  it('one capture is one undo step, and the confirmation says where it went, with an Undo that removes exactly that topic', async () => {
    start(chapter)
    const before = mapDoc.undo.undoStack.length
    await take(src, 12)
    expect(mapDoc.undo.undoStack.length).toBe(before + 1)
    expect(st().notice?.text).toBe('Added topic 1 under "Chapter 5", page 12')
    expect(st().notice?.action?.label).toBe('Undo')
    act(() => st().notice?.action?.run())
    expect(kids(chapter)).toHaveLength(0)
    expect(mapDoc.undo.undoStack.length).toBe(before)
  })

  it('Undo from the confirmation refuses once other edits were made after the capture', async () => {
    start(chapter)
    await take()
    const action = st().notice?.action
    addChild(mapDoc, other, 'Something else')
    act(() => action?.run())
    expect(kids(chapter)).toHaveLength(1) // not undone
    expect(st().notice?.text).toMatch(/Other changes were made/)
  })

  it('without Keep capturing the tool returns to Select; with it, it stays on for the next capture, counting them', async () => {
    start(chapter)
    await take()
    expect(st().pdfPanel.tool).toBe('select')
    start(chapter)
    act(() => setCaptureKeep(true))
    await take(src, 1)
    expect(st().pdfPanel.tool).toBe('capture')
    await take(src, 2)
    expect(st().notice?.text).toBe('Added topic 2 under "Chapter 5", page 2')
  })

  it('Escape ends capture (after cancelling "Change" first), from the capture bar', async () => {
    start(chapter)
    act(() => setCaptureKeep(true))
    render(<CaptureBar />)
    expect(screen.getByText('Chapter 5')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByRole('status').textContent).toMatch(/Choose a topic/)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(cap().picking).toBe(false)
    expect(st().pdfPanel.tool).toBe('capture') // the first Escape only cancelled Change
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(st().pdfPanel.tool).toBe('select')
  })

  it('the bar shows Into, the three Add as icons and Keep capturing', () => {
    start(chapter)
    render(<CaptureBar />)
    expect(screen.getByRole('radiogroup', { name: 'Add as' })).toBeTruthy()
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual(['Sub-topic', 'Next sibling', 'New branch']) // icons: the names are the labels
    expect(screen.getAllByRole('radio').every((r) => r.textContent === '')).toBe(true)
    expect((screen.getByRole('radio', { name: 'Sub-topic' }) as HTMLElement).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('radio', { name: 'New branch' }))
    expect(cap().mode).toBe('branch')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Keep capturing' }))
    expect(cap().keep).toBe(true)
  })
})

describe('size, the Compressed or Original question, and Read mode', () => {
  it('every captured picture gets the tidy width with its shape kept, and the width can be set in Preferences', async () => {
    shot.make = () => pictureSource(1800, 900, 'photo', 40 * 1024, 'image/png')
    start(chapter)
    await take()
    const a = kids(chapter)[0]?.image
    expect(a?.width).toBe(320)
    expect(a?.height).toBe(160) // 2:1 kept
    useSettings.getState().setCapturedPictureWidth(500)
    start(chapter)
    await take()
    expect(kids(chapter)[1]?.image?.width).toBe(500)
    expect(useSettings.getState().capturedPictureWidth).toBe(500)
    useSettings.getState().setCapturedPictureWidth(5) // out of range: kept sensible
    expect(useSettings.getState().capturedPictureWidth).toBe(120)
  })

  it('a small picture is never enlarged', async () => {
    shot.make = () => pictureSource(200, 100, 'photo', 40 * 1024, 'image/png')
    start(chapter)
    await take()
    expect(kids(chapter)[0]?.image?.width).toBe(200)
  })

  it('"Ask each time" asks once per capture session and uses the answer for the rest', async () => {
    useSettings.setState({ picturesPref: 'ask' })
    shot.make = () => pictureSource(3000 + seed++, 2000, 'photo', 5000 * 1024, 'image/jpeg')
    start(chapter)
    act(() => setCaptureKeep(true))
    const first = take(src, 1)
    await waitFor(() => expect(st().pictureChoice).not.toBeNull())
    act(() => st().pictureChoice?.resolve({ choice: 'compressed', remember: false }))
    await first
    await take(src, 2) // no second question
    expect(st().pictureChoice).toBeNull()
    expect(kids(chapter)).toHaveLength(2)
    // A new capture session asks again.
    act(() => setPdfTool('select'))
    start(chapter)
    const again = take(src, 3)
    await waitFor(() => expect(st().pictureChoice).not.toBeNull())
    act(() => st().pictureChoice?.resolve(null)) // cancelled: nothing added
    await again
    expect(kids(chapter)).toHaveLength(2)
  })

  it('Read mode: a capture writes nothing', async () => {
    start(chapter)
    await act(async () => void (await enterReadMode('user')))
    const before = JSON.stringify(st().topics)
    await take()
    expect(JSON.stringify(st().topics)).toBe(before)
    expect(mapDoc.undo.undoStack.length).toBe(0)
    act(() => void enterEditMode()) // leave nothing behind for the next test
  })
})

describe('optional titles (both off by default)', () => {
  // A page with text: two lines inside the rectangle (x 0.1..0.6, y 0.2..0.5 of 595 x 842) and one far outside.
  const withText = (lines: { text: string; x: number; y: number; w: number; h: number }[]) => ({ text: async () => ({ page: 12, w: 595, h: 842, lines }) }) as unknown as PdfHandle
  const inside = [
    { text: 'Depreciation is allocated', x: 70, y: 180, w: 220, h: 12 },
    { text: 'over the useful life.', x: 70, y: 196, w: 150, h: 12 },
    { text: 'Far away text', x: 70, y: 700, w: 100, h: 12 },
  ]
  const takeWith = async (h: PdfHandle) => void (await act(async () => void (await captureArea(src, h, 12, rect))))

  it('off by default: the new topic has no title', async () => {
    expect(cap().nameFromPage).toBe(false)
    expect(cap().textAsTitle).toBe(false)
    start(chapter)
    await takeWith(withText(inside))
    expect(kids(chapter)[0]?.text).toBe('')
  })

  it('"Name the topic from the page": the PDF name without .pdf and the page', async () => {
    start(chapter)
    act(() => setCaptureOption('nameFromPage', true))
    await takeWith(withText(inside))
    expect(kids(chapter)[0]?.text).toBe('Audit may 24, p. 12')
  })

  it('"Add the text inside the rectangle as the title": only what is inside the capture area', async () => {
    start(chapter)
    act(() => setCaptureOption('textAsTitle', true))
    await takeWith(withText(inside))
    expect(kids(chapter)[0]?.text).toBe('Depreciation is allocated over the useful life.')
  })

  it('a scanned PDF (no text) or a text layer that fails: no title, or the page name when that is on', async () => {
    start(chapter)
    act(() => (setCaptureOption('textAsTitle', true), setCaptureKeep(true)))
    await takeWith(withText([]))
    await takeWith({ text: async () => Promise.reject(new Error('no text layer')) } as unknown as PdfHandle)
    expect(kids(chapter).map((x) => x.text)).toEqual(['', ''])
    act(() => setCaptureOption('nameFromPage', true))
    await takeWith(withText([]))
    expect(kids(chapter)[2]?.text).toBe('Audit may 24, p. 12')
  })

  it('with both on, the text wins when there is some', async () => {
    start(chapter)
    act(() => (setCaptureOption('textAsTitle', true), setCaptureOption('nameFromPage', true)))
    await takeWith(withText(inside))
    expect(kids(chapter)[0]?.text).toBe('Depreciation is allocated over the useful life.')
  })

  it('titles apply to every Add as mode, and the topic still has its picture and link', async () => {
    start(chapter)
    act(() => (setCaptureOption('nameFromPage', true), setCaptureMode('branch')))
    await takeWith(withText(inside))
    const made = kids(st().rootId).find((x) => x.text === 'Audit may 24, p. 12')
    expect(made?.image).toBeTruthy()
    expect(made?.source).toMatchObject({ sourceId: 'pdf1', page: 12 })
  })

  it('the choices are remembered on this device and used by the next capture session', () => {
    act(() => setCaptureOption('nameFromPage', true))
    expect(loadCaptureOptions()).toEqual({ nameFromPage: true, textAsTitle: false })
    act(() => setPdfTool('select'))
    act(() => setPdfTool('capture'))
    expect(cap().nameFromPage).toBe(true)
    act(() => setCaptureOption('nameFromPage', false))
    expect(loadCaptureOptions()).toEqual({ nameFromPage: false, textAsTitle: false })
  })

  it('the capture bar menu has both options, and Escape closes the menu before it ends capture', async () => {
    start(chapter)
    render(<CaptureBar />)
    fireEvent.click(await screen.findByRole('button', { name: 'More capture options' }))
    const menu = document.querySelector('[data-capture-menu]') as HTMLElement
    expect(menu).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: /Name the topic from the page/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /text inside the rectangle/ }))
    expect([cap().nameFromPage, cap().textAsTitle]).toEqual([true, true])
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.querySelector('[data-capture-menu]')).toBeNull()
    expect(st().pdfPanel.tool).toBe('capture') // only the menu closed
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(st().pdfPanel.tool).toBe('select')
  })
})
