// Real-browser measurements of the picture pipeline.
//   npm install --no-save playwright   (once; the browser is already installed)
//   node bench/run.mjs
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = 5197
const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', shell: process.platform === 'win32' })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
try {
  let up = false
  for (let i = 0; i < 60 && !up; i++) {
    try {
      up = (await fetch(`http://localhost:${PORT}/bench/pictures.html`)).ok
    } catch {
      await wait(500)
    }
  }
  if (!up) throw new Error('dev server did not start')
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('pageerror', (e) => console.error('PAGE ERROR', e.message))
  await page.goto(`http://localhost:${PORT}/bench/pictures.html`)
  await page.waitForFunction(() => document.title === 'ready', null, { timeout: 120000 })
  const rows = await page.evaluate(() => window.runBench())
  console.log(JSON.stringify(rows, null, 2))
  await browser.close()
} finally {
  server.kill()
}
