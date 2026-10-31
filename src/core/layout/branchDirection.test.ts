import { describe, expect, it } from 'vitest'
import { addChild } from '../model/commands'
import { createMapDoc, ensureRoot, snapshotTopics } from '../model/doc'
import type { BranchDirection } from '../settings'
import { buildScene, type Scene } from './mindmap'

/**
 * Branch direction for the two-sided Mind map: Balanced (as always), Clockwise and Reverse (anticlockwise).
 * The main topics are numbered 1..n in the order they are stored. Same-sized topics are used, so the order down a side
 * is exactly the order the rule asks for.
 */
const NONE = new Set<string>()
const scene = (doc: ReturnType<typeof createMapDoc>, root: string, direction?: BranchDirection, layout = 'mindmap:both'): Scene =>
  buildScene(snapshotTopics(doc), { rootId: root, maxDepth: null, focusId: null, reveal: NONE, layout, ...(direction ? { branchDirection: direction } : {}) })

function map(n: number, kids = 0) {
  const doc = createMapDoc()
  const root = ensureRoot(doc, 'Centre')
  const mains = Array.from({ length: n }, (_, i) => addChild(doc, root, `T${i + 1}`))
  const subs = mains.map((m, i) => Array.from({ length: kids }, (_, j) => addChild(doc, m, `T${i + 1}.${j + 1}`)))
  return { doc, root, mains, subs }
}

/** What is on each side, top to bottom, as topic numbers (1 = the first main topic). */
function sides(s: Scene, mains: string[]) {
  const num = new Map(mains.map((id, i) => [id, i + 1]))
  const pick = (side: 'left' | 'right') =>
    mains
      .map((id) => s.boxes.get(id)!)
      .filter((b) => b.side === side)
      .sort((a, b) => a.y - b.y)
      .map((b) => num.get(b.id) as number)
  return { right: pick('right'), left: pick('left') }
}

const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i)
const reversed = (a: number[]) => [...a].reverse()

/** What the rule says. half = ceil(n / 2). */
function expected(n: number, direction: 'clockwise' | 'reverse') {
  const half = Math.ceil(n / 2)
  const first = range(1, half) // down one side, in order
  const rest = reversed(range(half + 1, n)) // up the other side: the last topic is at the top
  return direction === 'clockwise' ? { right: first, left: rest } : { left: first, right: rest }
}

describe('Clockwise: the first half goes down the right side, the rest go up the left side', () => {
  for (let n = 1; n <= 9; n++) {
    it(`${n} main topic${n === 1 ? '' : 's'}`, () => {
      const { doc, root, mains } = map(n)
      expect(sides(scene(doc, root, 'clockwise'), mains)).toEqual(expected(n, 'clockwise'))
    })
  }

  it('worked example, 5 topics: 1, 2, 3 down the right, then 4 at the bottom of the left and 5 above it', () => {
    const { doc, root, mains } = map(5)
    expect(sides(scene(doc, root, 'clockwise'), mains)).toEqual({ right: [1, 2, 3], left: [5, 4] })
  })

  it('worked example, 4 topics: 1, 2 down the right; 4 at the top left, 3 below it', () => {
    const { doc, root, mains } = map(4)
    expect(sides(scene(doc, root, 'clockwise'), mains)).toEqual({ right: [1, 2], left: [4, 3] })
  })
})

describe('Reverse (anticlockwise): the mirror of Clockwise', () => {
  for (let n = 1; n <= 9; n++) {
    it(`${n} main topic${n === 1 ? '' : 's'}`, () => {
      const { doc, root, mains } = map(n)
      const got = sides(scene(doc, root, 'reverse'), mains)
      expect(got).toEqual(expected(n, 'reverse'))
      // It is Clockwise with the sides swapped.
      const cw = sides(scene(doc, root, 'clockwise'), mains)
      expect(got).toEqual({ left: cw.right, right: cw.left })
    })
  }

  it('worked example, 5 topics: 1, 2, 3 down the left; 5 at the top right, 4 below it', () => {
    const { doc, root, mains } = map(5)
    expect(sides(scene(doc, root, 'reverse'), mains)).toEqual({ left: [1, 2, 3], right: [5, 4] })
  })
})

describe('Balanced is exactly what it always was', () => {
  for (let n = 1; n <= 9; n++) {
    it(`${n} main topic${n === 1 ? '' : 's'}: choosing Balanced changes nothing`, () => {
      const { doc, root } = map(n, 2)
      const plain = scene(doc, root)
      const balanced = scene(doc, root, 'balanced')
      expect(JSON.stringify([...balanced.boxes])).toBe(JSON.stringify([...plain.boxes]))
      expect(JSON.stringify(balanced.edges)).toBe(JSON.stringify(plain.edges))
    })
  }

  it('fills the right side first, then the left, both reading top to bottom (height balanced)', () => {
    const { doc, root, mains } = map(6)
    expect(sides(scene(doc, root, 'balanced'), mains)).toEqual({ right: [1, 2, 3], left: [4, 5, 6] })
  })
})

describe('switching is lossless and never touches the stored order', () => {
  it('Balanced, then Clockwise, then Balanced again gives the original picture, topic for topic', () => {
    const { doc, root } = map(7, 3)
    const before = JSON.stringify([...scene(doc, root, 'balanced').boxes])
    scene(doc, root, 'clockwise')
    scene(doc, root, 'reverse')
    expect(JSON.stringify([...scene(doc, root, 'balanced').boxes])).toBe(before)
  })

  it('the stored children of the central topic are in the same order whatever direction is shown', () => {
    const { doc, root, mains } = map(6)
    const stored = () => snapshotTopics(doc)[root]
    scene(doc, root, 'clockwise')
    scene(doc, root, 'reverse')
    expect(Object.values(snapshotTopics(doc)).filter((t) => t.parentId === root).map((t) => t.id)).toEqual(mains)
    void stored
  })

  it('a topic keeps its own colour branch (by its place in the stored order) under every direction', () => {
    const { doc, root, mains } = map(5)
    const branchOf = (d: BranchDirection) => mains.map((id) => scene(doc, root, d).boxes.get(id)!.branch)
    expect(branchOf('clockwise')).toEqual(branchOf('balanced'))
    expect(branchOf('reverse')).toEqual(branchOf('balanced'))
  })
})

describe('sub-topics stay on the side of their main topic', () => {
  for (const direction of ['balanced', 'clockwise', 'reverse'] as const) {
    it(direction, () => {
      const { doc, root, mains, subs } = map(5, 3)
      const s = scene(doc, root, direction)
      mains.forEach((m, i) => {
        const side = s.boxes.get(m)!.side
        for (const sub of subs[i] as string[]) {
          const b = s.boxes.get(sub)!
          expect(b.side).toBe(side)
          const parent = s.boxes.get(m)!
          // outward of its parent
          if (side === 'right') expect(b.x).toBeGreaterThanOrEqual(parent.x + parent.w)
          else expect(b.x + b.w).toBeLessThanOrEqual(parent.x)
        }
      })
    })
  }

  it('nothing overlaps under any direction', () => {
    for (const direction of ['balanced', 'clockwise', 'reverse'] as const) {
      const { doc, root } = map(6, 3)
      const b = [...scene(doc, root, direction).boxes.values()]
      for (let i = 0; i < b.length; i++)
        for (let j = i + 1; j < b.length; j++) {
          const p = b[i]!
          const q = b[j]!
          expect(p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h, `${direction}: ${p.id} and ${q.id}`).toBe(false)
        }
    }
  })
})

describe('a new main topic follows the rule', () => {
  it('Clockwise: topics 1 to 5 are on the sides they should be, then a 6th is added and the picture is the rule for 6', () => {
    const { doc, root, mains } = map(5)
    expect(sides(scene(doc, root, 'clockwise'), mains)).toEqual({ right: [1, 2, 3], left: [5, 4] })
    mains.push(addChild(doc, root, 'T6'))
    expect(sides(scene(doc, root, 'clockwise'), mains)).toEqual(expected(6, 'clockwise'))
    expect(expected(6, 'clockwise')).toEqual({ right: [1, 2, 3], left: [6, 5, 4] })
  })

  it('Reverse: adding a 7th main topic', () => {
    const { doc, root, mains } = map(6)
    mains.push(addChild(doc, root, 'T7'))
    expect(sides(scene(doc, root, 'reverse'), mains)).toEqual({ left: [1, 2, 3, 4], right: [7, 6, 5] })
  })
})

describe('a stored side (an imported map)', () => {
  const setSide = (doc: ReturnType<typeof createMapDoc>, id: string, side: 'left' | 'right') => doc.ydoc.transact(() => doc.topics.set(id, { ...doc.topics.get(id)!, side }))

  it('is kept under Balanced, ignored while Clockwise or Reverse is chosen, and comes back with Balanced (nothing is overwritten)', () => {
    const { doc, root, mains } = map(4)
    setSide(doc, mains[0] as string, 'left') // topic 1 was on the left in the original file
    const balanced = sides(scene(doc, root, 'balanced'), mains)
    expect(balanced.left).toContain(1)
    expect(sides(scene(doc, root, 'clockwise'), mains)).toEqual({ right: [1, 2], left: [4, 3] })
    expect(sides(scene(doc, root, 'balanced'), mains)).toEqual(balanced)
    expect(snapshotTopics(doc)[mains[0] as string]?.side).toBe('left')
  })
})

describe('only the two-sided Mind map uses it', () => {
  it('Right only, Left only, Top-down, Tree and the rest are drawn exactly as before', () => {
    for (const layout of ['mindmap:right', 'mindmap:left', 'mindmap:down', 'mindmap:up', 'tree:right', 'org:down', 'circular']) {
      const { doc, root } = map(5, 2)
      const plain = scene(doc, root, undefined, layout)
      const clock = scene(doc, root, 'clockwise', layout)
      expect(JSON.stringify([...clock.boxes]), layout).toBe(JSON.stringify([...plain.boxes]))
    }
  })
})
