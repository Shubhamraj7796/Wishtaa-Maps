// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildFileIndex } from '@/core/files/indexer'
import { buildStarterContent, linkedTopicContent } from '@/core/files/templates'
import type { FileRepository } from '@/core/files/types'
import { snapshotTopics, createMapDoc } from '@/core/model/doc'
import { fileLink } from '@/core/links'
import * as Y from 'yjs'
import { FilesProvider } from '../../app/FilesContext'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { closeFile, openFile } from '../session'
import { useEditor } from '../store'
import { Backlinks, FileLinkPicker } from './FileLinks'

let repo: FileRepository
let t = 1_700_000_000_000

beforeEach(() => {
  installMemoryLocalStorage()
  repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
})
afterEach(async () => {
  cleanup()
  await closeFile()
})

const wrap = (ui: React.ReactNode) => (
  <MemoryRouter>
    <FilesProvider repo={repo}>{ui}</FilesProvider>
  </MemoryRouter>
)

describe('link to map or knowledge base', () => {
  it('lists other files only and links the topic to the one chosen', async () => {
    const here = await repo.create({ type: 'map', name: 'Here', content: buildStarterContent('blank') })
    const other = await repo.create({ type: 'kb', name: 'Research', content: buildStarterContent('kb') })
    const gone = await repo.create({ type: 'map', name: 'Deleted', content: buildStarterContent('blank') })
    await repo.trash(gone.id)
    await openFile(here.id, repo)
    const rootId = useEditor.getState().rootId

    let closed = false
    render(wrap(<FileLinkPicker topicId={rootId} onClose={() => (closed = true)} />))
    const list = await screen.findByRole('list', { name: 'Files' })
    await waitFor(() => expect(within(list).getAllByRole('button')).toHaveLength(1))
    expect(within(list).queryByText('Here')).toBeNull()
    expect(within(list).queryByText('Deleted')).toBeNull()

    fireEvent.click(within(list).getByText('Research'))
    expect(useEditor.getState().topics[rootId]?.link).toBe(fileLink(other.id))
    expect(closed).toBe(true)
  })

  it('filters the list as you type', async () => {
    const here = await repo.create({ type: 'map', name: 'Here', content: buildStarterContent('blank') })
    await repo.create({ type: 'map', name: 'Budget', content: buildStarterContent('blank') })
    await repo.create({ type: 'map', name: 'Holiday', content: buildStarterContent('blank') })
    await openFile(here.id, repo)
    render(wrap(<FileLinkPicker topicId={useEditor.getState().rootId} onClose={() => undefined} />))
    const list = await screen.findByRole('list', { name: 'Files' })
    await waitFor(() => expect(within(list).getAllByRole('button')).toHaveLength(2))
    fireEvent.change(screen.getByLabelText('Search your files'), { target: { value: 'bud' } })
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual(['Budget'])
  })
})

describe('backlinks', () => {
  it('shows topics in other files that link to the open file, and not the ones in the bin', async () => {
    const target = await repo.create({ type: 'kb', name: 'Target', content: buildStarterContent('kb') })
    const source = await repo.create({ type: 'map', name: 'Source map', content: linkedTopicContent('See the target', target.id) })
    const binned = await repo.create({ type: 'map', name: 'Binned', content: linkedTopicContent('Old reference', target.id) })
    for (const f of [source, binned]) {
      const doc = createMapDoc()
      Y.applyUpdate(doc.ydoc, (await repo.loadContent(f.id))!, 'load')
      await repo.saveContent(f.id, (await repo.loadContent(f.id))!, { index: buildFileIndex(f.id, snapshotTopics(doc)) })
    }
    await repo.trash(binned.id)

    await openFile(target.id, repo)
    render(wrap(<Backlinks topicId={useEditor.getState().rootId} />))
    const link = await screen.findByRole('button', { name: /See the target/ })
    expect(link.textContent).toContain('Source map')
    expect(screen.queryByText('Old reference')).toBeNull()
  })

  it('explains when nothing links here', async () => {
    const f = await repo.create({ type: 'map', content: buildStarterContent('blank') })
    await openFile(f.id, repo)
    render(wrap(<Backlinks topicId={useEditor.getState().rootId} />))
    expect(await screen.findByText(/Nothing links to this topic yet/)).toBeTruthy()
  })
})
