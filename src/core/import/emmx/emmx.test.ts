import { readFileSync } from 'node:fs'
import { strToU8, zipSync } from 'fflate'
import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { buildScene } from '../../layout/mindmap'
import { createMapDoc, snapshotTopics } from '../../model/doc'
import { buildMapContent } from './build'
import { parseEmmxColor } from './color'
import { detectImage, displaySize, sha256Hex } from './images'
import { EmmxError, parseEmmx, type ImportedTopic } from './parse'
import { parseXml, XmlError } from './xml'
import { resolveMediaTarget } from './zip'

const FIXTURE = 'tests/fixtures/IND_AS_2.emmx'
const sample = () => new Uint8Array(readFileSync(FIXTURE))

import { basicShapes, connector, doc, gif, jpeg, page, png, rels, simple, topic, webpLossless, zip } from './testkit'

const flat = (t: ImportedTopic): ImportedTopic[] => [t, ...t.children.flatMap(flat)]

// ----------------------------------------------------------------------------------------------------------------

describe('the sample file (IND_AS_2.emmx)', () => {
  it('becomes one map: a central topic, 3 main topics and 5 subtopics', async () => {
    const r = await parseEmmx(sample())
    expect(r.maps).toHaveLength(1)
    const m = r.maps[0]!
    expect(m.name).toBe('Page-1')
    expect(m.root.text).toBe('IND AS 2')
    expect(m.root.children).toHaveLength(3)
    const subs = m.root.children.flatMap((c) => flat(c).slice(1))
    expect(subs).toHaveLength(5)
    expect(r.stats).toMatchObject({ pages: 1, topics: 9, images: 8, duplicateImages: 0, skippedImages: 0 })
    expect(r.stats.unknownTypes).toEqual({})
    expect(r.warnings).toEqual([])
  })

  it('puts main topics on the left or right from their position in the original', async () => {
    const { maps } = await parseEmmx(sample())
    expect(maps[0]!.root.children.map((c) => c.side)).toEqual(['right', 'left', 'left'])
  })

  it('keeps the original bytes of every picture, detected as PNG from the first bytes, with their pixel sizes', async () => {
    const { images } = await parseEmmx(sample())
    expect(images.size).toBe(8)
    const original = new Map<string, Uint8Array>()
    const { unzipSync } = await import('fflate')
    for (const [n, b] of Object.entries(unzipSync(sample()))) if (n.startsWith('media/')) original.set(n, b)
    const originalHashes = new Set(await Promise.all([...original.values()].map((b) => sha256Hex(b))))
    for (const img of images.values()) {
      expect(img.type).toBe('image/png')
      expect(originalHashes.has(img.hash)).toBe(true) // unchanged bytes
      expect(img.needsDownscale).toBe(false)
      expect(img.width).toBeGreaterThan(100)
    }
  })

  it('gives every topic its picture at the displayed size, and clears the placeholder texts', async () => {
    const { maps } = await parseEmmx(sample())
    const topics = flat(maps[0]!.root).slice(1)
    for (const t of topics) {
      expect(t.image).toBeTruthy()
      expect(t.text).toBe('') // "Main Topic" / "Subtopic" were placeholders
      expect(t.image!.width).toBeGreaterThanOrEqual(40)
      expect(t.image!.width).toBeLessThanOrEqual(1200)
    }
    expect(maps[0]!.root.children[0]!.image).toMatchObject({ width: 713, height: 458 })
    expect(maps[0]!.root.text).toBe('IND AS 2') // real text stays
  })

  it('keeps the placeholder texts when the option is off', async () => {
    const { maps } = await parseEmmx(sample(), { clearPlaceholderText: false })
    expect(maps[0]!.root.children.map((c) => c.text)).toEqual(['Main Topic', 'Main Topic', 'Main Topic'])
  })

  it('imports the original colours: fill, branch colour, and a font size (and no text colour when it is the default)', async () => {
    const { maps } = await parseEmmx(sample())
    const root = maps[0]!.root
    expect(root.style.fill).toBe('#00af54') // "#ff00af54": alpha first
    expect(root.children.map((c) => c.style.lineColor)).toEqual(['#ff7575', '#5fb7f1', '#ffcd55'])
    expect(root.children[0]!.style.border).toBe('#ff7575')
    expect(root.style.textColor).toBeUndefined()
    expect(root.children[0]!.style.fontSize).toBe(16) // 12 pt
  })

  it('writes a map the editor can open, with the pictures referenced by id', async () => {
    const { maps, images } = await parseEmmx(sample())
    const ids = new Map([...images.keys()].map((h) => [h, `img-${h.slice(0, 8)}`]))
    const content = buildMapContent(maps[0]!, (h) => ids.get(h))
    const d = createMapDoc()
    Y.applyUpdate(d.ydoc, content, 'load')
    const topics = Object.values(snapshotTopics(d))
    expect(topics).toHaveLength(9)
    expect(topics.filter((t) => t.image).length).toBe(8)
    expect(new Set(topics.flatMap((t) => (t.image ? [t.image.imageId] : []))).size).toBe(8)
    expect(topics.find((t) => t.parentId === null)?.text).toBe('IND AS 2')
  })
})

describe('structure and text', () => {
  it('builds the tree from the SubLevel lists, in order, and keeps multi-paragraph text', async () => {
    const shapes =
      topic({ id: 1, type: 'MainIdea', text: 'Root', cx: 500, sub: [3, 2] }) + topic({ id: 2, type: 'MainTopic', text: 'second', cx: 700 }) + topic({ id: 3, type: 'MainTopic', text: 'line one\nline two', cx: 300 })
    const r = await parseEmmx(simple(shapes))
    expect(r.maps[0]!.root.children.map((c) => c.text)).toEqual(['line one\nline two', 'second'])
  })

  it('decodes XML entities in text', async () => {
    const r = await parseEmmx(simple(topic({ id: 1, type: 'MainIdea', text: 'A &amp; B &lt;c&gt; &#65;&#x42;' })))
    expect(r.maps[0]!.root.text).toBe('A & B <c> AB')
  })

  it('uses the topic\'s own Super when a parent list is missing, and ignores connectors', async () => {
    const shapes = topic({ id: 1, type: 'MainIdea', text: 'Root', cx: 500 }) + topic({ id: 2, type: 'MainTopic', text: 'orphan', cx: 100, superId: 1 }) + topic({ id: 3, type: 'SubTopic', text: 'grandchild', superId: 2 }) + connector(9, '#ff000000')
    const r = await parseEmmx(simple(shapes))
    expect(r.maps[0]!.root.children[0]!.text).toBe('orphan')
    expect(r.maps[0]!.root.children[0]!.children[0]!.text).toBe('grandchild')
    expect(r.warnings).toEqual([])
  })

  it('reports shapes that cannot be placed instead of failing', async () => {
    const shapes = topic({ id: 1, type: 'MainIdea', text: 'Root' }) + topic({ id: 2, type: 'MainTopic', text: 'lost' })
    const r = await parseEmmx(simple(shapes))
    expect(r.maps[0]!.root.children).toEqual([])
    expect(r.warnings.join('|')).toMatch(/1 topic could not be placed/)
  })

  it('survives loops and links to missing shapes', async () => {
    const shapes = topic({ id: 1, type: 'MainIdea', text: 'Root', sub: [2, 99] }) + topic({ id: 2, type: 'MainTopic', text: 'a', sub: [1, 2] })
    const r = await parseEmmx(simple(shapes))
    expect(r.maps[0]!.root.children).toHaveLength(1)
    expect(r.maps[0]!.root.children[0]!.children).toEqual([])
    expect(r.warnings.join('|')).toMatch(/reference.*missing/)
    expect(r.warnings.join('|')).toMatch(/repeated link/)
  })

  it('handles a very deep tree without overflowing the stack', async () => {
    let shapes = topic({ id: 1, type: 'MainIdea', text: 'Root', sub: [2] })
    for (let i = 2; i < 3000; i++) shapes += topic({ id: i, type: 'SubTopic', text: `n${i}`, sub: [i + 1] })
    shapes += topic({ id: 3000, type: 'SubTopic', text: 'end' })
    const r = await parseEmmx(simple(shapes))
    expect(r.stats.topics).toBe(3000)
    // Building the Wishtaa map is iterative too.
    expect(() => buildMapContent(r.maps[0]!, () => undefined)).not.toThrow()
  })
})

describe('colours and fonts', () => {
  it('reads #AARRGGBB with alpha first and ignores transparent values', () => {
    expect(parseEmmxColor('#ff00af54')).toBe('#00af54')
    expect(parseEmmxColor('#80FF0000')).toBe('#ff0000')
    expect(parseEmmxColor('#00ffffff')).toBeNull()
    expect(parseEmmxColor('#454545')).toBe('#454545')
    expect(parseEmmxColor('nope')).toBeNull()
    expect(parseEmmxColor(undefined)).toBeNull()
  })

  it('maps fill, border, branch colour, font size and a chosen text colour', async () => {
    const r = await parseEmmx(simple(basicShapes({ main1: { fill: '#ff123456', line: '#ffabcdef', size: 15, charColor: '#ff0000' } })))
    const t = r.maps[0]!.root.children[0]!
    expect(t.style).toEqual({ fill: '#123456', border: '#abcdef', lineColor: '#ff0000', textColor: '#ff0000', fontSize: 20 })
  })

  it('takes the branch colour from the connector that leads to the topic, and falls back to the topic\'s own line', async () => {
    const r = await parseEmmx(simple(basicShapes({ main2: { toSuper: 777, line: '#ff010203' } })))
    expect(r.maps[0]!.root.children[0]!.style.lineColor).toBe('#ff0000')
    expect(r.maps[0]!.root.children[1]!.style.lineColor).toBe('#010203')
  })

  it('ignores fully transparent colours', async () => {
    const r = await parseEmmx(simple(basicShapes({ main1: { fill: '#00ff0000', line: '#00ff0000', toSuper: 777 } })))
    expect(r.maps[0]!.root.children[0]!.style).toEqual({ fontSize: 16 })
  })
})

describe('placeholder text', () => {
  const withImage = (text: string, rid = 'rId1') => simple(basicShapes({ main1: { text, rid } }), { 'rels/page_rels.xml': rels({ rId1: '../media/a.png' }), 'media/a.png': png(10, 10) })

  it.each(['Main Topic', 'Subtopic', 'Central Topic', 'Floating Topic', '  main topic '])('clears "%s" when the topic has a picture', async (text) => {
    const r = await parseEmmx(withImage(text))
    expect(r.maps[0]!.root.children[0]!.text).toBe('')
  })

  it('keeps real text, even with a picture', async () => {
    const r = await parseEmmx(withImage('Inventory valuation'))
    expect(r.maps[0]!.root.children[0]!.text).toBe('Inventory valuation')
  })

  it('keeps a placeholder text when there is no picture', async () => {
    const r = await parseEmmx(simple(basicShapes({ main1: { text: 'Main Topic' } })))
    expect(r.maps[0]!.root.children[0]!.text).toBe('Main Topic')
  })
})

describe('pictures', () => {
  const rel = (n: number) => rels(Object.fromEntries(Array.from({ length: n }, (_, i) => [`rId${i + 1}`, `../media/i${i + 1}.png`])))

  it('detects the type from the first bytes, not from the file name', async () => {
    const r = await parseEmmx(
      simple(basicShapes({ main1: { rid: 'rId1' }, main2: { rid: 'rId2' }, sub: { rid: 'rId3' } }), {
        'rels/page_rels.xml': rels({ rId1: '../media/photo.jpg', rId2: '../media/photo.svg', rId3: '../media/photo.gif' }),
        'media/photo.jpg': png(30, 20, 1), // a PNG named .jpg
        'media/photo.svg': jpeg(40, 30), // a JPEG named .svg
        'media/photo.gif': gif(12, 8),
      })
    )
    const types = [...r.images.values()].map((i) => i.type).sort()
    expect(types).toEqual(['image/gif', 'image/jpeg', 'image/png'])
  })

  it('reads the pixel size of PNG, JPEG, GIF and WebP', () => {
    expect(detectImage(png(123, 45))).toEqual({ ok: true, type: 'image/png', width: 123, height: 45 })
    expect(detectImage(jpeg(640, 480))).toEqual({ ok: true, type: 'image/jpeg', width: 640, height: 480 })
    expect(detectImage(gif(200, 100))).toEqual({ ok: true, type: 'image/gif', width: 200, height: 100 })
    expect(detectImage(webpLossless(321, 99))).toEqual({ ok: true, type: 'image/webp', width: 321, height: 99 })
  })

  it('rejects SVG (even with an image name), unknown data and damaged pictures, with warnings', async () => {
    const svg = strToU8('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    const r = await parseEmmx(
      simple(basicShapes({ main1: { rid: 'rId1' }, main2: { rid: 'rId2' }, sub: { rid: 'rId3' } }), {
        'rels/page_rels.xml': rel(3),
        'media/i1.png': svg,
        'media/i2.png': strToU8('just some text, not a picture'),
        'media/i3.png': Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]),
      })
    )
    expect(r.images.size).toBe(0)
    expect(r.stats.skippedImages).toBe(3)
    const w = r.warnings.join('|')
    expect(w).toMatch(/1 SVG image skipped/)
    expect(w).toMatch(/1 image in an unsupported format/)
    expect(w).toMatch(/1 damaged image/)
    for (const t of flat(r.maps[0]!.root)) expect(t.image).toBeUndefined()
  })

  it('stores identical pictures once, however many topics use them', async () => {
    const same = png(50, 40, 7)
    const r = await parseEmmx(
      simple(basicShapes({ main1: { rid: 'rId1' }, main2: { rid: 'rId2' }, sub: { rid: 'rId3' } }), { 'rels/page_rels.xml': rel(3), 'media/i1.png': same, 'media/i2.png': same, 'media/i3.png': png(50, 40, 8) })
    )
    expect(r.images.size).toBe(2)
    expect(r.stats).toMatchObject({ images: 2, duplicateImages: 1 })
    const hashes = flat(r.maps[0]!.root).flatMap((t) => (t.image ? [t.image.hash] : []))
    expect(hashes).toHaveLength(3)
    expect(new Set(hashes).size).toBe(2)
  })

  it('skips pictures over 10 MB and pictures with absurd pixel counts', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1)
    big.set(png(10, 10))
    const r = await parseEmmx(simple(basicShapes({ main1: { rid: 'rId1' }, main2: { rid: 'rId2' } }), { 'rels/page_rels.xml': rel(2), 'media/i1.png': big, 'media/i2.png': png(30000, 30000) }))
    expect(r.images.size).toBe(0)
    const w = r.warnings.join('|')
    expect(w).toMatch(/over 10 MB/)
    expect(w).toMatch(/too many pixels/)
  })

  it('keeps pictures longer than 4000 px as they are but marks them to be reduced, with a warning', async () => {
    const r = await parseEmmx(simple(basicShapes({ main1: { rid: 'rId1' }, main2: { rid: 'rId2' } }), { 'rels/page_rels.xml': rel(2), 'media/i1.png': png(5000, 800), 'media/i2.png': png(4000, 4000, 3) }))
    const imgs = [...r.images.values()]
    expect(imgs.find((i) => i.width === 5000)?.needsDownscale).toBe(true)
    expect(imgs.find((i) => i.width === 4000)?.needsDownscale).toBe(false) // exactly 4000 is left alone
    expect(r.warnings.join('|')).toMatch(/1 image longer than 4000 px will be reduced to 4000 px/)
  })

  it('shows pictures at the original display size, kept within 40 to 1200 px', () => {
    const nat = { width: 800, height: 600 }
    expect(displaySize(713, 458, nat)).toEqual({ width: 713, height: 458 })
    expect(displaySize(2400, 1200, nat)).toEqual({ width: 1200, height: 600 })
    expect(displaySize(10, 5, nat)).toEqual({ width: 40, height: 40 })
    expect(displaySize(null, null, nat)).toEqual({ width: 800, height: 600 })
    expect(displaySize(0, 0, { width: 3000, height: 1000 })).toEqual({ width: 1200, height: 400 })
    expect(displaySize(500, 5000, nat).height).toBeLessThanOrEqual(2400)
  })

  it('warns about a picture that is not in the file, and about extra pictures on one topic', async () => {
    const shapes =
      topic({ id: 1, type: 'MainIdea', text: 'Root', sub: [2] }) +
      topic({ id: 2, type: 'MainTopic', text: 'T', rid: 'rId1', extra: '<Shape ID="55" Type="Image"><Transform><Width V="50"/><Height V="50"/></Transform><Data Res="rId2"/></Shape>' }) +
      topic({ id: 3, type: 'SubTopic', text: 'X', rid: 'rId9' })
    const r = await parseEmmx(simple(shapes, { 'rels/page_rels.xml': rels({ rId1: '../media/i1.png', rId2: '../media/i1.png' }), 'media/i1.png': png(20, 20) }))
    expect(r.warnings.join('|')).toMatch(/1 extra image on a topic skipped/)
    expect(r.maps[0]!.root.children[0]!.image).toBeTruthy()
  })
})

describe('pages', () => {
  it('imports each page as its own map, named after the page', async () => {
    const z = zip({
      'document.xml': doc('page;page2'),
      'page/page.xml': page('Revenue', topic({ id: 1, type: 'MainIdea', text: 'A' })),
      'page/page2.xml': page('Costs', topic({ id: 1, type: 'MainIdea', text: 'B' })),
    })
    const r = await parseEmmx(z)
    expect(r.maps.map((m) => [m.name, m.root.text])).toEqual([['Revenue', 'A'], ['Costs', 'B']])
    expect(r.stats.pages).toBe(2)
  })

  it('gives pages with the same name different names, and uses each page\'s own pictures', async () => {
    const z = zip({
      'document.xml': doc('page;page2'),
      'page/page.xml': page('Same', topic({ id: 1, type: 'MainIdea', text: 'A', rid: 'rId1' })),
      'page/page2.xml': page('Same', topic({ id: 1, type: 'MainIdea', text: 'B', rid: 'rId1' })),
      'rels/page_rels.xml': rels({ rId1: '../media/one.png' }),
      'rels/page2_rels.xml': rels({ rId1: '../media/two.png' }),
      'media/one.png': png(10, 10, 1),
      'media/two.png': png(20, 20, 2),
    })
    const r = await parseEmmx(z)
    expect(r.maps.map((m) => m.name)).toEqual(['Same', 'Same 2'])
    expect(r.images.size).toBe(2)
  })

  it('finds the pages even if document.xml is missing, and warns about a listed page that is missing', async () => {
    const r1 = await parseEmmx(zip({ 'page/page.xml': page('P', topic({ id: 1, type: 'MainIdea', text: 'A' })) }))
    expect(r1.maps).toHaveLength(1)
    const r2 = await parseEmmx(zip({ 'document.xml': doc('page;ghost'), 'page/page.xml': page('P', topic({ id: 1, type: 'MainIdea', text: 'A' })) }))
    expect(r2.maps).toHaveLength(1)
    expect(r2.warnings.join('|')).toMatch(/ghost.*could not be found/)
  })

  it('skips a page that cannot be read and imports the others', async () => {
    const z = zip({ 'document.xml': doc('page;page2'), 'page/page.xml': '<Page><Shape', 'page/page2.xml': page('Good', topic({ id: 1, type: 'MainIdea', text: 'ok' })) })
    const r = await parseEmmx(z)
    expect(r.maps.map((m) => m.name)).toEqual(['Good'])
    expect(r.warnings.join('|')).toMatch(/Page "page" could not be read/)
  })

  it('fails clearly when no page has a central topic', async () => {
    await expect(parseEmmx(zip({ 'page/page.xml': page('P', topic({ id: 2, type: 'MainTopic', text: 'x' })) }))).rejects.toThrow(EmmxError)
  })
})

describe('content that is not supported yet', () => {
  it('skips floating topics, counted, and names the unknown types', async () => {
    const shapes = basicShapes({ extra: topic({ id: 30, type: 'FloatTopic', text: 'loose 1' }) + topic({ id: 31, type: 'FloatTopic', text: 'loose 2' }) + topic({ id: 32, type: 'Callout', text: 'note' }) })
    const r = await parseEmmx(simple(shapes))
    expect(r.warnings).toContain('2 floating topics skipped')
    expect(r.warnings).toContain('1 callout skipped')
    expect(r.stats.unknownTypes).toEqual({ FloatTopic: 2, Callout: 1 })
    expect(r.stats.topics).toBe(4) // the normal ones were imported
  })

  it('imports an unknown type that sits in the tree as a normal topic (text and children), and says so', async () => {
    const shapes =
      topic({ id: 1, type: 'MainIdea', text: 'Root', cx: 500, sub: [2] }) + topic({ id: 2, type: 'GroupTopic', text: 'odd one', cx: 700, sub: [3] }) + topic({ id: 3, type: 'SubTopic', text: 'child' })
    const r = await parseEmmx(simple(shapes))
    expect(r.maps[0]!.root.children[0]!.text).toBe('odd one')
    expect(r.maps[0]!.root.children[0]!.children[0]!.text).toBe('child')
    expect(r.stats.unknownTypes).toEqual({ GroupTopic: 1 })
    expect(r.warnings.join('|')).toMatch(/GroupTopic.*imported as normal topic/)
  })

  it('counts content inside topics that is not imported yet (notes, links, markers...) and logs the element names', async () => {
    const extra = '<Notes><Note>hello</Note></Notes><Hyperlinks><Hyperlink Url="http://x"/></Hyperlinks><Icons><Icon ID="3"/></Icons>'
    const r = await parseEmmx(simple(basicShapes({ main1: { extra }, main2: { extra: '<Notes/>' } })))
    expect(r.stats.unsupportedElements).toEqual({ Notes: 2, Hyperlinks: 1, Icons: 1 })
    const w = r.warnings.join('|')
    expect(w).toMatch(/notes and comments on 2 topics not imported yet/)
    expect(w).toMatch(/hyperlinks on 1 topic not imported yet/)
    expect(w).toMatch(/icons and markers on 1 topic not imported yet/)
    expect(r.maps[0]!.root.children[0]!.text).toBe('Right one') // text still imported
  })

  it('does not crash on shapes with missing parts', async () => {
    const shapes = '<Shape ID="1" Type="MainIdea"/><Shape Type="Weird"/><Shape ID="2"/><Foo/>'
    const r = await parseEmmx(simple(shapes))
    expect(r.maps[0]!.root.text).toBe('')
    expect(r.stats.unknownTypes).toBeTruthy()
  })
})

describe('safety', () => {
  it('rejects files that are not a ZIP, or are damaged', async () => {
    await expect(parseEmmx(strToU8('this is plain text, not an archive at all, sorry!'))).rejects.toThrow(/not a valid \.emmx/)
    await expect(parseEmmx(new Uint8Array(10))).rejects.toThrow(/not a valid \.emmx/)
    const z = simple()
    await expect(parseEmmx(z.slice(0, z.length - 30))).rejects.toThrow(EmmxError)
  })

  it('rejects files over 50 MB without looking inside', async () => {
    const big = new Uint8Array(50 * 1024 * 1024 + 1)
    big[0] = 0x50
    big[1] = 0x4b
    await expect(parseEmmx(big)).rejects.toThrow(/larger than 50 MB/)
  })

  it('rejects an archive with more than 2,000 entries', async () => {
    const files: Record<string, Uint8Array> = {}
    for (let i = 0; i < 2001; i++) files[`f${i}.txt`] = new Uint8Array(1)
    await expect(parseEmmx(zipSync(files, { level: 0 }))).rejects.toThrow(/too many parts/)
  })

  it('rejects an archive that claims to unpack to more than 200 MB (zip bomb), before unpacking anything', async () => {
    const z = zipSync({ 'bomb.bin': new Uint8Array(1000) }, { level: 0 })
    const dv = new DataView(z.buffer, z.byteOffset, z.byteLength)
    // Central directory header: signature 0x02014b50, uncompressed size at offset 24.
    let cd = -1
    for (let i = z.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x02014b50) {
      cd = i
      break
    }
    expect(cd).toBeGreaterThan(0)
    dv.setUint32(cd + 24, 300 * 1024 * 1024, true)
    await expect(parseEmmx(z)).rejects.toThrow(/more than 200 MB/)
  })

  it('never reads entries it does not know, whatever their names', async () => {
    const z = zip({
      'document.xml': doc('page'),
      'page/page.xml': page('P', topic({ id: 1, type: 'MainIdea', text: 'ok' })),
      '../../evil.xml': '<Page/>',
      'page/../../evil.xml': '<Page/>',
      '/abs/page/page.xml': '<Page/>',
      'page/sub/dir.xml': '<Page/>',
      'media/sub/x.png': png(5, 5),
      'C:\\win\\page.xml': '<Page/>',
    })
    const r = await parseEmmx(z)
    expect(r.maps.map((m) => m.root.text)).toEqual(['ok'])
  })

  it('refuses picture locations that climb out of the archive or are not in media/', async () => {
    for (const target of ['../../etc/passwd', '../media/../../x.png', '/media/x.png', 'C:\\x.png', '..\\media\\x.png', 'media/../page/page.xml', '../page/page.xml', 'http://evil/x.png', '../media/sub/x.png', '../media/']) {
      expect(resolveMediaTarget(target)).toBeNull()
    }
    expect(resolveMediaTarget('../media/image1.png')).toBe('media/image1.png')
    expect(resolveMediaTarget('../media/./image1.png')).toBe('media/image1.png')
    const r = await parseEmmx(simple(basicShapes({ main1: { rid: 'rId1' } }), { 'rels/page_rels.xml': rels({ rId1: '../../outside.png' }), 'media/image1.png': png(5, 5) }))
    expect(r.images.size).toBe(0)
    expect(r.warnings.join('|')).toMatch(/unsafe location/)
  })

  it('rejects XML with a DOCTYPE or entity declarations (no entity expansion at all)', async () => {
    const bomb = '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;">]><Page><Shape ID="1" Type="MainIdea"><Text><TextBlock><Text><pp><tp>&c;</tp></pp></Text></TextBlock></Text></Shape></Page>'
    expect(() => parseXml(bomb)).toThrow(XmlError)
    expect(() => parseXml('<!DOCTYPE x SYSTEM "http://evil/x.dtd"><x/>')).toThrow(XmlError)
    expect(() => parseXml('<!ENTITY x "y"><x/>')).toThrow(XmlError)
    await expect(parseEmmx(zip({ 'page/page.xml': bomb }))).rejects.toThrow(EmmxError)
  })

  it('does not expand unknown entities, and limits nesting and size', () => {
    expect(parseXml('<a>&evil;</a>').text).toBe('&evil;')
    expect(() => parseXml(`${'<a>'.repeat(300)}${'</a>'.repeat(300)}`)).toThrow(/nested too deeply/)
    expect(() => parseXml(`<a>${'<b/>'.repeat(10)}</a>`, { maxChars: 1000, maxDepth: 10, maxNodes: 5 })).toThrow(/too many elements/)
    expect(() => parseXml('<a>x</a>', { maxChars: 3, maxDepth: 10, maxNodes: 10 })).toThrow(/too large/)
  })

  it('rejects malformed XML cleanly', () => {
    for (const bad of ['<a>', '<a></b>', '<a b=1/>', '<a b="1/>', '</a>', '<a/><b/>', '', 'text only', '<a><!-- unterminated </a>', '<a b>x</a>', '<![CDATA[x]]>']) {
      expect(() => parseXml(bad)).toThrow(XmlError)
    }
  })

  it('reads comments, CDATA, processing instructions, single quotes and a byte-order mark', () => {
    const n = parseXml("\ufeff<?xml version='1.0'?><!-- c --><a x='1'><b><![CDATA[<raw & text>]]></b><c/></a>")
    expect(n.attrs.x).toBe('1')
    expect(n.children.map((c) => c.name)).toEqual(['b', 'c'])
    expect(n.children[0]!.text).toBe('<raw & text>')
  })

  it('attribute names cannot reach object prototypes', () => {
    const n = parseXml('<a __proto__="x" constructor="y"/>')
    expect(Object.getPrototypeOf(n.attrs)).toBeNull()
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })
})

describe('the layout keeps imported sides', () => {
  const NONE = new Set<string>()
  it('puts main topics with a chosen side there, and balances the rest', async () => {
    const r = await parseEmmx(sample())
    const content = buildMapContent(r.maps[0]!, () => undefined)
    const d = createMapDoc()
    Y.applyUpdate(d.ydoc, content, 'load')
    const topics = snapshotTopics(d)
    const root = Object.values(topics).find((t) => t.parentId === null)!
    const scene = buildScene(topics, { rootId: root.id, maxDepth: null, focusId: null, reveal: NONE })
    const kids = Object.values(topics)
      .filter((t) => t.parentId === root.id)
      .sort((a, b) => a.order - b.order)
    expect(kids.map((k) => scene.boxes.get(k.id)!.side)).toEqual(['right', 'left', 'left'])
  })

  it('leaves the usual automatic balance alone when no side is chosen', () => {
    const d = createMapDoc()
    const content = buildMapContent({ name: 'x', root: { text: 'R', style: {}, children: Array.from({ length: 6 }, (_, i) => ({ text: `b${i}`, style: {}, children: [] })) } }, () => undefined)
    Y.applyUpdate(d.ydoc, content, 'load')
    const topics = snapshotTopics(d)
    const root = Object.values(topics).find((t) => t.parentId === null)!
    const scene = buildScene(topics, { rootId: root.id, maxDepth: null, focusId: null, reveal: NONE })
    const sides = Object.values(topics).filter((t) => t.parentId === root.id).map((t) => scene.boxes.get(t.id)!.side)
    expect(sides.filter((s) => s === 'right')).toHaveLength(3)
    expect(sides.filter((s) => s === 'left')).toHaveLength(3)
  })

  it('balances unassigned main topics around the ones with a chosen side', () => {
    const kid = (text: string, side?: 'left' | 'right'): ImportedTopic => ({ text, style: {}, side, children: [] })
    const content = buildMapContent({ name: 'x', root: { text: 'R', style: {}, children: [kid('a', 'left'), kid('b', 'left'), kid('c'), kid('d')] } }, () => undefined)
    const d = createMapDoc()
    Y.applyUpdate(d.ydoc, content, 'load')
    const topics = snapshotTopics(d)
    const root = Object.values(topics).find((t) => t.parentId === null)!
    const scene = buildScene(topics, { rootId: root.id, maxDepth: null, focusId: null, reveal: NONE })
    const by = Object.fromEntries(Object.values(topics).filter((t) => t.parentId === root.id).map((t) => [t.text, scene.boxes.get(t.id)!.side]))
    expect(by).toEqual({ a: 'left', b: 'left', c: 'right', d: 'right' })
  })
})

describe('building the Wishtaa map', () => {
  it('keeps order, style, side and pictures, and leaves out a picture that has no id', () => {
    const tree: ImportedTopic = {
      text: 'Root',
      style: { fill: '#112233' },
      children: [
        { text: 'one', side: 'left', style: { lineColor: '#ff0000', fontSize: 20 }, image: { hash: 'h1', width: 100, height: 50 }, children: [{ text: 'deep', style: {}, children: [] }] },
        { text: 'two', side: 'right', style: {}, image: { hash: 'missing', width: 10, height: 10 }, children: [] },
      ],
    }
    const d = createMapDoc()
    Y.applyUpdate(d.ydoc, buildMapContent({ name: 'n', root: tree }, (h) => (h === 'h1' ? 'image-1' : undefined)), 'load')
    const t = Object.values(snapshotTopics(d))
    const byText = (x: string) => t.find((y) => y.text === x)!
    expect(byText('Root').style.fill).toBe('#112233')
    expect(byText('one')).toMatchObject({ side: 'left', order: 0, style: { lineColor: '#ff0000', fontSize: 20 }, image: { imageId: 'image-1', width: 100, height: 50, position: 'above' } })
    expect(byText('two')).toMatchObject({ side: 'right', order: 1, image: null })
    expect(byText('deep').parentId).toBe(byText('one').id)
  })
})
