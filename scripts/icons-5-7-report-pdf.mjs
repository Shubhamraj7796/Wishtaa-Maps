/* global process, console */
// Builds one PDF from the Icons first (steps 5 to 7) pictures, using the installed Chrome.
// Run: CHROME_PATH=... node scripts/icons-5-7-report-pdf.mjs
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join('docs', 'screenshots', 'icons-first-5-7')
const items = [
  ['map-toolbar-desktop.png', 'Map toolbar, desktop 1366 px: icons only, 39 px high (was 51 px), the tooltip names the control and its key'],
  ['map-toolbar-tablet.png', 'Map toolbar, tablet landscape 1024 px (it was already 39 px here)'],
  ['map-toolbar-phone.png', 'Map toolbar, phone 390 px'],
  ['map-toolbar-dark.png', 'Map toolbar, dark mode'],
  ['files-sort-menu-desktop.png', 'Files: Sort is an icon with a small menu of icons (the arrow next to it turns the order round)'],
]
const html = `<html><body style="font-family:Arial,sans-serif;margin:0">${items
  .map(([f, c]) => `<section style="page-break-after:always;padding:16px"><h3 style="margin:0 0 10px 0;font-size:15px">${c}</h3><img style="max-width:100%;max-height:230mm;border:1px solid #ccc" src="data:image/png;base64,${readFileSync(join(dir, f)).toString('base64')}"></section>`)
  .join('')}</body></html>`
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH })
const page = await browser.newPage()
await page.setContent(html)
await page.pdf({ path: join(dir, 'icons-5-7-report.pdf'), format: 'A4', margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' } })
await browser.close()
console.log('PDF written')
