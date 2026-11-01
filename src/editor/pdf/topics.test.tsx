// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import type { SourceRef } from '@/core/pdf/types'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { closeFile, mapDoc, openFile } from '../session'
import { useEditor } from '../store'
import { enterReadMode } from '../readmode'
import { OutlineView } from '../ui/OutlineView'
import { setPdfTool, showSource } from './actions'
import { SourceBadge } from './SourceBadge'
import { addOutlineTopics, addPdfTopics } from './topics'
import { readSelection } from './selection'
import { SOURCE_DRAG } from './SelectionBar'

let t = 1_700_000_000_000
const st = () => useEditor.getState()
const undoSteps = () => mapDoc.undo.undoStack.length
const sel = (text: string, page = 3) => ({ sourceId: 's1', page, rect: { x: 0.1, y: 0.2, w: 0.5, h: 0.05 }, text })
const kids = (id: string) => Object.values(st().topics).filter((x) => x.parentId === id).sort((a, b) => a.order - b.order)

beforeEach(async () => {
  installMemoryLocalStorage()
  const repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'map', name: 'Pdf', content: buildStarterContent('blank') })
  await openFile(f.id, repo)
  mapDoc.undo.clear()
})
afterEach(async () => {
  cleanup()
  await closeFile()
})

describe('topics from text taken out of a PDF', () => {
  it('makes one cleaned topic under the central topic, remembering page and place, in one undo step', () => {
    const before = undoSteps()
    const ids = addPdfTopics(sel('Absorp-\ntion of the drug\nin the gut'), 'sub')
    expect(ids).toHaveLength(1)
    const topic = st().topics[ids[0] as string]
    expect(topic?.text).toBe('Absorption of the drug in the gut')
    expect(topic?.parentId).toBe(st().rootId)
    expect(topic?.source).toEqual({ sourceId: 's1', page: 3, rect: { x: 0.1, y: 0.2, w: 0.5, h: 0.05 } })
    expect(undoSteps()).toBe(before + 1)
    mapDoc.undo.undo()
    expect(st().topics[ids[0] as string]).toBeUndefined()
  })

  it('splits per line into several topics as ONE undo step, each with the source', () => {
    const before = undoSteps()
    const ids = addPdfTopics(sel('First point\nSecond point\nThird point'), 'sub', { perLine: true })
    expect(ids).toHaveLength(3)
    expect(kids(st().rootId).map((k) => k.text)).toEqual(expect.arrayContaining(['First point', 'Second point', 'Third point']))
    expect(ids.every((id) => st().topics[id]?.source?.page === 3)).toBe(true)
    expect(undoSteps()).toBe(before + 1)
  })

  it('"Add as topic" goes beside the selected topic, "sub-topic" goes under it', () => {
    const [a] = addPdfTopics(sel('Branch A'), 'sub') as [string]
    expect(st().selected).toEqual([a])
    const [sib] = addPdfTopics(sel('Sibling'), 'topic') as [string]
    expect(st().topics[sib]?.parentId).toBe(st().topics[a]?.parentId)
    const [sub] = addPdfTopics(sel('Under sibling'), 'sub') as [string]
    expect(st().topics[sub]?.parentId).toBe(sib)
  })

  it('does nothing in Read mode, and for an empty selection', async () => {
    expect(addPdfTopics(sel('  \n '), 'sub')).toEqual([])
    await act(async () => void (await enterReadMode()))
    expect(addPdfTopics(sel('Text'), 'sub')).toEqual([])
    expect(kids(st().rootId)).toHaveLength(0)
  })
})

describe('an outline started from bookmarks or headings', () => {
  it('builds the tree by level with page links, one undo step, and tolerates a jump in depth', () => {
    const before = undoSteps()
    const n = addOutlineTopics('s1', [
      { title: 'Chapter 1', level: 1, page: 1 },
      { title: 'Section 1.1', level: 2, page: 2 },
      { title: 'Deep', level: 5, page: 3 },
      { title: 'Chapter 2', level: 1, page: 9 },
      { title: '   ', level: 1, page: 9 },
    ])
    expect(n).toBe(4)
    const [c1, c2] = kids(st().rootId)
    expect(c1?.text).toBe('Chapter 1')
    expect(c1?.source?.page).toBe(1)
    expect(c2?.text).toBe('Chapter 2')
    const s11 = kids(c1?.id as string)[0]
    expect(s11?.text).toBe('Section 1.1')
    expect(kids(s11?.id as string)[0]?.text).toBe('Deep')
    expect(undoSteps()).toBe(before + 1)
  })
})

describe('source links', () => {
  const ref: SourceRef = { sourceId: 's1', page: 7, rect: { x: 0.2, y: 0.3, w: 0.4, h: 0.1 } }

  it('"p. N" shows that place in the PDF when clicked', () => {
    expect(st().pdfPanel.open).toBe(false)
    render(<SourceBadge source={ref} />)
    // The map has no such PDF: the person is told, nothing breaks.
    fireEvent.click(screen.getByRole('button', { name: /show page 7/i }))
    expect(st().pdfPanel.open).toBe(false)
    // Once the PDF is in the map the panel opens on that page and marks the passage.
    act(() => {
      mapDoc.pdfSources.set('s1', { id: 's1', name: 'a.pdf', size: 1, hash: 'h', pages: 10, addedAt: 1 })
    })
    showSource(ref)
    expect(st().pdfPanel).toMatchObject({ open: true, sourceId: 's1', page: 7, tab: 'pages' })
    expect(st().pdfPanel.focus?.rect).toEqual(ref.rect)
  })

  it('shows "p. N" on the Outline row of a linked topic', () => {
    const [id] = addPdfTopics(sel('Linked'), 'sub') as [string]
    render(<OutlineView />)
    expect(id).toBeTruthy()
    expect(screen.getByRole('button', { name: /show page 3 of the pdf/i }).textContent).toBe('p. 3')
  })

  it('dropping text dragged out of the PDF on an Outline row makes sub-topics of that row', () => {
    const [id] = addPdfTopics(sel('Target row'), 'sub') as [string]
    const { container } = render(<OutlineView />)
    const row = container.querySelector(`[data-row="${id}"]`) as HTMLElement
    const payload = JSON.stringify({ ...sel('Dropped\nsecond'), perLine: true })
    const data = { types: [SOURCE_DRAG], getData: (k: string) => (k === SOURCE_DRAG ? payload : ''), dropEffect: '' }
    fireEvent.dragOver(row, { dataTransfer: data })
    fireEvent.drop(row, { dataTransfer: data })
    expect(kids(id).map((k) => k.text)).toEqual(['Dropped', 'second'])
  })
})

describe('reading a selection', () => {
  it('is null when nothing is selected, and tool changes do not break', () => {
    const root = document.createElement('div')
    expect(readSelection(root, 's1', {})).toBeNull()
    setPdfTool('capture')
    expect(st().pdfPanel.tool).toBe('capture')
  })
})
