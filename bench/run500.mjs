/* global process, console, window, document, performance, requestAnimationFrame, fetch, setTimeout */
// Real-browser 500-picture benchmark: open time, frame rate while panning and zooming, decoded memory.
//   npm install --no-save playwright   (once)   then   node bench/run500.mjs
// CHROMIUM_PATH can point at an installed Chromium. Headless Chromium here draws without a graphics card, so frame rates are
// a floor: a real desktop or tablet GPU does better.
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = 5198
const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', shell: process.platform === 'win32' })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const base = `http://localhost:${PORT}`

async function measure(browser, label, contextOptions, cpuSlowdown, withPictures = true) {
  const context = await browser.newContext(contextOptions)
  const page = await context.newPage()
  page.on('pageerror', (e) => console.error('PAGE ERROR', e.message))
  await page.goto(`${base}/bench/map500.html`)
  await page.waitForFunction(() => document.title === 'ready', null, { timeout: 120000 })
  const t0 = Date.now()
  const seeded = await page.evaluate(([w, n]) => window.seed(w, n), [withPictures, Number(process.env.PICTURES || 500)])
  const seedMs = Date.now() - t0

  const client = await context.newCDPSession(page)
  if (cpuSlowdown > 1) await client.send('Emulation.setCPUThrottlingRate', { rate: cpuSlowdown })

  const opened = Date.now()
  await page.goto(`${base}/map/${seeded.id}`)
  await page.waitForSelector('[data-topic]', { timeout: 120000 })
  const firstTopicMs = Date.now() - opened
  if (withPictures) await page.waitForFunction(() => document.querySelector('img[src^="blob:"]'), null, { timeout: 120000 })
  const firstPictureMs = Date.now() - opened
  await wait(1500)

  // Start frame sampling in the page: how long each frame takes, how much decoded picture memory is held, how many pictures are on screen.
  const startSampler = () =>
    page.evaluate(() => {
      const b = { frames: [], peakCache: 0, peakImgs: 0, peakHeap: 0, running: true, last: performance.now() }
      window.__bench = b
      const tick = (now) => {
        b.frames.push(now - b.last)
        b.last = now
        b.peakCache = Math.max(b.peakCache, window.__pictureCache ? window.__pictureCache.totalBytes : 0)
        b.peakImgs = Math.max(b.peakImgs, document.querySelectorAll('img[src^="blob:"]').length)
        b.peakHeap = Math.max(b.peakHeap, performance.memory ? performance.memory.usedJSHeapSize : 0)
        if (b.running) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  const stopSampler = () =>
    page.evaluate(() => {
      const b = window.__bench
      b.running = false
      const sorted = b.frames.slice(1).sort((x, y) => x - y)
      const avg = sorted.reduce((t, x) => t + x, 0) / sorted.length
      return {
        frames: sorted.length,
        fpsAverage: Math.round(1000 / avg),
        frameMsMedian: Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10,
        frameMsP95: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10,
        peakDecodedCacheMB: Math.round(b.peakCache / 1048576),
        peakImagesInPage: b.peakImgs,
        peakJsHeapMB: Math.round(b.peakHeap / 1048576),
      }
    })

  // The whole map in view, then a readable zoom at the top of it.
  const setup = await page.evaluate(async () => {
    const A = await import('/src/editor/actions.ts')
    const { useEditor } = await import('/src/editor/store.ts')
    const { getScene } = await import('/src/editor/scene.ts')
    A.fitToScreen()
    const fit = useEditor.getState().viewport.k
    const b = getScene().bounds
    const size = useEditor.getState().canvasSize
    A.setViewport({ k: 0.7, x: size.w / 2 - (b.x + b.w / 2) * 0.7, y: size.h / 2 - (b.y + b.h * 0.25) * 0.7 }) // a quarter of the way down the column
    return { fitZoom: Math.round(fit * 1000) / 1000, bounds: { w: Math.round(b.w), h: Math.round(b.h) } }
  })
  await wait(1500)
  const cx = (contextOptions.viewport.width / 2) | 0
  const cy = (contextOptions.viewport.height / 2) | 0
  await page.mouse.move(cx, cy)
  const drive = async (ms, step) => {
    const t = Date.now()
    let i = 0
    while (Date.now() - t < ms) await step(i++)
  }

  // 1. Pan with the mouse wheel (a trackpad swipe sends the same events), a few thousand pixels a second.
  await startSampler()
  await drive(5000, () => page.mouse.wheel(0, 90))
  const pan = await stopSampler()

  // 2. Zoom out and back in (Ctrl + wheel) over the whole map while it keeps moving.
  await startSampler()
  await page.keyboard.down('Control')
  await drive(5000, (i) => page.mouse.wheel(0, Math.floor(i / 40) % 2 === 0 ? 80 : -80))
  await page.keyboard.up('Control')
  const zoom = await stopSampler()
  const result = { ...setup, pan, zoomInOut: zoom, cacheEntries: await page.evaluate(() => (window.__pictureCache ? window.__pictureCache.size : -1)) }
  await context.close()
  return { label, seeded, seedMs, firstTopicMs, firstPictureMs, ...result }
}

try {
  let up = false
  for (let i = 0; i < 60 && !up; i++) {
    try {
      up = (await fetch(`${base}/bench/map500.html`)).ok
    } catch {
      await wait(500)
    }
  }
  if (!up) throw new Error('dev server did not start')
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--enable-precise-memory-info'] })
  const rows = []
  rows.push(await measure(browser, 'desktop 1280x800', { viewport: { width: 1280, height: 800 } }, 1))
  if (process.env.ONLY === 'desktop') {
    console.log(JSON.stringify(rows, null, 2))
    await browser.close()
    process.exit(0)
  }
  rows.push(await measure(browser, 'tablet 1024x768, touch, 4x slower CPU', { viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, 4))
  rows.push(await measure(browser, 'desktop, same map WITHOUT pictures (baseline)', { viewport: { width: 1280, height: 800 } }, 1, false))
  rows.push(await measure(browser, 'tablet, same map WITHOUT pictures (baseline)', { viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, 4, false))
  console.log(JSON.stringify(rows, null, 2))
  await browser.close()
} finally {
  server.kill()
}
