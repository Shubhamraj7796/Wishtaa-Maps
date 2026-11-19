/* global process, console */
// Builds one PDF from the Task view Month and Board pictures, using the installed Chrome.
// Run: CHROME_PATH=... node scripts/task-month-board-report-pdf.mjs
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join('docs', 'screenshots', 'task-month-board')
const items = [
  ['month-desktop.png', 'Month calendar, desktop 1366 px: tasks on their days, today marked, the picked day listed at the right'],
  ['month-phone.png', 'Month calendar, phone 390 px: small dots on the days, the picked day listed below'],
  ['month-dark.png', 'Month calendar, dark mode'],
  ['board-desktop.png', 'Board, desktop: To do, Doing and Done; drag a card, or use the two icons on a card'],
  ['board-phone.png', 'Board, phone: columns side by side, scroll sideways inside the board'],
  ['board-dark.png', 'Board, dark mode'],
]
const html = `<html><body style="font-family:Arial,sans-serif;margin:0">${items
  .map(([f, c]) => `<section style="page-break-after:always;padding:16px"><h3 style="margin:0 0 10px 0;font-size:15px">${c}</h3><img style="max-width:100%;max-height:230mm;border:1px solid #ccc" src="data:image/png;base64,${readFileSync(join(dir, f)).toString('base64')}"></section>`)
  .join('')}</body></html>`
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH })
const page = await browser.newPage()
await page.setContent(html)
await page.pdf({ path: join(dir, 'task-month-board-report.pdf'), format: 'A4', margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' } })
await browser.close()
console.log('PDF written')
