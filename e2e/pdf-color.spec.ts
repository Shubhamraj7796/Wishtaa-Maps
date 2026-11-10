import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'

/**
 * Document colour (Part 2, B3) in a real browser: Dark really darkens the page on screen, yet a captured picture keeps the ORIGINAL
 * colours, nothing but the page picture has a filter, the downloaded PDF is the same with or without it, and scrolling in Dark holds its
 * frame rate on a slowed-down, tablet-like profile.
 */
const DIR = join('test-results', 'pdf-color')

async function makePdf(pages = 40): Promise<string> {
  mkdirSync(DIR, { recursive: true })
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([595, 842])
    page.drawText(`Colour page ${i}`, { x: 50, y: 780, size: 26, font })
    for (let l = 0; l < 20; l++) page.drawText(`Line ${l + 1}: the quick brown fox jumps over the lazy dog.`, { x: 50, y: 730 - l * 24, size: 14, font })
  }
  const file = join(DIR, `colour-${pages}.pdf`)
  writeFileSync(file, await doc.save())
  return file
}

async function openMapWithPdf(page: Page, pdf: string) {
  await page.goto('/')
  await page.getByText('Blank mind map').first().click()
  await page.getByRole('button', { name: 'Create' }).click()
  await page.waitForURL('**/map/**')
  await page.locator('[data-topic]').first().waitFor()
  await page.locator('[aria-haspopup="menu"][aria-label^="Insert"]').first().click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'PDF from this device' }).click()
  await (await chooser).setFiles(pdf)
  await expect(page.locator('[data-page="1"] canvas').first()).toBeVisible({ timeout: 30_000 })
}

const colour = async (page: Page, name: 'Light' | 'Dark' | 'Grey' | 'Sepia') => {
  if (!(await page.locator('[data-view-menu]').isVisible())) await page.getByRole('button', { name: 'View options' }).first().click()
  await page.getByRole('menuitemradio', { name: name, exact: false }).filter({ has: page.locator(`xpath=self::*[@data-doc-color-choice]`) }).first().click()
  await page.keyboard.press('Escape')
}

/** The average brightness (0 to 255) of the middle of the first page as it looks on screen. */
async function screenLuminance(page: Page) {
  const box = await page.locator('[data-page="1"]').boundingBox()
  if (!box) throw new Error('no page')
  const png = await page.screenshot({ clip: { x: box.x + 10, y: box.y + 10, width: Math.min(box.width - 20, 300), height: Math.min(box.height - 20, 300) } })
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext('2d') as CanvasRenderingContext2D
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let sum = 0
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * (d[i] as number) + 0.7152 * (d[i + 1] as number) + 0.0722 * (d[i + 2] as number)
    return sum / (d.length / 4)
  }, png.toString('base64'))
}

async function scrollFps(page: Page, ms = 3000) {
  return page.evaluate(async (duration) => {
    const s = document.querySelector('[data-pdf-scroller]') as HTMLElement
    const frames: number[] = []
    let last = performance.now()
    const start = last
    await new Promise<void>((done) => {
      const tick = (now: number) => {
        frames.push(now - last)
        last = now
        s.scrollTop = ((now - start) / duration) * (s.scrollHeight - s.clientHeight) * 0.5
        if (now - start < duration) requestAnimationFrame(tick)
        else done()
      }
      requestAnimationFrame(tick)
    })
    const total = frames.reduce((a, b) => a + b, 0)
    return { fps: Math.round((frames.length / total) * 1000), worstFrameMs: Math.round(Math.max(...frames)) }
  }, ms)
}

test('Dark looks dark on screen, only the page picture is filtered, and a capture keeps the original colours', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openMapWithPdf(page, await makePdf())
  await page.locator('[data-expand]').click()

  await page.waitForTimeout(600)
  const light = await screenLuminance(page)
  await colour(page, 'Dark')
  await page.waitForTimeout(400)
  const dark = await screenLuminance(page)
  await page.screenshot({ path: join(DIR, 'desktop-dark.png') })
  console.log(`page brightness on screen: Light ${Math.round(light)}, Dark ${Math.round(dark)}`)
  expect(light).toBeGreaterThan(200)
  expect(dark).toBeLessThan(80)

  // Only the page pictures carry a filter; the paper, the text layer and everything above are untouched.
  const filtered = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-page] *, [data-page]')].filter((e) => getComputedStyle(e).filter !== 'none').map((e) => e.tagName)
  )
  expect(filtered.length).toBeGreaterThan(0)
  expect(new Set(filtered)).toEqual(new Set(['CANVAS']))

  // A capture made while Dark is on is a picture of the ORIGINAL page: bright paper, not inverted.
  await page.getByRole('button', { name: /capture area/i }).click()
  const box = await page.locator('[data-capture-layer]').first().boundingBox()
  if (!box) throw new Error('no capture layer')
  const before = await page.locator('[data-topic]').count()
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.08)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.16, { steps: 6 })
  await page.mouse.up()
  const asked = await page.getByText('Make the picture smaller?').waitFor({ timeout: 8000 }).then(() => true, () => false)
  if (asked) await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.locator('footer')).toContainText(/Topics 2/, { timeout: 20_000 })
  await page.getByRole('button', { name: 'Fit to screen' }).click() // bring the new topic into view
  await expect.poll(() => page.locator('[data-topic]').count(), { timeout: 10_000 }).toBeGreaterThan(before)
  const topicLuminance = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll<HTMLImageElement>('[data-topic] img')]
    const img = imgs[imgs.length - 1]
    if (!img) return -1
    if (!img.complete) await img.decode().catch(() => undefined)
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const ctx = c.getContext('2d') as CanvasRenderingContext2D
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let sum = 0
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * (d[i] as number) + 0.7152 * (d[i + 1] as number) + 0.0722 * (d[i + 2] as number)
    return sum / (d.length / 4)
  })
  console.log(`captured picture brightness while Dark is on: ${Math.round(topicLuminance)}`)
  expect(topicLuminance).toBeGreaterThan(200)
  expect(errors).toEqual([])
  await context.close()
})

test('the downloaded PDF with markup is the same in Light and Dark', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block', acceptDownloads: true })
  const page = await context.newPage()
  await openMapWithPdf(page, await makePdf(6))
  const download = async () => {
    await page.getByRole('button', { name: /colour-6\.pdf/ }).click()
    const wait = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: 'Download PDF with markup' }).click()
    const file = join(DIR, `download-${Date.now()}.pdf`)
    await (await wait).saveAs(file)
    return readFileSync(file)
  }
  const a = await download()
  await colour(page, 'Dark')
  const b = await download()
  const parsed = await Promise.all([PDFDocument.load(a), PDFDocument.load(b)])
  expect(parsed[1].getPageCount()).toBe(parsed[0].getPageCount())
  expect(Math.abs(a.length - b.length)).toBeLessThan(64) // same content; only a time stamp can differ
  console.log(`download sizes: Light ${a.length} bytes, Dark ${b.length} bytes`)
  await context.close()
})

test('scrolling in Dark on a slowed-down tablet-like profile', async ({ browser }) => {
  test.setTimeout(180_000)
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, serviceWorkers: 'block' })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await openMapWithPdf(page, await makePdf())
  await page.locator('[data-expand]').click()
  await page.waitForTimeout(800)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }) // about a mid-range tablet
  const results: Record<string, unknown> = {}
  for (const name of ['Light', 'Dark', 'Grey', 'Sepia'] as const) {
    await colour(page, name)
    await page.evaluate(() => ((document.querySelector('[data-pdf-scroller]') as HTMLElement).scrollTop = 0))
    await page.waitForTimeout(600)
    results[name] = await scrollFps(page)
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  console.log(`fps with 4x slower CPU: ${JSON.stringify(results)}`)
  writeFileSync(join(DIR, 'fps.json'), JSON.stringify(results, null, 2))
  const dark = results['Dark'] as { fps: number }
  const light = results['Light'] as { fps: number }
  expect(dark.fps).toBeGreaterThanOrEqual(Math.min(30, light.fps * 0.8)) // not meaningfully worse than Light, and at least 30 if Light is
  await context.close()
})
