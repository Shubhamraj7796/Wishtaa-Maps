// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { addChild } from '@/core/model/commands'
import { fakeCodec, source } from '../../test/fakeCodec'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { imageStore, releaseUnusedUrls, useImageUrl } from '../images'
import { closeFile, mapDoc, openFile } from '../session'
import { useEditor } from '../store'
import { addPictures, setPictureCodec } from './flow'

let n = 0
const revoke = vi.fn()
URL.createObjectURL = vi.fn(() => `blob:fake-${++n}`) as never
URL.revokeObjectURL = revoke

function Show({ id }: { id: string }) {
  const { url } = useImageUrl(id)
  return <output data-testid="u">{url ?? 'none'}</output>
}

let child = ''
const { codec } = fakeCodec({ webp: true })
beforeEach(async () => {
  installMemoryLocalStorage()
  setPictureCodec(codec)
  const repo = new RepositoryCore(new MemoryBackend(), () => Date.now())
  const f = await repo.create({ type: 'kb', name: 'Stale', content: buildStarterContent('kb') })
  await openFile(f.id, repo)
  child = addChild(mapDoc, useEditor.getState().rootId, 'T')
  await act(async () => void (await new Promise((r) => setTimeout(r, 30))))
  useEditor.setState({ selected: [child] })
  revoke.mockClear()
})
afterEach(async () => {
  cleanup()
  await closeFile()
})

const photo = (kb: number, w: number, h: number) => source(w, h, 'photo', kb * 1024, 'image/jpeg')

describe('a replaced or re-cropped picture shows at once', () => {
  it('changing the picture id shows the new picture, never the old address in between', async () => {
    await imageStore.put({ id: 'pa', width: 10, height: 10, type: 'image/png', size: 1, blob: new Blob(['a']) })
    await imageStore.put({ id: 'pb', width: 10, height: 10, type: 'image/png', size: 1, blob: new Blob(['b']) })
    const { rerender } = render(<Show id="pa" />)
    await waitFor(() => expect(screen.getByTestId('u').textContent).not.toBe('none'))
    const first = screen.getByTestId('u').textContent
    const seen: string[] = []
    const watch = new MutationObserver(() => seen.push(screen.getByTestId('u').textContent ?? ''))
    watch.observe(screen.getByTestId('u'), { childList: true, characterData: true, subtree: true })
    rerender(<Show id="pb" />)
    await waitFor(() => expect(screen.getByTestId('u').textContent).not.toBe(first))
    watch.disconnect()
    expect(seen).not.toContain(first)
  })

  it('replacing a picture revokes the old address when nothing else uses it', async () => {
    await addPictures([photo(40, 600, 400)], 'upload', { kind: 'topic', id: child }, { codec })
    const oldId = useEditor.getState().topics[child]?.image?.imageId as string
    render(<Show id={oldId} />)
    await waitFor(() => expect(screen.getByTestId('u').textContent).not.toBe('none'))
    const oldUrl = screen.getByTestId('u').textContent as string
    await addPictures([photo(60, 700, 500)], 'upload', { kind: 'replace', id: child }, { codec })
    expect(useEditor.getState().topics[child]?.image?.imageId).not.toBe(oldId)
    expect(revoke).toHaveBeenCalledWith(oldUrl)
  })

  it('an address a topic still uses is kept', async () => {
    await addPictures([photo(40, 600, 400)], 'upload', { kind: 'topic', id: child }, { codec })
    const id = useEditor.getState().topics[child]?.image?.imageId as string
    render(<Show id={id} />)
    await waitFor(() => expect(screen.getByTestId('u').textContent).not.toBe('none'))
    revoke.mockClear()
    releaseUnusedUrls()
    expect(revoke).not.toHaveBeenCalled()
  })
})
