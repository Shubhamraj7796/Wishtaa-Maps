import { expect, test, type CDPSession, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'

/**
 * Part 2, Group C in a real browser, with SYNTHETIC pointer events (Chrome's input protocol can send a pen with pressure and a touch with a
 * contact size). It checks the logic in the real page: customising the bar, straight-angle correction after holding still, pressure,
 * lasso select (move, recolour, copy, delete), "Stylus only" and palm rejection. It cannot tell how a real stylus reports pressure, how
 * a real palm looks to the browser, or how a pen and a finger feel together: that needs a real tablet.
 */
const DIR = join('test-results', 'pdf-pen')

async function makePdf(): Promise<string> {
  mkdirSync(DIR, { recursive: true })
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= 3; i++) {
    const page = doc.addPage([595, 842])
    page.drawText(`Pen page ${i}`, { x: 50, y: 780, size: 26, font })
  }
  const file = join(DIR, 'pen.pdf')
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

/** Takes the whole screen, shows the pen bar and chooses a tool. */
async function ready(page: Page, tool: string) {
  await page.locator('[data-expand]').click()
  await page.locator('[data-expand]').click()
  await expect(page.locator('[data-pdf-size="full"]')).toBeVisible()
  await page.getByRole('button', { name: 'Markup', exact: true }).click()
  await page.locator(`[data-tool="${tool}"]`).click()
}

const box = async (page: Page) => {
  const b = await page.locator('[data-page="1"]').boundingBox()
  if (!b) throw new Error('no page')
  // The pen bar floats over the left edge of the page: draw to the right of it.
  return { ...b, x: b.x + 220 }
}

type P = [number, number]
/** A pen (or mouse) moving through points; `force` is the pressure at each one. */
async function penStroke(cdp: CDPSession, pts: P[], opts: { force?: (i: number) => number; holdMs?: number; type?: 'pen' | 'mouse' } = {}) {
  const type = opts.type ?? 'pen'
  const f = (i: number) => (type === 'pen' ? (opts.force ? opts.force(i) : 0.5) : undefined)
  const base = { button: 'left' as const, pointerType: type, clickCount: 1 }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[0]![0], y: pts[0]![1], ...base, button: 'none', pointerType: type })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0]![0], y: pts[0]![1], ...base, buttons: 1, force: f(0) })
  for (let i = 1; i < pts.length; i++) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[i]![0], y: pts[i]![1], ...base, buttons: 1, force: f(i) })
  if (opts.holdMs) await new Promise((r) => setTimeout(r, opts.holdMs))
  const last = pts[pts.length - 1]!
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: last[0], y: last[1], ...base, buttons: 0, force: 0 })
}
const along = (x0: number, y0: number, x1: number, y1: number, n = 14, wobble = 0.8): P[] => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n + Math.sin(i * 3) * wobble])
const kinds = (page: Page) => page.evaluate(() => [...document.querySelectorAll('[data-page="1"] [data-markup][data-kind]')].map((e) => e.getAttribute('data-kind')))

test('pen: straight-angle correction, pressure and the customisable bar', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const cdp = await context.newCDPSession(page)
  await openMapWithPdf(page, await makePdf())
  await ready(page, 'pen')
  const b = await box(page)

  // Held still for more than 0.6 s: a nearly straight stroke becomes a straight line.
  await penStroke(cdp, along(b.x + 80, b.y + 200, b.x + 380, b.y + 206), { holdMs: 850 })
  await expect.poll(() => kinds(page)).toEqual(['line'])
  await page.screenshot({ path: join(DIR, 'desktop-1-snapped-line.png') })

  // Lifted at once: it stays a pen stroke. The same stroke with a pressing pen is drawn thicker where it pressed.
  await penStroke(cdp, along(b.x + 80, b.y + 300, b.x + 380, b.y + 330, 14, 6), { force: (i) => 0.15 + (i % 7) * 0.13 })
  await expect.poll(() => kinds(page)).toEqual(['line', 'pen'])
  const widths = await page.evaluate(() => [...document.querySelectorAll('[data-page="1"] g[data-pressure] line')].map((l) => Number(l.getAttribute('stroke-width'))))
  expect(widths.length).toBeGreaterThan(5)
  expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths) * 1.5)
  console.log(`pressure stroke: ${widths.length} segments, thickness ${Math.min(...widths).toFixed(1)} to ${Math.max(...widths).toFixed(1)} px`)

  // A mouse stroke has no pressure and a plain polyline.
  await penStroke(cdp, along(b.x + 80, b.y + 400, b.x + 380, b.y + 430, 14, 6), { type: 'mouse' })
  await expect.poll(() => kinds(page)).toEqual(['line', 'pen', 'pen'])
  expect(await page.locator('[data-page="1"] g[data-pressure]').count()).toBe(1)

  // A nearly closed rectangle held still becomes a clean rectangle.
  const rect: P[] = [...along(b.x + 100, b.y + 500, b.x + 300, b.y + 500, 8), ...along(b.x + 300, b.y + 500, b.x + 300, b.y + 600, 6), ...along(b.x + 300, b.y + 600, b.x + 100, b.y + 600, 8), ...along(b.x + 100, b.y + 600, b.x + 104, b.y + 508, 4)]
  await penStroke(cdp, rect, { holdMs: 850 })
  await expect.poll(() => kinds(page)).toEqual(['line', 'pen', 'pen', 'rect'])
  await page.screenshot({ path: join(DIR, 'desktop-2-snapped-rect.png') })

  // Customise the bar: hide the Eraser, it stays hidden after a reload; Reset brings everything back.
  await page.getByRole('button', { name: 'Customise the tools' }).click()
  await page.getByRole('checkbox', { name: 'Show Eraser' }).uncheck()
  await expect(page.locator('[data-tool="eraser"]')).toHaveCount(0)
  await page.getByRole('checkbox', { name: 'Snap rectangles, circles and ellipses' }).uncheck()
  await page.screenshot({ path: join(DIR, 'desktop-3-customise.png') })
  await page.waitForTimeout(400)
  await page.reload()
  await page.locator('[data-topic]').first().waitFor()
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('wishtaamaps:pdf-tools') ?? '{}'))
  expect(stored.tools).not.toContain('eraser')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('wishtaamaps:pen-prefs') ?? '{}'))).toMatchObject({ snapShapes: false })
  expect(errors).toEqual([])
  await context.close()
})

test('lasso: pick, move, recolour, copy and delete, each one undo step', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await openMapWithPdf(page, await makePdf())
  await ready(page, 'pen')
  const b = await box(page)
  // Two marks to pick (a snapped line and a stroke) and one far away.
  await penStroke(cdp, along(b.x + 100, b.y + 200, b.x + 300, b.y + 202), { holdMs: 850 })
  await penStroke(cdp, along(b.x + 100, b.y + 250, b.x + 300, b.y + 280, 12, 5), { type: 'mouse' })
  await penStroke(cdp, along(b.x + 100, b.y + 700, b.x + 300, b.y + 725, 12, 5), { type: 'mouse' })
  await expect.poll(() => kinds(page)).toEqual(['line', 'pen', 'pen'])

  await page.locator('[data-tool="lasso"]').click()
  const lasso = page.locator('[data-lasso-layer]').first()
  await expect(lasso).toBeVisible()
  await page.mouse.move(b.x + 60, b.y + 160)
  await page.mouse.down()
  for (const [x, y] of [[360, 160], [360, 330], [60, 330], [60, 166]] as P[]) await page.mouse.move(b.x + x, b.y + (y as number), { steps: 5 })
  await page.mouse.up()
  await expect(page.locator('[data-lasso-bar]')).toContainText('2 chosen')
  await page.screenshot({ path: join(DIR, 'desktop-4-lasso.png') })

  const lineX = () => page.evaluate(() => Number(document.querySelector('[data-page="1"] g[data-kind="line"] line')?.getAttribute('x1')))
  const before = await lineX()
  const box1 = await page.locator('[data-lasso-box]').boundingBox()
  if (!box1) throw new Error('no selection box')
  await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2)
  await page.mouse.down()
  await page.mouse.move(box1.x + box1.width / 2 + 80, box1.y + box1.height / 2 + 40, { steps: 6 })
  await page.mouse.up()
  await expect.poll(lineX).toBeCloseTo(before + 80, 0)

  await page.locator('[data-lasso-colour="#2563eb"]').click()
  expect(await page.evaluate(() => [...document.querySelectorAll('[data-page="1"] [data-markup]')].filter((e) => (e.getAttribute('stroke') ?? e.querySelector('line')?.getAttribute('stroke')) === '#2563eb').length)).toBeGreaterThanOrEqual(2)

  await page.locator('[data-lasso-copy]').click()
  await expect.poll(() => kinds(page).then((k) => k.length)).toBe(5)
  await page.locator('[data-lasso-delete]').click() // deletes the two copies (they are the chosen ones)
  await expect.poll(() => kinds(page).then((k) => k.length)).toBe(3)

  // Undo brings the copies back in one step.
  await page.locator('[data-pdf-scroller]').focus()
  await page.keyboard.press('Control+z')
  await expect.poll(() => kinds(page).then((k) => k.length)).toBe(5)
  await page.screenshot({ path: join(DIR, 'desktop-5-after-lasso.png') })
  await context.close()
})

test('finger, palm and "Stylus only" (synthetic touch)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, serviceWorkers: 'block' })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await openMapWithPdf(page, await makePdf())
  await ready(page, 'pen')
  const b = await box(page)
  const touch = async (pts: P[], radius = 6) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0]![0], y: pts[0]![1], radiusX: radius, radiusY: radius, id: 1 }] })
    for (const p of pts.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p[0], y: p[1], radiusX: radius, radiusY: radius, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }

  // A fingertip draws when no pen has been used.
  await touch(along(b.x + 100, b.y + 200, b.x + 300, b.y + 230, 10, 4))
  await expect.poll(() => kinds(page)).toEqual(['pen'])
  // A palm-sized touch does not.
  await touch(along(b.x + 100, b.y + 300, b.x + 300, b.y + 330, 10, 4), 45)
  await page.waitForTimeout(200)
  expect(await kinds(page)).toEqual(['pen'])
  // After a pen has been used, a fingertip is treated as a resting hand.
  await penStroke(cdp, along(b.x + 100, b.y + 400, b.x + 300, b.y + 430, 10, 4))
  await expect.poll(() => kinds(page)).toEqual(['pen', 'pen'])
  await touch(along(b.x + 100, b.y + 500, b.x + 300, b.y + 530, 10, 4))
  await page.waitForTimeout(200)
  expect(await kinds(page)).toEqual(['pen', 'pen'])
  // Palm rejection off: the finger draws again.
  await page.getByRole('button', { name: 'Customise the tools' }).click()
  await page.getByRole('checkbox', { name: 'Palm rejection' }).uncheck()
  await page.getByRole('button', { name: 'Close the settings' }).click()
  await touch(along(b.x + 100, b.y + 560, b.x + 300, b.y + 590, 10, 4))
  await expect.poll(() => kinds(page)).toEqual(['pen', 'pen', 'pen'])
  // Stylus only: a finger never draws, the pen still does.
  await page.getByRole('button', { name: 'Customise the tools' }).click()
  await page.getByRole('checkbox', { name: 'Stylus only' }).check()
  await page.getByRole('button', { name: 'Close the settings' }).click()
  await touch(along(b.x + 100, b.y + 620, b.x + 300, b.y + 650, 10, 4))
  await page.waitForTimeout(200)
  expect(await kinds(page)).toEqual(['pen', 'pen', 'pen'])
  await penStroke(cdp, along(b.x + 100, b.y + 680, b.x + 300, b.y + 700, 10, 4))
  await expect.poll(() => kinds(page)).toEqual(['pen', 'pen', 'pen', 'pen'])
  await page.screenshot({ path: join(DIR, 'tablet-1-stylus-only.png') })
  await context.close()
})
