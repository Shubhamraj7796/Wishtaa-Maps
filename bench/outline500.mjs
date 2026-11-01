/* global process, console, window, document, fetch, setTimeout, requestAnimationFrame, performance */
// Scrolls a 500-picture map in the Outline view in a real browser and reports frame rate, rows and pictures drawn, and memory.
//   node bench/outline500.mjs        (CHROMIUM_PATH can point at an installed Chromium)
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = 5193
const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', shell: process.platform === 'win32' })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const base = `http://localhost:${PORT}`

async function run(browser, label, contextOptions, slowdown) {
  const context = await browser.newContext(contextOptions)
  const page = await context.newPage()
  page.on('pageerror', (e) => console.error('PAGE ERROR', e.message))
  await page.goto(`${base}/bench/map500.html`)
  await page.waitForFunction(() => document.title === 'ready', null, { timeout: 120000 })
  const seeded = await page.evaluate(() => window.seed(true, 500, 'column'))
  const cdp = await context.newCDPSession(page)
  if (slowdown > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: slowdown })
  const t0 = Date.now()
  await page.goto(`${base}/map/${seeded.id}`)
  await page.waitForSelector('[data-topic]', { timeout: 120000 })
  await page.getByRole('button', { name: 'Outline' }).first().click()
  await page.waitForSelector('[data-row]', { timeout: 60000 })
  await page.waitForFunction(() => document.querySelector('[data-outline-picture] img'), null, { timeout: 60000 })
  const openMs = Date.now() - t0
  await wait(1000)
  const drawn = await page.evaluate(() => ({ rows: document.querySelectorAll('[data-row]').length, total: Number(document.querySelector('ul[role="tree"]').getAttribute('data-total')), imgs: document.querySelectorAll('[data-outline-picture] img').length }))

  await page.evaluate(() => {
    const b = { frames: [], peakCache: 0, peakRows: 0, peakImgs: 0, peakHeap: 0, running: true, last: performance.now() }
    window.__bench = b
    const tick = (now) => {
      b.frames.push(now - b.last)
      b.last = now
      b.peakCache = Math.max(b.peakCache, window.__pictureCache ? window.__pictureCache.totalBytes : 0)
      b.peakRows = Math.max(b.peakRows, document.querySelectorAll('[data-row]').length)
      b.peakImgs = Math.max(b.peakImgs, document.querySelectorAll('[data-outline-picture] img').length)
      b.peakHeap = Math.max(b.peakHeap, performance.memory ? performance.memory.usedJSHeapSize : 0)
      if (b.running) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const w = contextOptions.viewport.width
  const h = contextOptions.viewport.height
  await page.mouse.move(w / 2, h / 2)
  const t1 = Date.now()
  let y = 0
  while (Date.now() - t1 < 8000) {
    await page.mouse.wheel(0, 240) // a swipe, many times a second
    y += 240
  }
  const result = await page.evaluate(() => {
    const b = window.__bench
    b.running = false
    const f = b.frames.slice(1).sort((x, z) => x - z)
    const avg = f.reduce((t, x) => t + x, 0) / f.length
    return { frames: f.length, fpsAverage: Math.round(1000 / avg), frameMsMedian: Math.round(f[Math.floor(f.length / 2)] * 10) / 10, frameMsP95: Math.round(f[Math.floor(f.length * 0.95)] * 10) / 10, peakRowsDrawn: b.peakRows, peakPicturesDrawn: b.peakImgs, peakDecodedCacheMB: Math.round(b.peakCache / 1048576), peakJsHeapMB: Math.round(b.peakHeap / 1048576) }
  })
  await context.close()
  return { label, openMs, atStart: drawn, scrolledPx: y, ...result }
}

try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/bench/map500.html`)).ok) break
    } catch {
      await wait(500)
    }
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--enable-precise-memory-info'] })
  const rows = []
  rows.push(await run(browser, 'desktop 1280x800', { viewport: { width: 1280, height: 800 } }, 1))
  rows.push(await run(browser, 'tablet 1024x768, touch, 4x slower CPU', { viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, 4))
  console.log(JSON.stringify(rows, null, 2))
  await browser.close()
} finally {
  server.kill()
}
