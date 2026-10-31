/* global process, console, document, location, navigator, fetch, setTimeout, caches, File, DataTransfer, URL, atob */
// Checks the installable app in a real browser, against the production build (run `npx vite build` first):
// installability, offline start, that nothing from Google is kept, the update bar, and a simulated Android share.
//   node bench/pwa.mjs        (CHROMIUM_PATH can point at an installed Chromium)
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 5195
const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', shell: process.platform === 'win32' })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const base = `http://localhost:${PORT}`
const out = {}
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) break
    } catch {
      await wait(500)
    }
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.error('PAGE ERROR', e.message))

  // 1. Installable?
  await page.goto(`${base}/home`)
  await page.evaluate(() => navigator.serviceWorker.ready)
  const cdp = await context.newCDPSession(page)
  const errors = await cdp.send('Page.getInstallabilityErrors')
  const manifest = await cdp.send('Page.getAppManifest')
  out.installabilityErrors = errors.installabilityErrors.map((e) => e.errorId)
  out.manifestErrors = manifest.errors.map((e) => e.message)
  out.manifestName = JSON.parse(manifest.data || '{}').name

  // 2. Does the worker control the page, and what did it save?
  await page.reload()
  out.controlled = await page.evaluate(() => !!navigator.serviceWorker.controller)
  out.cacheNames = await page.evaluate(() => caches.keys())
  out.savedFiles = await page.evaluate(async () => {
    const all = []
    for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) all.push(new URL(r.url).pathname)
    return all
  })

  // 3. Google traffic: the worker must not take it, and nothing from it may be kept.
  const googleSeen = []
  await page.route('https://www.googleapis.com/**', (route) => {
    googleSeen.push(route.request().url())
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"files":[]}', headers: { 'access-control-allow-origin': '*' } })
  })
  await page.evaluate(() => fetch('https://www.googleapis.com/drive/v3/files?q=x', { headers: { Authorization: 'Bearer secret-token' } }).then((r) => r.text()))
  await page.evaluate(() => fetch('https://www.googleapis.com/drive/v3/files?q=y').then((r) => r.text()))
  const keptFromGoogle = await page.evaluate(async () => {
    const hits = []
    for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) if (!new URL(r.url).origin.includes(location.hostname)) hits.push(r.url)
    return hits
  })
  out.googleRequestsReachedTheNetwork = googleSeen.length
  out.keptFromGoogle = keptFromGoogle

  // 3b. Make a map while online (so there is one to open offline).
  await page.goto(`${base}/home`)
  await page.getByRole('button', { name: /Blank mind map/ }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click()
  await page.waitForURL(/\/map\//, { timeout: 30000 })
  await page.waitForSelector('[data-topic]', { timeout: 30000 })
  const mapPath = new URL(page.url()).pathname
  await wait(1500)
  out.cachedScripts = await page.evaluate(async () => (await (await caches.open('wishtaa-assets')).keys()).length)

  // 4. Offline start.
  await context.setOffline(true)
  const times = []
  for (const path of ['/home', '/files', mapPath]) {
    const t0 = Date.now()
    await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#root *', { timeout: 15000 })
    if (path === mapPath) await page.waitForSelector('[data-topic]', { timeout: 15000 })
    times.push({ path: path === mapPath ? '/map/(a map made earlier)' : path, ms: Date.now() - t0, title: await page.title(), hasApp: (await page.locator('body').innerText()).length > 20 })
  }
  out.offlineStarts = times
  await context.setOffline(false)

  // 5. Update: a new build changes the worker; the bar offers it; Reload takes it.
  const buildId = async () => page.evaluate(() => new Promise((res) => { navigator.serviceWorker.addEventListener('message', (e) => e.data?.type === 'VERSION' && res(e.data.build)); navigator.serviceWorker.controller.postMessage({ type: 'VERSION' }) }))
  await page.goto(`${base}/home`)
  await page.evaluate(() => navigator.serviceWorker.ready)
  const before = await buildId()
  const swPath = 'dist/sw.js'
  const original = readFileSync(swPath, 'utf8')
  writeFileSync(swPath, original.replace(/const BUILD = '[^']*'/, "const BUILD = 'newer-build-999'"))
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()))
  await page.getByTestId('update-bar').waitFor({ timeout: 15000 })
  out.updateBarText = (await page.getByTestId('update-bar').innerText()).replace(/\s+/g, ' ')
  out.stillOnOldUntilChosen = (await buildId()) === before
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Reload' }).click()])
  await page.evaluate(() => navigator.serviceWorker.ready)
  out.buildBefore = before
  out.buildAfterReload = await buildId()
  writeFileSync(swPath, original) // put the file back

  // 6. A share from Android: a form post to /share-target, like the system does.
  await page.goto(`${base}/home`)
  await page.evaluate(() => {
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = '/share-target'
    form.enctype = 'multipart/form-data'
    const input = document.createElement('input')
    input.type = 'file'
    input.name = 'pictures'
    const dt = new DataTransfer()
    dt.items.add(new File([png], 'shared.png', { type: 'image/png' }))
    input.files = dt.files
    form.appendChild(input)
    document.body.appendChild(form)
    form.submit()
  })
  await page.waitForURL(/\/home/, { timeout: 15000 })
  const dialog = page.getByRole('dialog', { name: 'Add this picture' })
  await dialog.waitFor({ timeout: 15000 })
  out.shareUrlAfter = new URL(page.url()).pathname + new URL(page.url()).search
  await dialog.getByLabel('Which map?').selectOption('__new__')
  await dialog.getByRole('button', { name: 'Continue' }).click()
  await page.waitForURL(/\/map\//, { timeout: 30000 })
  await page.waitForSelector('[data-topic]', { timeout: 30000 })
  await wait(1500)
  out.cropStepShown = (await page.getByRole('dialog').allInnerTexts()).join(' ').replace(/\s+/g, ' ').slice(0, 120)
  await page.screenshot({ path: 'bench/pwa-share.png' })
  out.sharedLeftInCache = await page.evaluate(async () => (await (await caches.open('wishtaa-share')).keys()).length)

  console.log(JSON.stringify(out, null, 2))
  await browser.close()
} finally {
  server.kill()
}
