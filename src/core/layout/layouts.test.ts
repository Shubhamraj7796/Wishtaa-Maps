import { describe, expect, it } from 'vitest'
import { addChild, setImage } from '../model/commands'
import { createMapDoc, ensureRoot, snapshotTopics, type MapDoc } from '../model/doc'
import type { TopicData } from '../model/topic'
import { LAYOUTS, layoutDef, isLayoutId, LAYOUT_GROUPS } from './catalog'
import { buildScene, type Scene, type SceneOptions } from './engine'

const NONE = new Set<string>()

function sample(branches = 4, kids = 3, leaves = 2) {
  const doc = createMapDoc()
  const root = ensureRoot(doc)
  const ids = { root, branches: [] as string[], kids: [] as string[], leaves: [] as string[] }
  for (let i = 0; i < branches; i++) {
    const b = addChild(doc, root, `Branch ${i}`)
    ids.branches.push(b)
    for (let j = 0; j < kids; j++) {
      const k = addChild(doc, b, `Child ${i}.${j}`)
      ids.kids.push(k)
      for (let l = 0; l < leaves; l++) ids.leaves.push(addChild(doc, k, `Leaf ${l}`))
    }
  }
  return { doc, ...ids }
}

const scene = (doc: MapDoc, root: string, layout: string, over: Partial<SceneOptions> = {}): Scene =>
  buildScene(snapshotTopics(doc), { rootId: root, maxDepth: null, focusId: null, reveal: NONE, layout, ...over })

function overlapping(s: Scene, tolerance = 0.5) {
  const b = [...s.boxes.values()]
  const hits: string[] = []
  for (let i = 0; i < b.length; i++)
    for (let j = i + 1; j < b.length; j++) {
      const p = b[i] as (typeof b)[number]
      const q = b[j] as (typeof b)[number]
      if (p.x + tolerance < q.x + q.w && q.x + tolerance < p.x + p.w && p.y + tolerance < q.y + q.h && q.y + tolerance < p.y + p.h)
        hits.push(`${p.id}~${q.id}`)
    }
  return hits
}

describe('layout catalog', () => {
  it('offers every layout family the spec asks for', () => {
    expect(LAYOUTS.length).toBeGreaterThanOrEqual(20)
    for (const g of ['Mind map', 'Tree map', 'Timeline', 'Org chart', 'Fishbone', 'Tree table', 'Other']) {
      expect(LAYOUT_GROUPS).toContain(g)
    }
    const ids = LAYOUTS.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ['mindmap:both', 'mindmap:left', 'mindmap:right', 'mindmap:down', 'mindmap:up', 'circular', 'bubble', 'sector', 'bracket:right']) {
      expect(isLayoutId(id)).toBe(true)
    }
    expect(isLayoutId('nonsense')).toBe(false)
    expect(layoutDef('nonsense').id).toBe('mindmap:both')
  })
})

describe.each(LAYOUTS.map((l) => l.id))('layout %s', (layout) => {
  const { doc, root } = sample()
  const total = Object.keys(snapshotTopics(doc)).length

  it('places every topic with finite numbers and a depth-first order', () => {
    const s = scene(doc, root, layout)
    expect(s.boxes.size).toBe(total)
    expect(s.order).toHaveLength(total)
    expect(new Set(s.order).size).toBe(total)
    for (const b of s.boxes.values()) {
      for (const v of [b.x, b.y, b.w, b.h]) expect(Number.isFinite(v)).toBe(true)
      expect(b.w).toBeGreaterThan(0)
      expect(b.h).toBeGreaterThan(0)
    }
    expect(s.boxes.get(root)?.side).toBe('root')
  })

  it('does not overlap topics (bubbles may touch)', () => {
    expect(overlapping(scene(doc, root, layout))).toEqual([])
  })

  it('is deterministic', () => {
    const a = scene(doc, root, layout)
    const b = scene(doc, root, layout)
    expect([...a.boxes.values()]).toEqual([...b.boxes.values()])
    expect(a.edges).toEqual(b.edges)
  })

  it('connects every non-root topic to its parent (where the layout draws connectors)', () => {
    const s = scene(doc, root, layout)
    const kind = layoutDef(layout).family
    if (kind === 'table' || kind === 'sector' || kind === 'bracket' || kind === 'timeline' || kind === 'fishbone') return
    const withParent = new Set(s.edges.map((e) => e.to))
    for (const id of s.order) if (id !== root) expect(withParent.has(id)).toBe(true)
  })

  it('hides collapsed branches and reports how many', () => {
    const s = scene(doc, root, layout, { maxDepth: 1 })
    expect(s.boxes.size).toBe(1 + 4)
    expect(s.hidden.size).toBe(4)
    expect([...s.hidden.values()].every((n) => n > 0)).toBe(true)
  })

  it('lays out 2,000+ topics quickly', () => {
    const big = sample(23, 9, 9)
    const topics = snapshotTopics(big.doc)
    const t0 = performance.now()
    const s = buildScene(topics, { rootId: big.root, maxDepth: null, focusId: null, reveal: NONE, layout })
    expect(performance.now() - t0).toBeLessThan(1500)
    expect(s.boxes.size).toBe(Object.keys(topics).length)
  })
})

describe('direction and shape of each family', () => {
  const { doc, root, branches, kids } = sample(3, 2, 0)
  const at = (s: Scene, id: string) => s.boxes.get(id) as NonNullable<ReturnType<Scene['boxes']['get']>>

  it('mind map: right-only, left-only, top-down and bottom-up put children on the right side', () => {
    const r = scene(doc, root, 'mindmap:right')
    for (const b of branches) expect(at(r, b).x).toBeGreaterThan(at(r, root).x + at(r, root).w)
    const l = scene(doc, root, 'mindmap:left')
    for (const b of branches) expect(at(l, b).x + at(l, b).w).toBeLessThan(at(l, root).x)
    const d = scene(doc, root, 'mindmap:down')
    for (const b of branches) expect(at(d, b).y).toBeGreaterThan(at(d, root).y + at(d, root).h)
    const u = scene(doc, root, 'mindmap:up')
    for (const b of branches) expect(at(u, b).y + at(u, b).h).toBeLessThan(at(u, root).y)
  })

  it('tree map: every direction, with the chosen connector style', () => {
    const down = scene(doc, root, 'tree:down', { connector: 'curve' })
    expect(at(down, kids[0] as string).y).toBeGreaterThan(at(down, branches[0] as string).y)
    expect(down.edges.every((e) => e.kind === 'curve')).toBe(true)
    expect(scene(doc, root, 'tree:right').edges.every((e) => e.kind === 'elbow')).toBe(true) // default for trees
    expect(scene(doc, root, 'tree:right', { connector: 'straight' }).edges.every((e) => e.kind === 'straight')).toBe(true)
    const left = scene(doc, root, 'tree:left')
    expect(at(left, kids[0] as string).x).toBeLessThan(at(left, branches[0] as string).x)
  })

  it('org chart: top-down rows, left-right columns and a compact outline below the first row', () => {
    const down = scene(doc, root, 'org:down')
    const ys = new Set(branches.map((b) => at(down, b).y))
    expect(ys.size).toBe(1) // one row
    const compact = scene(doc, root, 'org:compact')
    const b0 = at(compact, branches[0] as string)
    const k0 = at(compact, kids[0] as string)
    const k1 = at(compact, kids[1] as string)
    expect(k0.y).toBeGreaterThan(b0.y + b0.h - 1)
    expect(k1.y).toBeGreaterThan(k0.y) // stacked, not side by side
    expect(Math.abs(k0.x - k1.x)).toBeLessThan(1)
    expect(compact.edges.some((e) => e.fromDx !== undefined)).toBe(true)
  })

  it('timeline: topics alternate above and below a spine', () => {
    const h = scene(doc, root, 'timeline:horizontal')
    const sides = branches.map((b) => (at(h, b).y + at(h, b).h / 2 < 0 ? 'above' : 'below'))
    expect(sides).toEqual(['above', 'below', 'above'])
    const spine = h.decor.find((d) => d.kind === 'line' && d.y1 === 0 && d.y2 === 0)
    expect(spine).toBeTruthy()
    expect(h.decor.filter((d) => d.kind === 'line').length).toBe(branches.length + 1) // one stem each + spine
    const v = scene(doc, root, 'timeline:vertical')
    const vs = branches.map((b) => (at(v, b).x + at(v, b).w / 2 < 0 ? 'left' : 'right'))
    expect(vs).toEqual(['right', 'left', 'right'])
  })

  it('fishbone: the two orientations are mirror images', () => {
    const l = scene(doc, root, 'fishbone:left')
    const r = scene(doc, root, 'fishbone:right')
    for (const id of l.order) {
      const a = at(l, id)
      const b = at(r, id)
      expect(b.x).toBeCloseTo(-(a.x + a.w))
      expect(b.y).toBeCloseTo(a.y)
    }
    expect(l.decor.filter((d) => d.kind === 'line').length).toBeGreaterThan(0)
  })

  it('tree table: levels are columns (or rows) and parents span their children', () => {
    const rows = scene(doc, root, 'table:rows')
    const b0 = at(rows, branches[0] as string)
    const k0 = at(rows, kids[0] as string)
    const k1 = at(rows, kids[1] as string)
    expect(k0.x).toBeGreaterThan(b0.x)
    expect(b0.y).toBeLessThanOrEqual(k0.y + 0.001)
    expect(b0.y + b0.h).toBeGreaterThanOrEqual(k1.y + k1.h - 0.001) // parent cell covers both children
    expect(rows.edges).toEqual([])
    const cols = scene(doc, root, 'table:columns')
    expect(at(cols, kids[0] as string).y).toBeGreaterThan(at(cols, branches[0] as string).y)
  })

  it('circular and sector: levels sit on rings; sector adds one wedge per main branch', () => {
    const c = scene(doc, root, 'circular')
    const centre = (id: string) => ({ x: at(c, id).x + at(c, id).w / 2, y: at(c, id).y + at(c, id).h / 2 })
    const dist = (id: string) => Math.hypot(centre(id).x, centre(id).y)
    expect(dist(root)).toBeLessThan(1)
    const r1 = branches.map(dist)
    expect(Math.max(...r1) - Math.min(...r1)).toBeLessThan(1)
    expect(dist(kids[0] as string)).toBeGreaterThan(r1[0] as number)
    const s = scene(doc, root, 'sector')
    expect(s.decor.filter((d) => d.kind === 'wedge')).toHaveLength(branches.length)
    expect(s.edges).toEqual([])
  })

  it('bubble map: uses ellipse bubbles unless a topic or theme says otherwise', () => {
    const b = scene(doc, root, 'bubble')
    expect(b.layoutShape).toBe('ellipse')
    expect(b.edges.length).toBeGreaterThan(0)
  })

  it('bracket map: braces group each parent’s children instead of lines', () => {
    const b = scene(doc, root, 'bracket:right')
    expect(b.edges).toEqual([])
    const braces = b.decor.filter((d) => d.kind === 'brace')
    expect(braces.length).toBe(1 + branches.length) // root + each branch that has children
    const left = scene(doc, root, 'bracket:left')
    expect(left.decor.every((d) => d.kind !== 'brace' || d.dir === 'l')).toBe(true)
  })
})

describe('bubble map spacing', () => {
  it('keeps bubbles apart even for large maps and leaves the central topic in the middle', () => {
    const { doc, root } = sample(8, 5, 4)
    const s = scene(doc, root, 'bubble')
    expect(overlapping(s)).toEqual([])
    const r = s.boxes.get(root)
    expect((r?.x ?? 1) + (r?.w ?? 0) / 2).toBeCloseTo(0)
    expect((r?.y ?? 1) + (r?.h ?? 0) / 2).toBeCloseTo(0)
  })
})

describe('layout options', () => {
  const { doc, root, branches, kids } = sample(3, 3, 1)
  const b = (s: Scene) => s.bounds

  it('spacing widens or tightens the layout', () => {
    const tight = b(scene(doc, root, 'mindmap:right', { spacing: 0.6 }))
    const loose = b(scene(doc, root, 'mindmap:right', { spacing: 1.8 }))
    expect(loose.h).toBeGreaterThan(tight.h)
    expect(loose.w).toBeGreaterThan(tight.w)
  })

  it('overlap mode packs topics tighter', () => {
    const normal = b(scene(doc, root, 'mindmap:right'))
    const packed = b(scene(doc, root, 'mindmap:right', { overlap: true }))
    expect(packed.h).toBeLessThan(normal.h)
  })

  it('align-with-sibling gives siblings the same width', () => {
    const topics = snapshotTopics(doc)
    const t = Object.values(topics).find((x) => x.id === branches[0]) as TopicData
    doc.topics.set(t.id, { ...t, text: 'A much longer branch title here' })
    const plain = scene(doc, root, 'mindmap:right')
    const widths = new Set(branches.map((id) => plain.boxes.get(id)?.w))
    expect(widths.size).toBeGreaterThan(1)
    const aligned = scene(doc, root, 'mindmap:right', { alignSiblings: true })
    expect(new Set(branches.map((id) => aligned.boxes.get(id)?.w)).size).toBe(1)
  })

  it('a branch can use its own direction (but not the opposite of its parent)', () => {
    const k = doc.topics.get(branches[1] as string) as TopicData
    doc.topics.set(k.id, { ...k, branchDir: 'down' })
    const s = scene(doc, root, 'tree:right')
    const parent = s.boxes.get(branches[1] as string) as NonNullable<ReturnType<Scene['boxes']['get']>>
    const child = s.boxes.get(kids[3] as string) as NonNullable<ReturnType<Scene['boxes']['get']>>
    expect(child.y).toBeGreaterThan(parent.y + parent.h - 1) // fans downward
    expect(overlapping(s)).toEqual([])
    doc.topics.set(k.id, { ...k, branchDir: 'left' }) // opposite of "right": ignored
    const ignored = scene(doc, root, 'tree:right')
    const ch = ignored.boxes.get(kids[3] as string) as NonNullable<ReturnType<Scene['boxes']['get']>>
    const pa = ignored.boxes.get(branches[1] as string) as NonNullable<ReturnType<Scene['boxes']['get']>>
    expect(ch.x).toBeGreaterThan(pa.x + pa.w)
  })

  it('manual offsets move a whole branch, only when free positioning is on', () => {
    const t = doc.topics.get(branches[2] as string) as TopicData
    doc.topics.set(t.id, { ...t, offset: { x: 100, y: -40 } })
    const off = scene(doc, root, 'mindmap:right')
    const on = scene(doc, root, 'mindmap:right', { freePositioning: true })
    const a = off.boxes.get(branches[2] as string) as NonNullable<ReturnType<Scene['boxes']['get']>>
    const c = on.boxes.get(branches[2] as string) as NonNullable<ReturnType<Scene['boxes']['get']>>
    expect(c.x - a.x).toBeCloseTo(100)
    expect(c.y - a.y).toBeCloseTo(-40)
    const kidOff = off.boxes.get(kids[6] as string) as NonNullable<ReturnType<Scene['boxes']['get']>>
    const kidOn = on.boxes.get(kids[6] as string) as NonNullable<ReturnType<Scene['boxes']['get']>>
    expect(kidOn.x - kidOff.x).toBeCloseTo(100) // descendants travel with it
  })

  it('shapes that need more room make bigger boxes', () => {
    const plain = scene(doc, root, 'mindmap:right')
    const ell = scene(doc, root, 'mindmap:right', { shapeOf: () => 'ellipse' })
    const dia = scene(doc, root, 'mindmap:right', { shapeOf: () => 'diamond' })
    const id = branches[0] as string
    expect(ell.boxes.get(id)?.w).toBeGreaterThan(plain.boxes.get(id)?.w as number)
    expect(dia.boxes.get(id)?.w).toBeGreaterThan(ell.boxes.get(id)?.w as number)
  })

  it('font size changes the box size', () => {
    const t = doc.topics.get(branches[0] as string) as TopicData
    const before = scene(doc, root, 'mindmap:right').boxes.get(t.id) as NonNullable<ReturnType<Scene['boxes']['get']>>
    doc.topics.set(t.id, { ...t, style: { fontSize: 28 } })
    const after = scene(doc, root, 'mindmap:right').boxes.get(t.id) as NonNullable<ReturnType<Scene['boxes']['get']>>
    expect(after.h).toBeGreaterThan(before.h)
    expect(after.w).toBeGreaterThan(before.w)
  })

  it('images make topics taller in any layout', () => {
    const fresh = sample(2, 1, 0)
    const plain = scene(fresh.doc, fresh.root, 'org:down').boxes.get(fresh.branches[0] as string)
    setImage(fresh.doc, fresh.branches[0] as string, { imageId: 'i', width: 200, height: 120 })
    const withImg = scene(fresh.doc, fresh.root, 'org:down').boxes.get(fresh.branches[0] as string)
    expect(withImg?.h).toBeGreaterThan((plain?.h as number) + 100)
  })

  it('floating topics are laid out as their own trees in every layout', () => {
    const d = createMapDoc()
    const r = ensureRoot(d)
    addChild(d, r, 'A')
    d.topics.set('float-1', { id: 'float-1', parentId: null, order: 0, text: 'Float', collapsed: false, style: {}, marks: [], note: '', tags: [], task: null, link: null, floatingPosition: { x: 900, y: 700 } })
    for (const l of LAYOUTS.map((x) => x.id)) {
      const s = buildScene(snapshotTopics(d), { rootId: r, maxDepth: null, focusId: null, reveal: NONE, layout: l })
      const f = s.boxes.get('float-1')
      expect(f).toBeTruthy()
      expect((f?.x ?? 0) + (f?.w ?? 0) / 2).toBeCloseTo(900, 0)
    }
  })
})
