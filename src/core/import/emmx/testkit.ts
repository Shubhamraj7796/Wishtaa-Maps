import { strToU8, zipSync } from 'fflate'

// ---- tiny synthetic files ---------------------------------------------------------------------------------------

const crcTable = (() => {
  const t: number[] = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t.push(c >>> 0)
  }
  return t
})()
const crc = (b: Uint8Array) => {
  let c = 0xffffffff
  for (const x of b) c = (crcTable[(c ^ x) & 0xff] as number) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const chunk = (type: string, data: number[]) => [...u32(data.length), ...[...type].map((c) => c.charCodeAt(0)), ...data, ...u32(crc(Uint8Array.from([...[...type].map((c) => c.charCodeAt(0)), ...data])))]

/** A valid PNG header and data with the given size and a unique colour (so each looks different). */
export function png(width: number, height: number, seed = 0): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  const ihdr = chunk('IHDR', [...u32(width), ...u32(height), 8, 2, 0, 0, 0])
  const idat = chunk('IDAT', [0x78, 0x9c, seed & 255, (seed >> 8) & 255, 0, 0, 0, 0, 1])
  return Uint8Array.from([...sig, ...ihdr, ...idat, ...chunk('IEND', [])])
}
export const jpeg = (w: number, h: number) => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255, 1, 1, 0x11, 0, 0xff, 0xd9])
export const gif = (w: number, h: number) => Uint8Array.from([...strToU8('GIF89a'), w & 255, w >> 8, h & 255, h >> 8, 0, 0, 0, 0x3b])
export const webpLossless = (w: number, h: number) => {
  const bits = (w - 1) | ((h - 1) << 14)
  return Uint8Array.from([...strToU8('RIFF'), 20, 0, 0, 0, ...strToU8('WEBP'), ...strToU8('VP8L'), 5, 0, 0, 0, 0x2f, bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >>> 24) & 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
}

const color = (c: string) => `<Color V="${c}"/>`
export interface TopicOpts {
  id: number
  type?: string
  text?: string
  cx?: number
  sub?: number[]
  fill?: string
  line?: string
  toSuper?: number
  size?: number
  charColor?: string
  rid?: string
  w?: number
  h?: number
  extra?: string
  superId?: number
}
export const topic = (o: TopicOpts) =>
  `<Shape ID="${o.id}" Type="${o.type ?? 'SubTopic'}"><Transform><Width V="100"/><Height V="50"/><CX V="${o.cx ?? 100}"/><CY V="100"/></Transform>` +
  `<ShapeFormat>${o.fill ? `<FillFormat Type="Solid">${color(o.fill)}</FillFormat>` : '<FillFormat/>'}<LineFormat><LineFill Type="Solid">${color(o.line ?? '#ff112233')}</LineFill></LineFormat></ShapeFormat>` +
  `<Text><TextBlock><Color ThemeColor="2" V="#ff454545"/><Character IX="0" Family="Tahoma" Size="${o.size ?? 12}" Color="${o.charColor ?? '#454545'}"/><Text><pp>${(o.text ?? 'Topic').split('\n').map((l) => `<tp>${l}</tp>`).join('</pp><pp>')}</pp></Text></TextBlock></Text>` +
  (o.rid ? `<Shape ID="9${o.id}" Type="Image"><Transform><Width V="${o.w ?? 300}"/><Height V="${o.h ?? 200}"/></Transform><Data Res="${o.rid}"/></Shape>` : '') +
  `<LevelData>${o.superId !== undefined ? `<Super V="${o.superId}"/>` : ''}${o.toSuper !== undefined ? `<ToSuper V="${o.toSuper}"/>` : ''}${o.sub ? `<SubLevel V="${o.sub.join(';')}"/>` : ''}</LevelData>${o.extra ?? ''}</Shape>`
export const connector = (id: number, c: string) => `<Shape ID="${id}" Type="MMConnector"><ShapeFormat><LineFormat><LineFill Type="Solid">${color(c)}</LineFill></LineFormat></ShapeFormat></Shape>`
export const page = (name: string, shapes: string) => `<?xml version="1.0"?><Page ID="100" Type="Page" Name="${name}">${shapes}</Page>`
export const doc = (pages: string) => `<Document><Properties><Pages V="${pages}"/></Properties></Document>`
export const rels = (m: Record<string, string>) => `<Relationships>${Object.entries(m).map(([k, v]) => `<Relationship Id="${k}" Target="${v}"/>`).join('')}</Relationships>`

export function zip(files: Record<string, Uint8Array | string>): Uint8Array {
  const out: Record<string, Uint8Array> = {}
  for (const [k, v] of Object.entries(files)) out[k] = typeof v === 'string' ? strToU8(v) : v
  return zipSync(out, { level: 1 })
}

/** A standard small map: central topic, two main topics (one each side), one sub topic. */
export const basicShapes = (over: { main1?: Partial<TopicOpts>; main2?: Partial<TopicOpts>; sub?: Partial<TopicOpts>; extra?: string } = {}) =>
  topic({ id: 1, type: 'MainIdea', text: 'Centre', cx: 500, sub: [2, 3] }) +
  topic({ id: 2, type: 'MainTopic', text: 'Right one', cx: 800, sub: [4], toSuper: 20, ...over.main1 }) +
  topic({ id: 3, type: 'MainTopic', text: 'Left one', cx: 200, toSuper: 21, ...over.main2 }) +
  topic({ id: 4, type: 'SubTopic', text: 'Sub', cx: 1000, toSuper: 22, ...over.sub }) +
  connector(20, '#ffff0000') +
  connector(21, '#ff00ff00') +
  connector(22, '#ff0000ff') +
  (over.extra ?? '')
export const simple = (shapes = basicShapes(), extraFiles: Record<string, Uint8Array | string> = {}) => zip({ 'document.xml': doc('page'), 'page/page.xml': page('Page-1', shapes), ...extraFiles })

