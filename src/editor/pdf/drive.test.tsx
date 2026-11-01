// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { PDFDocument } from 'pdf-lib'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { act, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import type { PdfjsLike } from '@/core/pdf/engine'
import { ENCRYPTED_PDF_BASE64 } from '@/core/pdf/encrypted.fixture'
import { MemoryPdfStore } from '@/core/pdf/store'
import { makePdf } from '@/core/pdf/testkit'
import { driveAuth, driveClient, driveConfig } from '@/app/drive'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { closeFile, openFile } from '../session'
import { useEditor } from '../store'
import { addPdfFile, addPdfFiles, openPdfFromDrive } from './actions'
import { answerPassword } from './password'
import { accessPdf, setPdfStore, usePdfjs } from './runtime'

const mocks = vi.hoisted(() => ({ pick: vi.fn(), download: vi.fn() }))
vi.mock('@/core/drive/picker', () => ({ pickPdfFiles: (...a: unknown[]) => mocks.pick(...a) }))

let t = 1_700_000_000_000
const st = () => useEditor.getState()
const notices: string[] = []
const encrypted = () => Uint8Array.from(Buffer.from(ENCRYPTED_PDF_BASE64, 'base64'))
const text = (s: string) => new TextEncoder().encode(s)
const sources = () => Object.values(st().pdf.sources)
const file = (bytes: Uint8Array, name: string, type = '') => new File([bytes as BlobPart], name, { type })
let unsub = () => undefined as void

beforeEach(async () => {
  installMemoryLocalStorage()
  usePdfjs(pdfjs as unknown as PdfjsLike)
  setPdfStore(new MemoryPdfStore())
  notices.length = 0
  unsub = useEditor.subscribe((s, prev) => {
    if (s.notice && s.notice !== prev.notice) notices.push(s.notice.text)
  })
  vi.spyOn(driveAuth, 'ready').mockReturnValue(true)
  vi.spyOn(driveAuth, 'getToken').mockResolvedValue('tok')
  vi.spyOn(driveClient, 'downloadBytes').mockImplementation((id: string) => mocks.download(id))
  Object.assign(driveConfig, { apiKey: 'k', clientId: '1-a' })
  mocks.pick.mockReset()
  mocks.download.mockReset()
  const repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'map', name: 'Pdf', content: buildStarterContent('blank') })
  await openFile(f.id, repo)
})
afterEach(async () => {
  unsub()
  vi.restoreAllMocks()
  cleanup()
  await closeFile()
})

describe('PDFs from Google Drive', () => {
  it('opens a PDF typed application/pdf, and one typed application/octet-stream with a .pdf name, picking several at once', async () => {
    mocks.pick.mockResolvedValue([
      { id: 'a', name: 'Paper.pdf', mimeType: 'application/pdf', sizeBytes: 5000 },
      { id: 'b', name: 'Scan.pdf', mimeType: 'application/octet-stream', sizeBytes: 5000 },
    ])
    mocks.download.mockImplementation(async (id: string) => makePdf([{ lines: [{ text: `file ${id}` }] }, {}]))
    await openPdfFromDrive()
    expect(sources().map((s) => s.name).sort()).toEqual(['Paper.pdf', 'Scan.pdf'])
    expect(sources().every((s) => s.pages === 2)).toBe(true)
    expect(sources().map((s) => s.driveId).sort()).toEqual(['a', 'b'])
    expect(mocks.download).toHaveBeenCalledTimes(2)
  })

  it('turns away a file that is not a PDF by its content, says so by name, and still adds the others', async () => {
    mocks.pick.mockResolvedValue([
      { id: 'x', name: 'Notes.pdf', mimeType: 'application/pdf' },
      { id: 'y', name: 'Good.pdf', mimeType: 'application/pdf' },
    ])
    mocks.download.mockImplementation(async (id: string) => (id === 'x' ? text('this is only text') : makePdf([{}])))
    await openPdfFromDrive()
    expect(notices.some((n) => /"Notes\.pdf" isn't a PDF/.test(n))).toBe(true)
    expect(sources().map((s) => s.name)).toEqual(['Good.pdf'])
  })

  it('says a damaged PDF is damaged and adds nothing for it', async () => {
    mocks.pick.mockResolvedValue([{ id: 'x', name: 'Broken.pdf', mimeType: 'application/pdf' }])
    mocks.download.mockResolvedValue(text('%PDF-1.4\nthis is not really a pdf file at all'))
    await openPdfFromDrive()
    expect(notices.join(' ')).toMatch(/damaged|could not be opened/)
    expect(sources()).toHaveLength(0)
  })

  it('refuses a PDF over the size limit without downloading it, and opens a large one under it', async () => {
    mocks.pick.mockResolvedValue([
      { id: 'big', name: 'Huge.pdf', mimeType: 'application/pdf', sizeBytes: 60 * 1024 * 1024 },
      { id: 'ok', name: 'Large.pdf', mimeType: 'application/pdf', sizeBytes: 30 * 1024 * 1024 },
    ])
    mocks.download.mockImplementation(async (id: string) => {
      if (id === 'big') throw new Error('should not be downloaded')
      const doc = await PDFDocument.create()
      for (let i = 0; i < 150; i++) doc.addPage()
      doc.context.register(doc.context.stream(new Uint8Array(30 * 1024 * 1024).map((_, i) => (i * 31) % 251), { Type: 'Pad' }))
      return doc.save()
    })
    await openPdfFromDrive()
    expect(mocks.download).toHaveBeenCalledTimes(1)
    expect(notices.join(' ')).toMatch(/Huge\.pdf" is larger than 50 MB/)
    expect(sources().map((s) => [s.name, s.pages])).toEqual([['Large.pdf', 150]])
  }, 60_000)

  it('asks for the password of a protected PDF, tells a wrong one, and opens with the right one', async () => {
    mocks.pick.mockResolvedValue([{ id: 'p', name: 'Locked.pdf', mimeType: 'application/pdf' }])
    mocks.download.mockResolvedValue(encrypted())
    const done = openPdfFromDrive()
    await vi.waitFor(() => expect(st().pdfPassword).toEqual({ name: 'Locked.pdf', wrong: false }))
    act(() => answerPassword('nope'))
    await vi.waitFor(() => expect(st().pdfPassword).toEqual({ name: 'Locked.pdf', wrong: true }))
    act(() => answerPassword('secret'))
    await done
    expect(sources().map((s) => s.name)).toEqual(['Locked.pdf'])
    expect(sources()[0]?.pages).toBe(1)
    expect(st().pdfPassword).toBeNull()
    // The session remembers it, so the panel opens the file without asking again.
    const access = await accessPdf(sources()[0] as never)
    expect(access.state).toBe('ready')
  })

  it('adds nothing when the person gives up on the password', async () => {
    mocks.pick.mockResolvedValue([{ id: 'p', name: 'Locked.pdf', mimeType: 'application/pdf' }])
    mocks.download.mockResolvedValue(encrypted())
    const done = openPdfFromDrive()
    await vi.waitFor(() => expect(st().pdfPassword).not.toBeNull())
    act(() => answerPassword(null))
    await done
    expect(sources()).toHaveLength(0)
  })

  it('cancelling the picker adds nothing', async () => {
    mocks.pick.mockResolvedValue([])
    await openPdfFromDrive()
    expect(sources()).toHaveLength(0)
    expect(mocks.download).not.toHaveBeenCalled()
  })
})

describe('PDFs from the device and by drag and drop', () => {
  it('accepts application/pdf, a .pdf with no type, and a .pdf typed octet-stream; refuses a clearly different file', async () => {
    await addPdfFiles([file(await makePdf([{}]), 'a.pdf', 'application/pdf'), file(await makePdf([{}, {}]), 'b.pdf', ''), file(await makePdf([{}, {}, {}]), 'c.PDF', 'application/octet-stream')])
    expect(sources().map((s) => s.pages).sort()).toEqual([1, 2, 3])
    expect(await addPdfFile(file(text('hello'), 'notes.txt', 'text/plain'))).toBeNull()
    expect(notices.at(-1)).toMatch(/notes\.txt" isn't a PDF/)
  })

  it('checks a file by what is inside it, not its name', async () => {
    expect(await addPdfFile(file(text('just words'), 'fake.pdf', 'application/pdf'))).toBeNull()
    expect(notices.at(-1)).toMatch(/isn't a PDF/)
    expect(sources()).toHaveLength(0)
  })
})
