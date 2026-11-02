import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'

/**
 * Production-build smoke test: a PDF is opened from the device at several window sizes and its first page must be drawn. Also fails on
 * any script, worker or decoder file that does not load, and on the error panel ("The PDF panel ran into a problem").
 */
const SIZES = [
  { name: 'narrow window (640)', viewport: { width: 640, height: 800 }, touch: false },
  { name: 'desktop (1280)', viewport: { width: 1280, height: 800 }, touch: false },
  { name: 'phone (390)', viewport: { width: 390, height: 844 }, touch: true },
]

async function makePdf(): Promise<string> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= 3; i++) doc.addPage([400, 300]).drawText(`Smoke test page ${i}`, { x: 40, y: 240, size: 24, font })
  const dir = join('test-results', 'smoke')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'smoke.pdf')
  writeFileSync(file, await doc.save())
  return file
}

async function newMap(page: Page) {
  await page.goto('/')
  await page.getByText('Blank mind map').first().click()
  await page.getByRole('button', { name: 'Create' }).click()
  await page.waitForURL('**/map/**')
  await page.locator('[data-topic]').first().waitFor()
}

for (const size of SIZES) {
  test(`opens a PDF and draws page 1: ${size.name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: size.viewport, hasTouch: size.touch, isMobile: size.touch && size.viewport.width < 800 })
    const page = await context.newPage()
    const problems: string[] = []
    page.on('pageerror', (e) => problems.push(`page error: ${e.message}`))
    page.on('response', (r) => {
      const u = new URL(r.url())
      if ((u.pathname.startsWith('/assets/') || u.pathname.startsWith('/pdfjs/')) && r.status() >= 400) problems.push(`${r.status()} ${u.pathname}`)
      if (u.pathname.startsWith('/assets/') && /\.(js|mjs|css)$/.test(u.pathname) && /text\/html/.test(r.headers()['content-type'] ?? '')) problems.push(`HTML served for ${u.pathname}`)
    })
    const pdf = await makePdf()

    await newMap(page)
    await page.locator('[aria-haspopup="menu"][aria-label^="Insert"]').first().click()
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('menuitem', { name: 'PDF from this device' }).click()
    await (await chooser).setFiles(pdf)

    const first = page.locator('[data-page="1"] canvas')
    await expect(first).toBeVisible({ timeout: 30_000 })
    await expect.poll(async () => (await first.evaluate((c: HTMLCanvasElement) => c.width)) > 10, { timeout: 30_000 }).toBe(true)
    // It is really drawn: some of the page is not white.
    const dark = await first.evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, Math.round(c.height / 2)).data
      let n = 0
      for (let i = 0; i < d.length; i += 4) if ((d[i] ?? 255) < 100) n++
      return n
    })
    expect(dark).toBeGreaterThan(50)
    await expect(page.locator('[data-error-boundary]')).toHaveCount(0)
    await expect(page.locator('[data-pdf-panel]').first()).toBeVisible()
    expect(problems).toEqual([])

    // Again with the service worker in place: reload, open the panel from its button, the PDF is still there.
    await page.evaluate(async () => void (await navigator.serviceWorker?.ready))
    await page.reload()
    await page.locator('[data-topic]').first().waitFor()
    await page.locator('[aria-label^="PDF sources"]').first().click()
    await expect(page.locator('[data-page="1"] canvas')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-error-boundary]')).toHaveCount(0)
    expect(problems).toEqual([])
    await context.close()
  })
}

test('a script that does not exist is a 404, never the app page', async ({ request }) => {
  const r = await request.get('/assets/PdfPanel-DoesNotExist.js')
  expect(r.status()).toBe(404)
  expect(r.headers()['content-type'] ?? '').not.toMatch(/text\/html/)
  const page = await request.get('/home')
  expect(page.status()).toBe(200)
  expect(page.headers()['content-type'] ?? '').toMatch(/text\/html/)
})
