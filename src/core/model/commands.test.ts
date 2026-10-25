import { describe, expect, it } from 'vitest'
import {
  addChild,
  addFloating,
  addSibling,
  deleteTopics,
  detachTopic,
  duplicate,
  moveTopic,
  pasteBranches,
  reorder,
  serializeBranches,
  setCollapsed,
  setImage,
  setImageSize,
  setText,
} from './commands'
import { MAX_UNDO, createMapDoc, ensureRoot, snapshotTopics } from './doc'
import { buildIndex, childrenOf, descendantIds, isAncestorOf, topLevelOnly } from './tree'

function setup() {
  const doc = createMapDoc()
  const root = ensureRoot(doc)
  return { doc, root }
}
const texts = (doc: ReturnType<typeof createMapDoc>, parent: string | null) =>
  childrenOf(buildIndex(snapshotTopics(doc)), parent).map((t) => t.text)

describe('add / delete', () => {
  it('adds children in order and siblings after the anchor', () => {
    const { doc, root } = setup()
    const a = addChild(doc, root, 'A')
    addChild(doc, root, 'C')
    addSibling(doc, a, 'B')
    expect(texts(doc, root)).toEqual(['A', 'B', 'C'])
  })

  it('has no sibling for the central topic or floating topics', () => {
    const { doc, root } = setup()
    expect(addSibling(doc, root)).toBeNull()
    const f = addFloating(doc, { x: 5, y: 5 })
    expect(addSibling(doc, f)).toBeNull()
  })

  it('expands a collapsed parent when a child is added', () => {
    const { doc, root } = setup()
    const a = addChild(doc, root, 'A')
    setCollapsed(doc, [a], true)
    addChild(doc, a, 'x')
    expect(doc.topics.get(a)?.collapsed).toBe(false)
  })

  it('deletes a branch with its descendants and renumbers siblings', () => {
    const { doc, root } = setup()
    const a = addChild(doc, root, 'A')
    addChild(doc, a, 'a1')
    addChild(doc, root, 'B')
    const removed = deleteTopics(doc, [a])
    expect(removed).toHaveLength(2)
    expect(texts(doc, root)).toEqual(['B'])
    expect(doc.topics.get(childrenOf(buildIndex(snapshotTopics(doc)), root)[0]!.id)?.order).toBe(0)
  })

  it('never deletes the central topic', () => {
    const { doc, root } = setup()
    expect(deleteTopics(doc, [root])).toEqual([])
    expect(doc.topics.has(root)).toBe(true)
  })
})

describe('selection that includes the central topic (Ctrl+A)', () => {
  it('deletes every other topic but keeps the central topic', () => {
    const { doc, root } = setup()
    const a = addChild(doc, root, 'A')
    addChild(doc, a, 'a1')
    addChild(doc, root, 'B')
    deleteTopics(doc, Object.keys(snapshotTopics(doc)))
    expect(Object.keys(snapshotTopics(doc))).toEqual([root])
  })

  it('duplicates the other topics and skips the central topic', () => {
    const { doc, root } = setup()
    const a = addChild(doc, root, 'A')
    const b = addChild(doc, root, 'B')
    const copies = duplicate(doc, [root, a, b])
    expect(copies).toHaveLength(2)
    expect(texts(doc, root).sort()).toEqual(['A', 'A', 'B', 'B'])
  })
})

describe('move / reorder', () => {
  it('re-parents at an index', () => {
    const { doc, root } = setup()
    const a = addChild(doc, root, 'A')
    const b = addChild(doc, root, 'B')
    const x = addChild(doc, a, 'x')
    expect(moveTopic(doc, x, b, 0)).toBe(true)
    expect(texts(doc, b)).toEqual(['x'])
    expect(texts(doc, a)).toEqual([])
  })

  it('refuses to move a topic into its own subtree or onto itself', () => {
    const { doc, root } = setup()
    const a = addChild(doc, root, 'A')
    const a1 = addChild(doc, a, 'a1')
    expect(moveTopic(doc, a, a1)).toBe(false)
    expect(moveTopic(doc, a, a)).toBe(false)
    expect(moveTopic(doc, root, a)).toBe(false)
  })

  it('reorders among siblings and stops at the ends', () => {
    const { doc, root } = setup()
    const a = addChild(doc, root, 'A')
    addChild(doc, root, 'B')
    expect(reorder(doc, a, -1)).toBe(false)
    expect(reorder(doc, a, 1)).toBe(true)
    expect(texts(doc, root)).toEqual(['B', 'A'])
  })

  it('detaches a branch into a floating topic', () => {
    const { doc, root } = setup()
    const a = addChild(doc, root, 'A')
    expect(detachTopic(doc, a, { x: 10, y: 20 })).toBe(true)
    expect(doc.topics.get(a)?.parentId).toBeNull()
    expect(doc.topics.get(a)?.floatingPosition).toEqual({ x: 10, y: 20 })
  })
})

describe('copy / paste / duplicate', () => {
  it('round-trips a branch under another parent', () => {
    const { doc, root } = setup()
    const a = addChild(doc, root, 'A')
    addChild(doc, a, 'a1')
    const b = addChild(doc, root, 'B')
    setText(doc, a, 'A!')
    const branches = serializeBranches(snapshotTopics(doc), [a])
    const ids = pasteBranches(doc, branches, b)
    expect(ids).toHaveLength(1)
    expect(texts(doc, b)).toEqual(['A!'])
    expect(texts(doc, ids[0]!)).toEqual(['a1'])
  })

  it('folds nested selections into one branch', () => {
    const { doc, root } = setup()
    const a = addChild(doc, root, 'A')
    const a1 = addChild(doc, a, 'a1')
    expect(serializeBranches(snapshotTopics(doc), [a, a1])).toHaveLength(1)
    expect(topLevelOnly(snapshotTopics(doc), [a, a1])).toEqual([a])
  })

  it('duplicates right after the original with fresh ids', () => {
    const { doc, root } = setup()
    const a = addChild(doc, root, 'A')
    addChild(doc, root, 'B')
    const [copy] = duplicate(doc, [a])
    expect(texts(doc, root)).toEqual(['A', 'A', 'B'])
    expect(copy).not.toBe(a)
  })
})

describe('tree helpers', () => {
  it('finds descendants and ancestors', () => {
    const { doc, root } = setup()
    const a = addChild(doc, root, 'A')
    const a1 = addChild(doc, a, 'a1')
    const topics = snapshotTopics(doc)
    expect(descendantIds(buildIndex(topics), root).sort()).toEqual([a, a1].sort())
    expect(isAncestorOf(topics, root, a1)).toBe(true)
    expect(isAncestorOf(topics, a1, root)).toBe(false)
  })

  it('treats orphans as floating roots instead of losing them', () => {
    const { doc, root } = setup()
    const a = addChild(doc, root, 'A')
    const a1 = addChild(doc, a, 'a1')
    doc.topics.delete(a) // simulate a concurrent delete that left a1 behind
    const idx = buildIndex(snapshotTopics(doc))
    expect(childrenOf(idx, null).map((t) => t.id)).toContain(a1)
  })
})

describe('undo / redo', () => {
  it('undoes and redoes structural edits', () => {
    const { doc, root } = setup()
    addChild(doc, root, 'A')
    addChild(doc, root, 'B')
    doc.undo.undo()
    expect(texts(doc, root)).toEqual(['A'])
    doc.undo.undo()
    expect(texts(doc, root)).toEqual([])
    doc.undo.redo()
    expect(texts(doc, root)).toEqual(['A'])
  })

  it('does not undo the initial central topic', () => {
    const { doc, root } = setup()
    doc.undo.undo()
    expect(doc.topics.has(root)).toBe(true)
  })

  it('treats a multi-step command (delete branch) as one undo step', () => {
    const { doc, root } = setup()
    const a = addChild(doc, root, 'A')
    addChild(doc, a, 'a1')
    deleteTopics(doc, [a])
    doc.undo.undo()
    expect(texts(doc, root)).toEqual(['A'])
    expect(texts(doc, a)).toEqual(['a1'])
  })

  it('keeps at least 100 steps and caps the stack', () => {
    const { doc, root } = setup()
    for (let i = 0; i < MAX_UNDO + 20; i++) addChild(doc, root, `t${i}`)
    expect(doc.undo.undoStack.length).toBe(MAX_UNDO)
    for (let i = 0; i < MAX_UNDO; i++) doc.undo.undo()
    expect(texts(doc, root)).toHaveLength(20)
  })
})

describe('images', () => {
  const ref = { imageId: 'img-1', width: 200, height: 100 }

  it('sets, resizes, replaces and removes an image, each as one undo step', () => {
    const { doc, root } = setup()
    const a = addChild(doc, root, 'A')
    setImage(doc, a, ref)
    expect(doc.topics.get(a)?.image).toEqual(ref)
    setImageSize(doc, a, 300, 150)
    expect(doc.topics.get(a)?.image).toEqual({ imageId: 'img-1', width: 300, height: 150 })
    setImage(doc, a, { imageId: 'img-2', width: 50, height: 50 })
    setImage(doc, a, null)
    expect(doc.topics.get(a)?.image).toBeNull()

    doc.undo.undo() // remove
    expect(doc.topics.get(a)?.image?.imageId).toBe('img-2')
    doc.undo.undo() // replace
    expect(doc.topics.get(a)?.image).toEqual({ imageId: 'img-1', width: 300, height: 150 })
    doc.undo.undo() // resize
    expect(doc.topics.get(a)?.image).toEqual(ref)
    doc.undo.undo() // paste
    expect(doc.topics.get(a)?.image).toBeNull()
    doc.undo.redo()
    expect(doc.topics.get(a)?.image).toEqual(ref)
  })

  it('does not create an undo step when the size is unchanged', () => {
    const { doc, root } = setup()
    const a = addChild(doc, root, 'A')
    setImage(doc, a, ref)
    const before = doc.undo.undoStack.length
    setImageSize(doc, a, 200, 100)
    expect(doc.undo.undoStack.length).toBe(before)
  })

  it('ignores resizing a topic that has no image', () => {
    const { doc, root } = setup()
    const a = addChild(doc, root, 'A')
    setImageSize(doc, a, 10, 10)
    expect(doc.topics.get(a)?.image).toBeNull()
  })

  it('keeps the image when a branch is copied, pasted or duplicated', () => {
    const { doc, root } = setup()
    const a = addChild(doc, root, 'A')
    setImage(doc, a, ref)
    const [copy] = duplicate(doc, [a])
    expect(doc.topics.get(copy!)?.image).toEqual(ref)
    const b = addChild(doc, root, 'B')
    const [pasted] = pasteBranches(doc, serializeBranches(snapshotTopics(doc), [a]), b)
    expect(doc.topics.get(pasted!)?.image).toEqual(ref)
  })

  it('loads topics saved before images existed', () => {
    const { doc, root } = setup()
    const old = { ...doc.topics.get(root)! }
    delete (old as { image?: unknown }).image
    doc.topics.set(root, old)
    expect(doc.topics.get(root)?.image ?? null).toBeNull()
  })
})
