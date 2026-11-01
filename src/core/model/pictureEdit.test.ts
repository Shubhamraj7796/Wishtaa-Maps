import 'fake-indexeddb/auto'
import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '../files/core'
import { MemoryImageStore } from '../images/store'
import { FakeDrive } from '../drive/fakeDrive'
import { mergeMaps } from '../drive/merge'
import { DriveRepository } from '../drive/repository'
import { MemorySyncStore } from '../drive/syncStore'
import type { BlobStores } from '../drive/format'
import { toShown } from '../pdf/geometry'
import type { Point, Turn } from '../pdf/types'
import { addChild, setImage } from './commands'
import { createMapDoc, ensureRoot, getRootId } from './doc'
import { addPictureMark, clearPictureMarks, deletePictureMark, flipPicture, MAX_MARKS, marksOf, resetPictureTurn, rotatePicture, setMarksHidden, toPicturePoint, updatePictureMark } from './pictureEdit'

const mapWithPicture = () => {
  const doc = createMapDoc()
  const root = ensureRoot(doc, 'Central Topic')
  const id = addChild(doc, root, 'Chart')
  setImage(doc, id, { imageId: 'pic-1', width: 400, height: 200 })
  doc.undo.clear()
  return { doc, id }
}
const image = (d: ReturnType<typeof mapWithPicture>) => d.doc.topics.get(d.id)?.image
const mark = { kind: 'pen' as const, color: '#ef4444', points: [[0.1, 0.1], [0.4, 0.5]] as Point[], width: 0.004 }

describe('turning and mirroring a picture reference', () => {
  it('a quarter turn swaps the shown size, cycles through 0, 90, 180, 270, and each is one undo step', () => {
    const m = mapWithPicture()
    expect(rotatePicture(m.doc, m.id, 90)).toBe(true)
    expect(image(m)).toMatchObject({ rotation: 90, width: 200, height: 400, imageId: 'pic-1' })
    rotatePicture(m.doc, m.id, 90)
    expect(image(m)).toMatchObject({ rotation: 180, width: 400, height: 200 })
    rotatePicture(m.doc, m.id, 90)
    rotatePicture(m.doc, m.id, 90)
    expect(image(m)?.rotation).toBeUndefined() // a full turn is no turn at all
    expect(image(m)).toMatchObject({ width: 400, height: 200 })
    expect(m.doc.undo.undoStack.length).toBe(4)
    m.doc.undo.undo()
    expect(image(m)).toMatchObject({ rotation: 270, width: 200, height: 400 })
    rotatePicture(m.doc, m.id, -90)
    expect(image(m)?.rotation).toBe(180)
  })

  it('a mirrored picture turns the way it looks (clockwise on screen)', () => {
    const m = mapWithPicture()
    flipPicture(m.doc, m.id, 'x')
    rotatePicture(m.doc, m.id, 90)
    expect(image(m)?.rotation).toBe(270) // stored the other way round, so it looks like a clockwise quarter turn
    flipPicture(m.doc, m.id, 'x')
    expect(image(m)?.flipX).toBeUndefined()
  })

  it('never changes which picture it is, so nothing new is stored or uploaded', () => {
    const m = mapWithPicture()
    rotatePicture(m.doc, m.id, 90)
    flipPicture(m.doc, m.id, 'y')
    addPictureMark(m.doc, m.id, mark)
    expect(image(m)?.imageId).toBe('pic-1')
  })

  it('reset removes the turn and mirror and puts the shown size back', () => {
    const m = mapWithPicture()
    rotatePicture(m.doc, m.id, 90)
    flipPicture(m.doc, m.id, 'x')
    resetPictureTurn(m.doc, m.id)
    expect(image(m)).toEqual({ imageId: 'pic-1', width: 400, height: 200 })
  })

  it('does nothing for a topic without a picture', () => {
    const m = mapWithPicture()
    const bare = addChild(m.doc, getRootId(m.doc) as string, 'Plain')
    expect(rotatePicture(m.doc, bare, 90)).toBe(false)
    expect(addPictureMark(m.doc, bare, mark)).toBeNull()
  })
})

describe('marks on a picture', () => {
  it('are added, changed, deleted, hidden and cleared; each is one undo step and undo and redo restore them', () => {
    const m = mapWithPicture()
    const a = addPictureMark(m.doc, m.id, mark) as string
    const b = addPictureMark(m.doc, m.id, { ...mark, kind: 'rect', rects: [{ x: 0.1, y: 0.1, w: 0.3, h: 0.2 }], points: undefined }) as string
    expect(marksOf(image(m)).map((x) => x.id)).toEqual([a, b])
    expect(marksOf(image(m))[0]).toMatchObject({ sourceId: 'picture', page: 0, kind: 'pen' })
    updatePictureMark(m.doc, m.id, a, { color: '#2563eb' })
    expect(image(m)?.marks?.[a]?.color).toBe('#2563eb')
    setMarksHidden(m.doc, m.id, true)
    expect(image(m)?.markHidden).toBe(true)
    setMarksHidden(m.doc, m.id, false)
    expect(image(m)?.markHidden).toBeUndefined()
    deletePictureMark(m.doc, m.id, a)
    expect(marksOf(image(m)).map((x) => x.id)).toEqual([b])
    expect(m.doc.undo.undoStack.length).toBe(6)
    m.doc.undo.undo()
    expect(marksOf(image(m)).length).toBe(2)
    m.doc.undo.redo()
    clearPictureMarks(m.doc, m.id)
    expect(image(m)?.marks).toBeUndefined()
    m.doc.undo.undo()
    expect(marksOf(image(m)).length).toBe(1)
  })

  it('are limited, and 500 of them are a small amount of JSON', () => {
    const m = mapWithPicture()
    m.doc.ydoc.transact(() => {
      const t = m.doc.topics.get(m.id)!
      const marks = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`m${i}`, { id: `m${i}`, sourceId: 'picture', page: 0, kind: 'pen', color: '#ef4444', createdAt: i, width: 0.004, points: Array.from({ length: 12 }, (_, j) => [j / 12, (i % 10) / 10]) }]))
      m.doc.topics.set(m.id, { ...t, image: { ...t.image!, marks: marks as never } })
    })
    expect(Y.encodeStateAsUpdate(m.doc.ydoc).length).toBeLessThan(200_000) // about 300 bytes a stroke of twelve points
    const big = mapWithPicture()
    big.doc.ydoc.transact(() => {
      const t = big.doc.topics.get(big.id)!
      big.doc.topics.set(big.id, { ...t, image: { ...t.image!, marks: Object.fromEntries(Array.from({ length: MAX_MARKS }, (_, i) => [`m${i}`, { id: `m${i}`, sourceId: 'picture', page: 0, kind: 'pen', color: '#000', createdAt: i }])) as never } })
    })
    expect(addPictureMark(big.doc, big.id, mark)).toBeNull()
  })
})

describe('marks stay on what they mark when the picture is turned', () => {
  // The stored picture is shown as: turned clockwise, then mirrored. A point of the stored picture goes to `forward`; a pen stroke made
  // on the shown picture must come back to the same stored point through toPicturePoint.
  const forward = (p: Point, rotation: Turn, flipX: boolean, flipY: boolean): Point => {
    const s = toShown(p, rotation)
    return [flipX ? 1 - s[0] : s[0], flipY ? 1 - s[1] : s[1]]
  }
  it('for every turn and mirror, a point drawn on the shown picture is stored where it belongs', () => {
    const points: Point[] = [[0.1, 0.2], [0.9, 0.3], [0.5, 0.5], [0.25, 0.8]]
    for (const rotation of [0, 90, 180, 270] as Turn[])
      for (const flipX of [false, true])
        for (const flipY of [false, true])
          for (const p of points) {
            const shown = forward(p, rotation, flipX, flipY)
            const back = toPicturePoint(shown, { rotation: (rotation || undefined) as never, flipX, flipY })
            expect(back[0]).toBeCloseTo(p[0], 9)
            expect(back[1]).toBeCloseTo(p[1], 9)
          }
  })
  it('a corner of the stored picture is a corner of the shown one after a quarter turn', () => {
    expect(forward([0, 0], 90, false, false)).toEqual([1, 0]) // top left goes to top right, clockwise
    expect(forward([1, 0], 90, false, false)).toEqual([1, 1])
  })
})

describe('across devices', () => {
  const start = () => {
    const m = mapWithPicture()
    return { m, bytes: Y.encodeStateAsUpdate(m.doc.ydoc) }
  }
  const edit = (bytes: Uint8Array, fn: (d: ReturnType<typeof mapWithPicture>['doc'], id: string) => void) => {
    const doc = createMapDoc()
    Y.applyUpdate(doc.ydoc, bytes)
    const id = [...doc.topics.keys()].find((k) => doc.topics.get(k)?.text === 'Chart') as string
    fn(doc, id)
    return Y.encodeStateAsUpdate(doc.ydoc)
  }
  const imageOf = (bytes: Uint8Array) => {
    const doc = createMapDoc()
    Y.applyUpdate(doc.ydoc, bytes)
    return [...doc.topics.values()].find((t) => t.text === 'Chart')?.image
  }

  it('one device turns the picture while another marks it: both survive the merge', () => {
    const { bytes } = start()
    const laptop = edit(bytes, (d, id) => void rotatePicture(d, id, 90))
    const phone = edit(bytes, (d, id) => void addPictureMark(d, id, mark))
    const res = mergeMaps(bytes, laptop, phone, { localAt: 2, remoteAt: 1 })
    expect(imageOf(res.content)).toMatchObject({ rotation: 90, width: 200, height: 400 })
    expect(marksOf(imageOf(res.content)).length).toBe(1)
    expect(res.conflicts).toEqual([])
  })

  it('both devices add different marks: both are kept; the same mark changed on both keeps the newer, field by field', () => {
    const { bytes } = start()
    const seeded = edit(bytes, (d, id) => void addPictureMark(d, id, mark))
    const markId = marksOf(imageOf(seeded))[0]!.id
    const laptop = edit(seeded, (d, id) => {
      addPictureMark(d, id, { ...mark, color: '#4ade80' })
      updatePictureMark(d, id, markId, { color: '#facc15' })
    })
    const phone = edit(seeded, (d, id) => {
      addPictureMark(d, id, { ...mark, color: '#38bdf8' })
      updatePictureMark(d, id, markId, { color: '#a855f7', note: 'check' })
    })
    const res = mergeMaps(seeded, laptop, phone, { localAt: 1, remoteAt: 2 }) // the phone is newer
    const marks = marksOf(imageOf(res.content))
    expect(marks.length).toBe(3)
    expect(marks.find((m) => m.id === markId)).toMatchObject({ color: '#a855f7', note: 'check' })
    expect(res.conflicts.map((c) => c.field)).toEqual(['image.marks.' + markId + '.color'])
  })

  it('editing a turn or marks sends only the map file to Drive: no picture goes up again', async () => {
    const drive = new FakeDrive()
    const local = new RepositoryCore(new MemoryBackend(), () => 1_700_000_000_000)
    const blobs = (): BlobStores => ({ images: new MemoryImageStore(), attachments: new MemoryImageStore() })
    const repo = new DriveRepository(local, drive, { blobs, sessionId: 'a', syncStore: new MemorySyncStore() })
    const { bytes } = start()
    const f = await local.create({ type: 'map', name: 'Pics', content: bytes })
    await local.saveContent(f.id, bytes, { imageIds: ['pic-1'] })
    const moved = await repo.moveToDrive(f.id)
    const before = { ...drive.stats }
    const callsBefore = drive.calls.length
    const after = edit(bytes, (d, id) => {
      rotatePicture(d, id, 90)
      addPictureMark(d, id, mark)
    })
    await repo.saveContent(moved.id, after, { imageIds: ['pic-1'] })
    const sent = drive.calls.slice(callsBefore)
    expect(sent.filter((c) => c.startsWith('uploadBinary'))).toEqual([]) // no picture goes up
    expect(sent.filter((c) => c.startsWith('update'))).toHaveLength(1) // one write: the map file
    expect(drive.stats.copies).toBe(before.copies)
    const body = drive.files.get(moved.contentRef as string)!.body
    expect(drive.stats.bytesUploaded - before.bytesUploaded).toBeLessThan(body.length + 1024) // about the size of the map file, not of a picture
    expect(body.length).toBeLessThan(5000)
  })
})
