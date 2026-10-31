import { browserCodec } from '@/core/images/codec.browser'
import { analyze } from '@/core/images/pipeline'

/** Real browser measurement of the picture pipeline (run by bench/run.mjs in headless Chromium). */

let maxCanvasPixels = 0
const createElement = document.createElement.bind(document)
document.createElement = ((tag: string, o?: ElementCreationOptions) => {
  const el = createElement(tag, o)
  if (tag === 'canvas') {
    const c = el as HTMLCanvasElement
    const w = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width')
    const h = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height')
    let cw = 300
    let ch = 150
    Object.defineProperty(c, 'width', { get: () => cw, set: (v: number) => ((cw = v), w?.set?.call(c, v), (maxCanvasPixels = Math.max(maxCanvasPixels, cw * ch))) })
    Object.defineProperty(c, 'height', { get: () => ch, set: (v: number) => ((ch = v), h?.set?.call(c, v), (maxCanvasPixels = Math.max(maxCanvasPixels, cw * ch))) })
  }
  return el
}) as typeof document.createElement

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob>((r) => c.toBlob((b) => r(b as Blob), type, q))
const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** A web page or app window: pale background, a sidebar, a heading, paragraphs of real text, a few coloured buttons. */
async function screenshot() {
  const c = canvas(1920, 1080)
  const x = c.getContext('2d') as CanvasRenderingContext2D
  x.fillStyle = '#f8fafc'
  x.fillRect(0, 0, 1920, 1080)
  x.fillStyle = '#1e293b'
  x.fillRect(0, 0, 260, 1080)
  x.fillStyle = '#e2e8f0'
  for (let i = 0; i < 12; i++) {
    x.font = '18px Arial, sans-serif'
    x.fillText(`Menu item number ${i + 1}`, 28, 80 + i * 44)
  }
  x.fillStyle = '#0f172a'
  x.font = 'bold 40px Arial, sans-serif'
  x.fillText('Quarterly report: depreciation schedule', 320, 100)
  x.font = '20px Arial, sans-serif'
  for (let i = 0; i < 26; i++) x.fillText(`Paragraph ${i + 1}: the asset is carried at cost less accumulated depreciation and impairment losses, reviewed each year.`, 320, 170 + i * 30)
  x.font = '12px Arial, sans-serif'
  x.fillStyle = '#334155'
  for (let i = 0; i < 10; i++) x.fillText(`Footnote ${i + 1}: small print that must still be readable after compression 0123456789`, 320, 960 + i * 14)
  for (const [i, col] of ['#2563eb', '#16a34a', '#dc2626'].entries()) {
    x.fillStyle = col
    x.fillRect(1500 + i * 130, 60, 110, 40)
  }
  return toBlob(c, 'image/png')
}

/** A phone photo: 12 megapixels of smooth scenery with sensor-like grain, saved as JPEG. */
async function phonePhoto() {
  const c = canvas(4032, 3024)
  const x = c.getContext('2d') as CanvasRenderingContext2D
  const g = x.createLinearGradient(0, 0, 4032, 3024)
  g.addColorStop(0, '#6aa5d8')
  g.addColorStop(0.5, '#a7c47f')
  g.addColorStop(1, '#5a3b25')
  x.fillStyle = g
  x.fillRect(0, 0, 4032, 3024)
  for (let i = 0; i < 400; i++) {
    x.fillStyle = `hsla(${(i * 37) % 360}, 45%, ${30 + (i % 40)}%, 0.35)`
    x.beginPath()
    x.arc((i * 997) % 4032, (i * 631) % 3024, 40 + (i % 160), 0, Math.PI * 2)
    x.fill()
  }
  const d = x.getImageData(0, 0, 4032, 3024)
  let s = 12345
  for (let i = 0; i < d.data.length; i += 4) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const n = ((s >> 16) & 15) - 8 // grain +-8
    d.data[i] = Math.max(0, Math.min(255, (d.data[i] as number) + n))
    d.data[i + 1] = Math.max(0, Math.min(255, (d.data[i + 1] as number) + n))
    d.data[i + 2] = Math.max(0, Math.min(255, (d.data[i + 2] as number) + n))
  }
  x.putImageData(d, 0, 0)
  return toBlob(c, 'image/jpeg', 0.92)
}

/** A diagram: flat colours and thin black lines and labels. */
async function flatDiagram() {
  const c = canvas(1600, 900)
  const x = c.getContext('2d') as CanvasRenderingContext2D
  x.fillStyle = '#ffffff'
  x.fillRect(0, 0, 1600, 900)
  x.lineWidth = 3
  x.font = '22px Arial, sans-serif'
  const cols = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8']
  for (let r = 0; r < 4; r++)
    for (let k = 0; k < 5; k++) {
      x.fillStyle = cols[(r + k) % 4] as string
      x.fillRect(60 + k * 300, 60 + r * 200, 240, 120)
      x.strokeStyle = '#111827'
      x.strokeRect(60 + k * 300, 60 + r * 200, 240, 120)
      x.fillStyle = '#111827'
      x.fillText(`Step ${r * 5 + k + 1}: check`, 80 + k * 300, 125 + r * 200)
    }
  return toBlob(c, 'image/png')
}

/** 20 megapixels (more than the 16 megapixel canvas limit of iOS): a big scan or panorama. */
async function huge() {
  const c = canvas(5000, 4000)
  const x = c.getContext('2d') as CanvasRenderingContext2D
  const g = x.createLinearGradient(0, 0, 5000, 4000)
  g.addColorStop(0, '#fef3c7')
  g.addColorStop(1, '#1e3a8a')
  x.fillStyle = g
  x.fillRect(0, 0, 5000, 4000)
  x.fillStyle = '#000'
  x.font = '60px Arial, sans-serif'
  for (let i = 0; i < 40; i++) x.fillText(`Scanned line ${i + 1} of a large page that is bigger than sixteen megapixels`, 200, 150 + i * 90)
  return toBlob(c, 'image/png')
}

/** How well the sharp edges (text) survive: contrast across edges in a strip, original resized the same way versus the result. */
async function textContrast(original: Blob, result: Blob, w: number, h: number) {
  const draw = async (b: Blob) => {
    const bmp = await createImageBitmap(b)
    const c = canvas(w, h)
    ;(c.getContext('2d') as CanvasRenderingContext2D).drawImage(bmp, 0, 0, w, h)
    bmp.close()
    return (c.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, w, h)
  }
  const a = await draw(original)
  const b = await draw(result)
  const edge = (d: ImageData) => {
    let max = 0
    let sum = 0
    let n = 0
    for (let y = Math.round(h * 0.88); y < h; y++)
      for (let x = 1; x < w; x++) {
        const i = (y * w + x) * 4
        const diff = Math.abs((d.data[i] as number) - (d.data[i - 4] as number))
        max = Math.max(max, diff)
        sum += diff
        n++
      }
    return { max, mean: sum / n }
  }
  let sq = 0
  for (let i = 0; i < a.data.length; i += 4) sq += ((a.data[i] as number) - (b.data[i] as number)) ** 2
  const mse = sq / (a.data.length / 4)
  return { psnr: mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse), originalEdge: edge(a), resultEdge: edge(b) }
}

async function measure(name: string, make: () => Promise<Blob>) {
  const source = await make()
  maxCanvasPixels = 0
  const t0 = performance.now()
  const a = await analyze(source, {}, browserCodec)
  const ms = Math.round(performance.now() - t0)
  const row: Record<string, unknown> = {
    name,
    sourceType: source.type,
    sourcePx: `${a.source.width}x${a.source.height}`,
    sourceKB: Math.round(source.size / 1024),
    originalKB: a.original ? Math.round(a.original.blob.size / 1024) : null,
    originalProblem: a.originalProblem,
    compressedKB: Math.round(a.compressed.blob.size / 1024),
    compressedType: a.compressed.type,
    compressedPx: `${a.compressed.width}x${a.compressed.height}`,
    saving: `${Math.round((1 - a.compressed.blob.size / source.size) * 100)}%`,
    textHeavy: a.stats.textHeavy,
    flat: a.stats.flat,
    ms,
    maxCanvasMegapixels: Math.round((maxCanvasPixels / 1e6) * 10) / 10,
  }
  if (name === 'screenshot') row.readability = await textContrast(source, a.compressed.blob, a.compressed.width, a.compressed.height)
  return row
}

;(window as unknown as { runBench: () => Promise<unknown> }).runBench = async () => {
  const rows = []
  rows.push(await measure('screenshot', screenshot))
  rows.push(await measure('phone photo', phonePhoto))
  rows.push(await measure('flat diagram', flatDiagram))
  rows.push(await measure('20 megapixel scan', huge))
  return rows
}
document.title = 'ready'
