import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'

/**
 * Several PDFs in tabs and a split view, in a real browser on the production build: five PDFs of 200 pages each. Measures the memory the
 * page holds (JS heap and canvases) and the frame rate while scrolling, one pane and two panes, and writes the numbers to
 * test-results/pdf-tabs/numbers.json. Screenshots at desktop, tablet and phone size.
 */
const DIR = join('test-results', 'pdf-tabs')
const NAMES = ['Audit.pdf', 'Tax.pdf', 'Law.pdf', 'Costing.pdf', 'FR.pdf']
const PAGES = 200

async function makeFiles(): Promise<string[]> {
  mkdirSync(DIR, { recursive: true })
  const out: string[] = []
  for (const name of NAMES) {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    for (let i = 1; i <= PAGES; i++) {
      const page = doc.addPage([595, 842])
      page.drawText(`${name} page ${i}`, { x: 50, y: 780, size: 22, font })
      for (let l = 0; l < 30; l++) page.drawText(`Line ${l + 1} of ${name}, page ${i}: the quick brown fox jumps over the lazy dog.`, { x: 50, y: 740 - l * 22, size: 11, font })
    }
    const file = join(DIR, name)
    writeFileSync(file, await doc.save())
    out.push(file)
  }
  return out
}

async function openMap(page: Page) {
  await page.goto('/')
  await page.getByText('Blank mind map').first().click()
  await page.getByRole('button', { name: 'Create' }).click()
  await page.waitForURL('**/map/**')
  await page.locator('[data-topic]').first().waitFor()
}

/** Scrolls every visible PDF pane for `ms`, counting frames; returns frames per second and the worst frame in ms. */
async function scrollFps(page: Page, ms = 3000) {
  return page.evaluate(async (duration) => {
    const scrollers = [...document.querySelectorAll<HTMLElement>('[data-pdf-scroller]')]
    const frames: number[] = []
    let last = performance.now()
    const start = last
    await new Promise<void>((done) => {
      const tick = (now: number) => {
        frames.push(now - last)
        last = now
        const k = (now - start) / duration
        scrollers.forEach((s) => (s.scrollTop = k * (s.scrollHeight - s.clientHeight) * 0.6))
        if (now - start < duration) requestAnimationFrame(tick)
        else done()
      }
      requestAnimationFrame(tick)
    })
    const total = frames.reduce((a, b) => a + b, 0)
    return { fps: Math.round((frames.length / total) * 1000), worstFrameMs: Math.round(Math.max(...frames)) }
  }, ms)
}

async function heapMB(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  await cdp.send('HeapProfiler.collectGarbage').catch(() => undefined)
  const { metrics } = await cdp.send('Performance.getMetrics')
  const dom = await cdp.send('Memory.getDOMCounters').catch(() => ({ nodes: 0 }))
  await cdp.detach()
  return { heapMB: Math.round(((metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0) / 1048576) * 10) / 10, domNodes: (dom as { nodes: number }).nodes }
}

const canvases = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLCanvasElement>('[data-pdf-scroller] canvas')].filter((c) => c.width > 10).length)

test('five PDFs of 200 pages: tabs, split view, memory and frame rate', async ({ browser }) => {
  test.setTimeout(240_000)
  const files = await makeFiles()
  const numbers: Record<string, unknown> = { pdfs: NAMES.length, pagesEach: PAGES }
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openMap(page)
  numbers.heapBefore = await heapMB(page)

  await page.locator('[aria-haspopup="menu"][aria-label^="Insert"]').first().click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'PDF from this device' }).click()
  await (await chooser).setFiles(files)

  const strip = page.getByRole('tablist', { name: 'Open PDFs' })
  await expect(strip.getByRole('tab')).toHaveCount(5, { timeout: 90_000 })
  await expect(page.locator('[data-page="1"] canvas').first()).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: join(DIR, 'desktop-1-tabs.png') })

  // Each tab keeps its own place: scroll Audit down, go to Tax, come back.
  await strip.getByRole('tab', { name: /Audit/ }).getByRole('button').first().click()
  await page.locator('[data-pdf-scroller]').first().waitFor()
  await page.waitForTimeout(500)
  await page.evaluate(() => ((document.querySelector('[data-pdf-scroller]') as HTMLElement).scrollTop = 20000))
  await page.waitForTimeout(700)
  const auditPage = await page.getByLabel('Page number').inputValue()
  await strip.getByRole('tab', { name: /Tax/ }).getByRole('button').first().click()
  expect(await page.getByLabel('Page number').inputValue()).toBe('1')
  await strip.getByRole('tab', { name: /Audit/ }).getByRole('button').first().click()
  await page.waitForTimeout(700)
  expect(await page.getByLabel('Page number').inputValue()).toBe(auditPage)
  expect(Number(auditPage)).toBeGreaterThan(5)
  numbers.auditPageKept = auditPage

  // One pane: scroll through, measure.
  numbers.onePane = { ...(await scrollFps(page)), ...(await heapMB(page)), canvases: await canvases(page) }

  // Visit every tab twice (the memory budget lets the background ones go), then measure.
  for (let round = 0; round < 2; round++) for (const n of NAMES) await strip.getByRole('tab', { name: new RegExp(n.replace('.pdf', '')) }).getByRole('button').first().click()
  await page.waitForTimeout(800)
  numbers.afterVisitingAll = { ...(await heapMB(page)), canvases: await canvases(page) }

  // Split: two panes, independent pages, sync scrolling.
  await page.getByRole('button', { name: /^split$/i }).click()
  await expect(page.locator('[data-pdf-pane]')).toHaveCount(2)
  await page.screenshot({ path: join(DIR, 'desktop-2-split.png') })
  numbers.twoPanes = { ...(await scrollFps(page)), ...(await heapMB(page)), canvases: await canvases(page) }
  await page.getByLabel('Sync scrolling').check()
  numbers.twoPanesSynced = { ...(await scrollFps(page)), ...(await heapMB(page)), canvases: await canvases(page) }

  // Tablet and phone: the split stacks on a narrow screen.
  await page.setViewportSize({ width: 820, height: 1100 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(DIR, 'tablet-3-split.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(DIR, 'phone-4-split.png') })

  writeFileSync(join(DIR, 'numbers.json'), JSON.stringify(numbers, null, 2))
  console.log(JSON.stringify(numbers))
  // Budgets: a page of canvases stays small, and the frame rate holds.
  expect((numbers.onePane as { canvases: number }).canvases).toBeLessThanOrEqual(10)
  expect((numbers.twoPanes as { canvases: number }).canvases).toBeLessThanOrEqual(20)
  expect((numbers.onePane as { fps: number }).fps).toBeGreaterThanOrEqual(20)
  expect((numbers.afterVisitingAll as { heapMB: number }).heapMB).toBeLessThan(400)
  expect(errors).toEqual([])
  await context.close()
})
