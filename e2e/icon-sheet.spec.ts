import { test } from '@playwright/test'
import { resolve } from 'node:path'

/** Takes the picture of the icon sheet written by scripts/icon-sheet.tsx (run that first). */
test('icon sheet picture', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 })
  await page.goto('file://' + resolve('docs/screenshots/icons-first/icon-sheet.html').replace(/\\/g, '/'))
  await page.screenshot({ path: 'docs/screenshots/icons-first/icon-sheet.png', fullPage: true })
})
