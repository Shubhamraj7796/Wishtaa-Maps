import { expect, test } from '@playwright/test'
import type { Server } from 'node:http'
import { serve } from './serve.mjs'

/**
 * Deploy skew. A tab is opened on one build (with its service worker installed), the address is then switched to a DIFFERENT build (as a
 * deploy does), and the PDF button is pressed in the tab that is still running the old scripts. The panel's file no longer exists, and
 * the tab must update itself ONCE and then show the PDF panel. Needs two builds:
 *   npm run e2e:skew      (builds both, then runs this)
 * or SKEW_OLD and SKEW_NEW pointing at two built folders.
 */
const OLD = process.env.SKEW_OLD
const NEW = process.env.SKEW_NEW

for (const oldHost of [false, true]) {
  test(`a stale tab updates itself once when the PDF panel's file is gone (${oldHost ? 'host answers with the app page' : 'host answers 404'})`, async ({ browser }) => {
    test.skip(!OLD || !NEW, 'set SKEW_OLD and SKEW_NEW (see npm run e2e:skew)')
    const port = oldHost ? 4192 : 4191
    let server: Server = await serve(OLD as string, port, { oldHost })
    const context = await browser.newContext({ viewport: { width: 640, height: 800 } })
    const page = await context.newPage()
    const navigations: string[] = []
    try {
      await page.goto(`http://127.0.0.1:${port}/`)
      await page.getByText('Blank mind map').first().click()
      await page.getByRole('button', { name: 'Create' }).click()
      await page.waitForURL('**/map/**')
      await page.locator('[data-topic]').first().waitFor()
      await page.evaluate(async () => void (await navigator.serviceWorker.ready))
      const before = await page.evaluate(() => [...document.scripts].map((s) => s.src).find((s) => s.includes('/assets/index-')))

      // The deploy: the same address now serves the other build.
      await new Promise((ok) => server.close(ok))
      server = await serve(NEW as string, port, { oldHost })
      page.on('framenavigated', (f) => f === page.mainFrame() && navigations.push(f.url()))

      await page.locator('[aria-label^="PDF sources"]').first().click()
      // It recovers by itself: one reload, then the new version shows the PDF panel without another click.
      await expect(page.locator('[data-pdf-panel]').first()).toBeVisible({ timeout: 30_000 })
      const after = await page.evaluate(() => [...document.scripts].map((s) => s.src).find((s) => s.includes('/assets/index-')))
      expect(after).not.toBe(before)
      expect(navigations.length).toBe(1) // one reload, never a loop
      await expect(page.locator('[data-error-boundary]')).toHaveCount(0)
      // Nothing from the broken request is left in the app's cache.
      const misfiled = await page.evaluate(async () => {
        const bad: string[] = []
        for (const n of await caches.keys()) {
          const c = await caches.open(n)
          for (const k of await c.keys()) if (/\/assets\/.*\.js$/.test(k.url) && /text\/html/.test((await c.match(k))?.headers.get('content-type') ?? '')) bad.push(k.url)
        }
        return bad
      })
      expect(misfiled).toEqual([])
    } finally {
      await context.close()
      await new Promise((ok) => server.close(ok))
    }
  })
}
