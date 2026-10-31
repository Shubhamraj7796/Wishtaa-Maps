/* global process, console, window, document, location, fetch, setTimeout, PerformanceObserver, MutationObserver */
// Imports tests/fixtures/IND_AS_116.emmx in a real browser and reports how long the page was blocked (long tasks) and how long it took.
//   node bench/import116.mjs      (CHROMIUM_PATH can point at an installed Chromium)
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = 5196
const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', shell: process.platform === 'win32' })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/`)).ok) break
    } catch {
      await wait(500)
    }
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true })
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
  page.on('pageerror', (e) => console.error('PAGE ERROR', e.message))
  await page.goto(`http://localhost:${PORT}/home`)
  await page.getByRole('button', { name: /Import/ }).first().waitFor()
  await page.evaluate(() => {
    window.__long = []
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] })
    window.__texts = []
    new MutationObserver(() => {
      const t = document.querySelector('[role="status"]')?.textContent
      if (t && window.__texts[window.__texts.length - 1] !== t) window.__texts.push(t)
    }).observe(document.body, { childList: true, subtree: true, characterData: true })
  })
  const t0 = Date.now()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /Import/ }).first().click()
  const choose = page.getByRole('button', { name: 'Choose file…' })
  if (await choose.isVisible().catch(() => false)) await choose.click()
  ;(await chooser).setFiles('tests/fixtures/IND_AS_116.emmx')
  const dialog = page.getByRole('dialog', { name: 'Picture size' })
  await dialog.waitFor({ timeout: 120000 })
  const askedAfter = Date.now() - t0
  const question = await dialog.getByTestId('choice-summary').textContent()
  await dialog.getByRole('button', { name: 'Add' }).click()
  const answered = Date.now()
  await page.waitForFunction(() => /\/map\//.test(location.pathname) || /Import (report|finished|complete)|Opened|imported/i.test(document.body.innerText), null, { timeout: 120000 }).catch(() => undefined)
  await page.screenshot({ path: 'bench/import116.png' })
  console.log('URL', page.url())
  const total = Date.now() - t0
  const info = await page.evaluate(() => ({ long: window.__long, texts: window.__texts.filter((t) => /Reading|Checking|Saving|Opening|Importing/.test(t)) }))
  console.log(JSON.stringify({ question, msUntilQuestion: askedAfter, msAfterAnswer: Date.now() - answered, totalMs: total, longTasksMs: info.long, longestMs: Math.max(0, ...info.long), progressShown: info.texts.slice(0, 6), progressSteps: info.texts.length }, null, 2))
  // Open the map and look at it.
  await page.getByRole('dialog').getByRole('button', { name: 'Open', exact: true }).click()
  await page.waitForSelector('[data-topic]', { timeout: 60000 })
  await wait(3000)
  await page.screenshot({ path: 'bench/import116-map.png' })
  await browser.close()
} finally {
  server.kill()
}
