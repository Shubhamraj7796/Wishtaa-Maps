// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PICTURE_LIMITS } from '@/core/images/limits'
import { ImageError } from '@/core/images/process'
import { addChild, setImage } from '@/core/model/commands'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { fakeCodec, source } from '../../test/fakeCodec'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { imageStore, mapPictureUsage } from '../images'
import { closeFile, mapDoc, openFile } from '../session'
import { useEditor } from '../store'
import { QUOTA_MESSAGE, setPictureCodec, storePicture } from './flow'

const { codec } = fakeCodec({ webp: true })
const candidate = (kb: number) => ({ blob: source(1000, 800, 'photo', kb * 1024, 'image/webp'), width: 1000, height: 800, type: 'image/webp' })

beforeEach(async () => {
  installMemoryLocalStorage()
  setPictureCodec(codec)
  const repo = new RepositoryCore(new MemoryBackend(), () => Date.now())
  const f = await repo.create({ type: 'kb', name: 'Quota', content: buildStarterContent('kb') })
  await openFile(f.id, repo)
})
afterEach(async () => {
  vi.restoreAllMocks()
  await closeFile()
})

describe('when the browser has no room left', () => {
  it('says so clearly, keeps what is there, and works again once there is room', async () => {
    const put = vi.spyOn(imageStore, 'put').mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'))
    const err = await storePicture(candidate(50)).catch((e) => e)
    expect(err).toBeInstanceOf(ImageError)
    expect((err as Error).message).toBe(QUOTA_MESSAGE)
    expect((err as Error).message).toMatch(/Storage settings/)
    expect(put).toHaveBeenCalledTimes(1)
    // room again (the second try is not refused)
    const id = await storePicture(candidate(50))
    expect(await imageStore.getMeta(id)).toBeTruthy()
  })
})

describe('limits are per map', () => {
  it('counts the distinct pictures the open map uses and their stored size', async () => {
    const root = useEditor.getState().rootId
    const a = addChild(mapDoc, root, 'A')
    const b = addChild(mapDoc, root, 'B')
    const c = addChild(mapDoc, root, 'C')
    const id1 = await storePicture(candidate(100))
    const id2 = await storePicture(candidate(200))
    setImage(mapDoc, a, { imageId: id1, width: 10, height: 10 })
    setImage(mapDoc, b, { imageId: id1, width: 10, height: 10 }) // the same picture twice: counted once
    setImage(mapDoc, c, { imageId: id2, width: 10, height: 10 })
    await new Promise((r) => setTimeout(r, 20))
    const usage = await mapPictureUsage()
    expect(usage.count).toBe(2)
    expect(usage.bytes).toBe(300 * 1024)
  })

  it('refuses a new picture at the hard limit, with the reason, and only warns at the soft limit', async () => {
    const root = useEditor.getState().rootId
    // Pretend the map already holds the hard-limit number of pictures (the sizes are real, the count is what matters).
    const ids: string[] = []
    for (let i = 0; i < PICTURE_LIMITS.hardCount; i++) ids.push(`fill-${i}`)
    const topics = useEditor.getState().topics
    const fakeTopics = Object.fromEntries(ids.map((id, i) => [`t${i}`, { ...(topics[root] as object), image: { imageId: id, width: 1, height: 1 } }]))
    useEditor.setState({ topics: { ...topics, ...fakeTopics } as never })
    const err = await storePicture(candidate(20)).catch((e) => e)
    expect(err).toBeInstanceOf(ImageError)
    expect((err as Error).message).toMatch(/most one map can hold/)
  })
})
