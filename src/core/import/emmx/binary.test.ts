import { readFileSync } from 'node:fs'
import { strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { parseBinaryPage } from './binpage'
import { EmmxError, parseEmmx, type ImportedTopic, type EmmxProgress } from './parse'

/**
 * IND AS 116 was saved by a newer EdrawMind: its page is `mmpage/page.bin` (binary) instead of `page/page.xml`, and its pictures
 * are numbered in `rels/page_formats.xml`. The importer used to say "This file has no pages we can read".
 */
const file = () => new Uint8Array(readFileSync('tests/fixtures/IND_AS_116.emmx'))

const flat = (t: ImportedTopic): ImportedTopic[] => [t, ...t.children.flatMap(flat)]

describe('IND AS 116 (a newer EdrawMind file, 13 MB)', () => {
  it('imports as one map with the whole tree and every picture', async () => {
    const r = await parseEmmx(file())
    expect(r.maps).toHaveLength(1)
    const root = (r.maps[0] as { root: ImportedTopic }).root
    expect(root.text).toBe('IND AS 116\nLeases')
    expect(root.children).toHaveLength(6) // six main topics
    const all = flat(root)
    expect(all).toHaveLength(29) // the central topic and 28 topics
    expect(all.slice(1).every((t) => !!t.image)).toBe(true) // each of the 28 has its picture
    expect(r.stats.topics).toBe(29)
    expect(r.images.size).toBe(28)
    expect(r.stats.skippedImages).toBe(0)
  })

  it('keeps the shape of the tree: main topics under the centre, subtopics under their own main topic', async () => {
    const root = ((await parseEmmx(file())).maps[0] as { root: ImportedTopic }).root
    // As saved: the six main topics have 0, 2, 2, 1, 4 and 4 subtopics directly under them, and branches go three levels deeper.
    expect(root.children.map((c) => c.children.length)).toEqual([0, 2, 2, 1, 4, 4])
    const depth = (t: ImportedTopic): number => 1 + Math.max(0, ...t.children.map(depth))
    expect(depth(root)).toBe(5)
    expect(root.children.map((c) => flat(c).length).reduce((a, b) => a + b, 0)).toBe(28) // nothing is left dangling at the top
  })

  it('clears the default "Main Topic" / "Subtopic" texts on topics that have a picture, unless asked not to', async () => {
    const cleared = flat(((await parseEmmx(file())).maps[0] as { root: ImportedTopic }).root).slice(1)
    expect(cleared.every((t) => t.text === '')).toBe(true)
    const kept = flat(((await parseEmmx(file(), { clearPlaceholderText: false })).maps[0] as { root: ImportedTopic }).root).slice(1)
    expect(kept.filter((t) => t.text === 'Main Topic')).toHaveLength(6)
    expect(kept.filter((t) => t.text === 'Subtopic')).toHaveLength(22)
  })

  it('says what was and was not imported', async () => {
    const r = await parseEmmx(file())
    expect(r.warnings.join('\n')).toMatch(/newer EdrawMind[\s\S]*colours, shapes, line styles and positions were not/)
  })

  it('reports progress picture by picture, in order, and gives the browser a turn between them', async () => {
    const seen: EmmxProgress[] = []
    let turns = 0
    const timer = setInterval(() => turns++, 1)
    await parseEmmx(file(), { onProgress: (p) => seen.push(p) })
    clearInterval(timer)
    expect(seen[0]).toMatchObject({ phase: 'reading' })
    const pics = seen.filter((p) => p.phase === 'pictures')
    expect(pics).toHaveLength(28)
    expect(pics.map((p) => p.done)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1))
    expect(pics.every((p) => p.total === 28)).toBe(true)
    expect(turns).toBeGreaterThan(0) // timers ran while the import was going: it did not hold the page for its whole duration
  })

  it('reads the whole 13 MB file in a reasonable time', async () => {
    const t0 = performance.now()
    await parseEmmx(file())
    expect(performance.now() - t0).toBeLessThan(15_000)
  })
})

describe('the binary page reader', () => {
  const page = () => (unzipSync(file(), { filter: (f) => f.name === 'mmpage/page.bin' })['mmpage/page.bin'] as Uint8Array)

  it('finds the 29 topics with their parents and picture numbers, and skips the branch connectors', () => {
    const topics = parseBinaryPage(page())
    expect(topics).toHaveLength(29)
    expect(topics[0]).toMatchObject({ id: 101, parent: null, paragraphs: ['IND AS 116', 'Leases'], picture: null })
    expect(topics.slice(1).map((t) => t.picture)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1))
    expect(topics.filter((t) => t.parent === 101)).toHaveLength(6)
    const ids = new Set(topics.map((t) => t.id))
    expect(topics.slice(1).every((t) => t.parent !== null && ids.has(t.parent))).toBe(true) // every parent is a real topic
  })

  it('never throws on damaged or empty data: it just finds nothing', () => {
    expect(parseBinaryPage(new Uint8Array(0))).toEqual([])
    expect(parseBinaryPage(new Uint8Array(500).fill(1))).toEqual([])
    const cut = page().subarray(0, 700)
    expect(() => parseBinaryPage(cut)).not.toThrow()
    const noise = new Uint8Array(4000).map((_, i) => (i * 131 + 7) & 0xff)
    expect(() => parseBinaryPage(noise)).not.toThrow()
  })
})

describe('a binary page that cannot be read gives a clear message', () => {
  it('a .emmx with an unreadable binary page says so, instead of "no pages we can read"', async () => {
    const zip = zipSync({
      'document.xml': strToU8('<Document><Properties><Pages V="page"/></Properties></Document>'),
      'mmpage/page.bin': new Uint8Array(200).fill(7),
    })
    const err = await parseEmmx(zip).catch((e) => e)
    expect(err).toBeInstanceOf(EmmxError)
    expect((err as Error).message).toMatch(/newer binary format/)
    expect((err as Error).message).not.toMatch(/no pages we can read/)
  })

  it('a file with no pages at all still says so', async () => {
    const err = await parseEmmx(zipSync({ 'document.xml': strToU8('<Document/>') })).catch((e) => e)
    expect((err as Error).message).toMatch(/no pages we can read/)
  })
})
