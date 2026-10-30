import type { TopicStyle } from '../../model/types'
import { parseEmmxColor } from './color'
import { detectImage, displaySize, MAX_IMPORT_DIMENSION, MAX_IMPORT_PIXELS, sha256Hex } from './images'
import { child, childrenNamed, parseXml, path, XmlError, type XmlNode } from './xml'
import { EmmxError, readEmmxArchive, resolveMediaTarget } from './zip'

export { EmmxError } from './zip'

/** One topic of an imported map: plain data, ready to be written into a Wishtaa map. */
export interface ImportedTopic {
  text: string
  /** Main topics only: which side of the central topic it was on in the original. */
  side?: 'left' | 'right'
  style: TopicStyle
  /** The picture shown in this topic; its bytes are in `EmmxResult.images`, keyed by `hash`. */
  image?: { hash: string; width: number; height: number }
  children: ImportedTopic[]
}

export interface ImportedMap {
  /** The page name in the original file. */
  name: string
  root: ImportedTopic
}

export interface ImportedImage {
  hash: string
  /** Detected from the first bytes of the file, never from its name. */
  type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  /** The original bytes, untouched. */
  bytes: Uint8Array
  width: number
  height: number
  /** True when the longest side is above 4000 px: the app reduces it to 4000 px, the only case where a picture is resized. */
  needsDownscale: boolean
}

export interface EmmxStats {
  pages: number
  topics: number
  images: number
  duplicateImages: number
  skippedImages: number
  /** Shape types we do not understand, with how many were seen (so more samples can be sent and support added). */
  unknownTypes: Record<string, number>
  /** Elements inside topics that we do not import yet, with how many topics had them. */
  unsupportedElements: Record<string, number>
}

export interface EmmxResult {
  maps: ImportedMap[]
  images: Map<string, ImportedImage>
  warnings: string[]
  stats: EmmxStats
}

export interface EmmxOptions {
  /** Treat the default texts ("Main Topic", "Subtopic", ...) as empty when the topic has a picture. On by default. */
  clearPlaceholderText?: boolean
}

export const PLACEHOLDER_TEXTS = ['main topic', 'subtopic', 'central topic', 'floating topic']

const MAX_TOPICS = 100_000
const KNOWN_TOPIC_ELEMENTS = new Set(['Transform', 'ShapeFormat', 'Text', 'LevelData', 'Geometries', 'ShapeStyle', 'StyleMask', 'Layout', 'BranchFormat', 'Shape'])
const TOPIC_TYPES = new Set(['MainIdea', 'MainTopic', 'SubTopic'])

/** Friendly names for content we may meet, as [pattern, singular, plural]. */
const FRIENDLY: [RegExp, string, string][] = [
  [/float/i, 'floating topic', 'floating topics'],
  [/callout/i, 'callout', 'callouts'],
  [/bound/i, 'boundary', 'boundaries'],
  [/summar/i, 'summary', 'summaries'],
  [/relation/i, 'relationship line', 'relationship lines'],
  [/icon|marker|mark|clipart|symbol/i, 'icon or marker', 'icons and markers'],
  [/tag/i, 'tag', 'tags'],
  [/note|comment|remark/i, 'note or comment', 'notes and comments'],
  [/hyperlink|link/i, 'hyperlink', 'hyperlinks'],
  [/attach/i, 'attachment', 'attachments'],
  [/formula|latex|equation/i, 'formula', 'formulas'],
  [/table/i, 'table', 'tables'],
]
const friendly = (name: string, n: number) => {
  const hit = FRIENDLY.find(([re]) => re.test(name))
  return hit ? (n === 1 ? hit[1] : hit[2]) : `"${name}" item${n === 1 ? '' : 's'}`
}

const num = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}
const s = (n: number) => (n === 1 ? '' : 's')

const decoder = new TextDecoder('utf-8')
function parseEntry(bytes: Uint8Array): XmlNode {
  return parseXml(decoder.decode(bytes))
}

/** Reads a number of the form `<Tag V="..."/>` below a shape. */
const attrV = (node: XmlNode | undefined) => node?.attrs.V

function cleanName(raw: string | undefined, fallback: string): string {
  const out = Array.from(raw ?? '', (c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return out || fallback
}

interface PageCtx {
  entries: Map<string, Uint8Array>
  oversized: Set<string>
  images: Map<string, ImportedImage>
  stats: EmmxStats
  tally: Map<string, number>
  options: Required<EmmxOptions>
}

function add(ctx: PageCtx, key: string, n = 1) {
  ctx.tally.set(key, (ctx.tally.get(key) ?? 0) + n)
}

async function pageImage(ctx: PageCtx, rels: Map<string, string>, cache: Map<string, ImportedImage | null>, rid: string): Promise<ImportedImage | null> {
  if (cache.has(rid)) return cache.get(rid) ?? null
  let result: ImportedImage | null = null
  const target = rels.get(rid)
  const name = resolveMediaTarget(target)
  if (target === undefined) add(ctx, 'img:missing')
  else if (!name) add(ctx, 'img:badpath')
  else if (ctx.oversized.has(name)) add(ctx, 'img:large')
  else {
    const bytes = ctx.entries.get(name)
    if (!bytes) add(ctx, 'img:missing')
    else {
      const d = detectImage(bytes)
      if (!d.ok) add(ctx, d.reason === 'svg' ? 'img:svg' : d.reason === 'corrupt' ? 'img:corrupt' : 'img:unknown')
      else if (d.width * d.height > MAX_IMPORT_PIXELS) add(ctx, 'img:pixels')
      else {
        const hash = await sha256Hex(bytes)
        const seen = ctx.images.get(hash)
        if (seen) {
          ctx.stats.duplicateImages++
          result = seen
        } else {
          result = { hash, type: d.type, bytes, width: d.width, height: d.height, needsDownscale: Math.max(d.width, d.height) > MAX_IMPORT_DIMENSION }
          ctx.images.set(hash, result)
          ctx.stats.images++
          if (result.needsDownscale) add(ctx, 'img:downscaled')
        }
      }
    }
  }
  if (!result) ctx.stats.skippedImages++
  cache.set(rid, result)
  return result
}

function textOf(shape: XmlNode): { text: string; fontPt: number | null; color: string | null } {
  const block = path(shape, 'Text', 'TextBlock')
  const inner = child(block, 'Text')
  const text = childrenNamed(inner, 'pp')
    .map((pp) => childrenNamed(pp, 'tp').map((tp) => tp.text).join(''))
    .join('\n')
  const ch = child(block, 'Character')
  const fontPt = num(ch?.attrs.Size)
  // The colour a character names is only "chosen" when it differs from the theme's default text colour.
  const own = parseEmmxColor(ch?.attrs.Color)
  const theme = parseEmmxColor(attrV(child(block, 'Color')))
  return { text, fontPt: fontPt && fontPt > 0 ? fontPt : null, color: own && own !== theme ? own : null }
}

async function convertShape(
  ctx: PageCtx,
  shape: XmlNode,
  isRoot: boolean,
  byId: Map<string, XmlNode>,
  rels: Map<string, string>,
  imageCache: Map<string, ImportedImage | null>
): Promise<ImportedTopic> {
  const { text, fontPt, color } = textOf(shape)
  // Colours become the topic's own overrides (fill, outline, branch colour, text); the map keeps the default theme.
  // TODO: map MindMaster shape types (the topic's geometry and ShapeStyle) to our shapes once there are more sample files.
  const style: TopicStyle = {}

  const fill = parseEmmxColor(attrV(path(shape, 'ShapeFormat', 'FillFormat', 'Color')))
  if (fill) style.fill = fill
  const line = parseEmmxColor(attrV(path(shape, 'ShapeFormat', 'LineFormat', 'LineFill', 'Color')))
  if (line) style.border = line
  if (!isRoot) {
    // The branch (connector) colour lives on the connector that leads to this topic.
    const connector = byId.get(attrV(path(shape, 'LevelData', 'ToSuper')) ?? '')
    const branch = parseEmmxColor(attrV(path(connector, 'ShapeFormat', 'LineFormat', 'LineFill', 'Color'))) ?? line
    if (branch) style.lineColor = branch
  }
  if (color) style.textColor = color
  if (fontPt) style.fontSize = Math.min(72, Math.max(8, Math.round((fontPt * 4) / 3)))

  // Anything inside the topic that we don't know how to import is counted, not guessed at.
  const unknownHere = new Set<string>()
  for (const c of shape.children) if (!KNOWN_TOPIC_ELEMENTS.has(c.name)) unknownHere.add(c.name)
  for (const name of unknownHere) ctx.stats.unsupportedElements[name] = (ctx.stats.unsupportedElements[name] ?? 0) + 1

  let image: ImportedTopic['image']
  const pictures = childrenNamed(shape, 'Shape').filter((c) => c.attrs.Type === 'Image')
  for (const pic of pictures) {
    const rid = child(pic, 'Data')?.attrs.Res
    if (image || !rid) {
      if (image) add(ctx, 'extraImages')
      else add(ctx, 'img:missing')
      continue
    }
    const img = await pageImage(ctx, rels, imageCache, rid)
    if (!img) continue
    const size = displaySize(num(attrV(path(pic, 'Transform', 'Width'))), num(attrV(path(pic, 'Transform', 'Height'))), img)
    image = { hash: img.hash, ...size }
  }
  for (const c of shape.children) if (c.name === 'Shape' && c.attrs.Type !== 'Image') add(ctx, `nested:${c.attrs.Type ?? '?'}`)

  const trimmed = text.replace(/\s+$/g, '')
  const placeholder = ctx.options.clearPlaceholderText && image && PLACEHOLDER_TEXTS.includes(trimmed.trim().toLowerCase())
  return { text: placeholder ? '' : trimmed, style, ...(image ? { image } : {}), children: [] }
}

const subLevel = (shape: XmlNode): string[] =>
  (attrV(path(shape, 'LevelData', 'SubLevel')) ?? '')
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean)

async function convertPage(ctx: PageCtx, page: XmlNode, rels: Map<string, string>, fallbackName: string): Promise<ImportedMap | null> {
  const name = cleanName(page.attrs.Name, fallbackName)
  const shapes = childrenNamed(page, 'Shape')
  const byId = new Map<string, XmlNode>()
  for (const sh of shapes) {
    const id = sh.attrs.ID
    if (id && !byId.has(id)) byId.set(id, sh)
  }

  // Shapes we don't understand: counted (and named, so more samples can be sent), then skipped.
  const referenced = new Set<string>()
  for (const sh of shapes) for (const id of subLevel(sh)) referenced.add(id)
  const types = new Map<string, XmlNode>()
  for (const sh of shapes) {
    const t = sh.attrs.Type ?? ''
    if (t === 'MMConnector' || t === 'Image' || TOPIC_TYPES.has(t)) continue
    const asTopic = !!sh.attrs.ID && referenced.has(sh.attrs.ID) && !!child(sh, 'Text')
    ctx.stats.unknownTypes[t || '(none)'] = (ctx.stats.unknownTypes[t || '(none)'] ?? 0) + 1
    if (asTopic) types.set(sh.attrs.ID as string, sh)
    else add(ctx, `skipped:${t || '(none)'}`)
  }

  const idea = shapes.filter((sh) => sh.attrs.Type === 'MainIdea')
  const rootShape = idea[0]
  if (!rootShape) {
    add(ctx, 'noRoot')
    return null
  }
  if (idea.length > 1) add(ctx, 'multiIdea', idea.length - 1)

  const imageCache = new Map<string, ImportedImage | null>()
  const visited = new Set<XmlNode>([rootShape])
  const root = await convertShape(ctx, rootShape, true, byId, rels, imageCache)
  const rootCx = num(attrV(path(rootShape, 'Transform', 'CX')))
  let count = 1

  const made = new Map<XmlNode, ImportedTopic>([[rootShape, root]])
  const queue: XmlNode[] = [rootShape]
  const attach = async (parentShape: XmlNode, sh: XmlNode) => {
    const parent = made.get(parentShape) as ImportedTopic
    const topic = await convertShape(ctx, sh, false, byId, rels, imageCache)
    if (parentShape === rootShape) {
      const cx = num(attrV(path(sh, 'Transform', 'CX')))
      if (cx !== null && rootCx !== null) topic.side = cx < rootCx ? 'left' : 'right'
    }
    parent.children.push(topic)
    made.set(sh, topic)
    visited.add(sh)
    queue.push(sh)
    count++
    if (sh.attrs.Type && !TOPIC_TYPES.has(sh.attrs.Type)) add(ctx, `asTopic:${sh.attrs.Type}`)
  }

  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi] as XmlNode
    for (const id of subLevel(cur)) {
      const sh = byId.get(id)
      if (!sh || !(TOPIC_TYPES.has(sh.attrs.Type ?? '') || types.has(id))) {
        add(ctx, 'missingRef')
        continue
      }
      if (visited.has(sh)) {
        add(ctx, 'cycle')
        continue
      }
      if (count >= MAX_TOPICS) {
        add(ctx, 'tooMany')
        continue
      }
      await attach(cur, sh)
    }
  }

  // Fallback: topics not reached through a parent's list are attached to the parent they name themselves.
  const loose = shapes.filter((sh) => TOPIC_TYPES.has(sh.attrs.Type ?? '') && sh.attrs.Type !== 'MainIdea' && !visited.has(sh))
  for (let progress = true; progress && loose.length; ) {
    progress = false
    for (let i = 0; i < loose.length; i++) {
      const sh = loose[i] as XmlNode
      const superId = attrV(path(sh, 'LevelData', 'Super')) ?? attrV(path(byId.get(attrV(path(sh, 'LevelData', 'ToSuper')) ?? ''), 'LevelData', 'Super'))
      const parent = superId ? byId.get(superId) : undefined
      if (parent && visited.has(parent) && count < MAX_TOPICS) {
        await attach(parent, sh)
        loose.splice(i--, 1)
        progress = true
      }
    }
  }
  if (loose.length) add(ctx, 'unplaced', loose.length)

  ctx.stats.topics += count
  return { name, root }
}

function formatWarnings(ctx: PageCtx, pageNote: string[]): string[] {
  const out: string[] = [...pageNote]
  const t = ctx.tally
  const n = (k: string) => t.get(k) ?? 0
  const line = (k: string, f: (n: number) => string) => {
    if (n(k)) out.push(f(n(k)))
  }
  line('noRoot', (c) => `${c} page${s(c)} had no central topic and ${c === 1 ? 'was' : 'were'} skipped`)
  line('multiIdea', (c) => `${c} extra central topic${s(c)} skipped`)
  line('img:svg', (c) => `${c} SVG image${s(c)} skipped (SVG is not imported, for safety)`)
  line('img:unknown', (c) => `${c} image${s(c)} in an unsupported format skipped`)
  line('img:corrupt', (c) => `${c} damaged image${s(c)} skipped`)
  line('img:large', (c) => `${c} image${s(c)} over 10 MB skipped`)
  line('img:pixels', (c) => `${c} image${s(c)} with too many pixels skipped`)
  line('img:missing', (c) => `${c} image${s(c)} could not be found in the file`)
  line('img:badpath', (c) => `${c} image${s(c)} with an unsafe location skipped`)
  line('img:downscaled', (c) => `${c} image${s(c)} longer than ${MAX_IMPORT_DIMENSION} px will be reduced to ${MAX_IMPORT_DIMENSION} px`)
  line('extraImages', (c) => `${c} extra image${s(c)} on a topic skipped (a topic holds one picture)`)
  line('missingRef', (c) => `${c} reference${s(c)} to missing or unsupported shapes ignored`)
  line('cycle', (c) => `${c} repeated link${s(c)} in the topic tree ignored`)
  line('unplaced', (c) => `${c} topic${s(c)} could not be placed in the tree and ${c === 1 ? 'was' : 'were'} skipped`)
  line('tooMany', (c) => `${c} topic${s(c)} beyond the limit of 100,000 skipped`)
  for (const [k, c] of t) {
    if (k.startsWith('skipped:')) out.push(`${c} ${friendly(k.slice(8), c)} skipped`)
    else if (k.startsWith('asTopic:')) out.push(`${c} ${friendly(k.slice(8), c)} imported as normal topic${s(c)} (only the text and subtopics)`)
    else if (k.startsWith('nested:')) out.push(`${c} nested ${friendly(k.slice(7), c)} skipped`)
  }
  for (const [name, c] of Object.entries(ctx.stats.unsupportedElements)) out.push(`${friendly(name, 2)} on ${c} topic${s(c)} not imported yet`)
  return out
}

function readRels(entries: Map<string, Uint8Array>, page: string): Map<string, string> {
  const rels = new Map<string, string>()
  const bytes = entries.get(`rels/${page}_rels.xml`)
  if (!bytes) return rels
  try {
    for (const r of childrenNamed(parseEntry(bytes), 'Relationship').slice(0, 10_000)) if (r.attrs.Id && r.attrs.Target) rels.set(r.attrs.Id, r.attrs.Target)
  } catch {
    /* unreadable relationships just mean no pictures */
  }
  return rels
}

function listPages(entries: Map<string, Uint8Array>, notes: string[]): string[] {
  const available = (n: string) => entries.has(`page/${n}.xml`)
  const listed: string[] = []
  const doc = entries.get('document.xml')
  if (doc) {
    try {
      const v = attrV(path(parseEntry(doc), 'Properties', 'Pages')) ?? ''
      for (const raw of v.split(/[;,]/)) {
        const n = raw.trim()
        if (!n) continue
        if (/^[A-Za-z0-9_-]{1,64}$/.test(n) && available(n)) listed.push(n)
        else notes.push(`The page "${n.slice(0, 40)}" is listed in the file but could not be found`)
      }
    } catch {
      /* fall back to the page files themselves */
    }
  }
  if (listed.length) return [...new Set(listed)]
  return [...entries.keys()]
    .filter((k) => /^page\/[A-Za-z0-9_-]{1,64}\.xml$/.test(k))
    .map((k) => k.slice(5, -4))
    .sort()
}

/**
 * Converts an MindMaster / EdrawMind `.emmx` file into plain Wishtaa map data, one map per page.
 *
 * Nothing in the file is trusted: see `readEmmxArchive` for the zip limits, `parseXml` for the XML rules and
 * `detectImage` for pictures. Whatever is not understood is skipped and reported, never fatal.
 */
export async function parseEmmx(file: ArrayBuffer | Uint8Array, options: EmmxOptions = {}): Promise<EmmxResult> {
  const bytes = file instanceof Uint8Array ? file : new Uint8Array(file)
  const { entries, oversized } = readEmmxArchive(bytes)
  const stats: EmmxStats = { pages: 0, topics: 0, images: 0, duplicateImages: 0, skippedImages: 0, unknownTypes: Object.create(null) as Record<string, number>, unsupportedElements: Object.create(null) as Record<string, number> }
  const ctx: PageCtx = { entries, oversized, images: new Map(), stats, tally: new Map(), options: { clearPlaceholderText: options.clearPlaceholderText ?? true } }
  const notes: string[] = []

  const pages = listPages(entries, notes)
  if (!pages.length) throw new EmmxError('This file has no pages we can read.')

  const maps: ImportedMap[] = []
  const names = new Set<string>()
  for (const [i, p] of pages.entries()) {
    let page: XmlNode
    try {
      page = parseEntry(entries.get(`page/${p}.xml`) as Uint8Array)
    } catch (e) {
      notes.push(`Page "${p}" could not be read${e instanceof XmlError ? `: ${e.message}` : ''}`)
      continue
    }
    const m = await convertPage(ctx, page, readRels(entries, p), `Page ${i + 1}`)
    if (!m) continue
    let name = m.name
    for (let k = 2; names.has(name.toLowerCase()); k++) name = `${m.name} ${k}`
    names.add(name.toLowerCase())
    maps.push({ ...m, name })
    stats.pages++
  }
  if (!maps.length) throw new EmmxError(notes[0] ?? 'None of the pages in this file had a central topic, so nothing was imported.')

  // Only pictures that ended up in a map are returned.
  const used = new Set<string>()
  const walk = (t: ImportedTopic) => {
    const stack = [t]
    while (stack.length) {
      const x = stack.pop() as ImportedTopic
      if (x.image) used.add(x.image.hash)
      stack.push(...x.children)
    }
  }
  maps.forEach((m) => walk(m.root))
  const images = new Map([...ctx.images].filter(([h]) => used.has(h)))
  stats.images = images.size

  return { maps, images, warnings: formatWarnings(ctx, notes), stats }
}
