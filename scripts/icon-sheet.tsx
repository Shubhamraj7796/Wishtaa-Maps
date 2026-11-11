// Writes docs/screenshots/icons-first/icon-sheet.html: every custom icon at its real size, at phone size and enlarged, each with its name.
// Run with: npx vite-node scripts/icon-sheet.tsx   (e2e/icon-sheet.spec.ts then takes the picture)
import { mkdirSync, writeFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { CUSTOM_ICONS } from '../src/ui/customIcons'
import { Icon } from '../src/ui/icons'

const NAMES: Record<string, string> = {
  pageOne: 'one page',
  pageTwo: 'two pages',
  pageFirstAlone: 'first page alone',
  scrolling: 'scrolling',
  flipOne: '1-page flipping',
  rightToLeft: 'right to left',
  fitWidth: 'fit width',
  fitPage: 'fit page',
  fitHeight: 'fit height',
  actualSize: 'actual size (1:1)',
  presentation: 'presentation',
  siblingAfter: 'new topic after',
  newBranch: 'new branch',
  newTopic: 'make a topic',
}

const tile = (size: number, box: number, selected: boolean, name: string) =>
  `<div style="width:${box}px;height:${box}px;display:grid;place-items:center;border-radius:8px;color:${selected ? '#111827' : '#4b5563'};background:${selected ? 'rgba(13,148,136,0.2)' : 'transparent'};box-shadow:${selected ? 'inset 0 0 0 1px rgba(13,148,136,0.6)' : 'none'}">${renderToStaticMarkup(<Icon name={name as never} size={size} />)}</div>`

const cards = Object.keys(CUSTOM_ICONS)
  .map(
    (name) => `
  <div class="card">
    <div class="row">
      <div class="col"><div class="cap">20 px</div>${tile(20, 36, false, name)}</div>
      <div class="col"><div class="cap">chosen</div>${tile(20, 36, true, name)}</div>
      <div class="col"><div class="cap">phone 36 px</div>${tile(36, 44, false, name)}</div>
      <div class="col"><div class="cap">enlarged</div>${tile(88, 100, false, name)}</div>
    </div>
    <div class="name">${NAMES[name] ?? name}</div>
  </div>`
  )
  .join('\n')

const lucide = ['reset', 'zoomIn', 'zoomOut', 'repeat', 'subTopic', 'notes', 'camera', 'split', 'edit', 'focus', 'openBook']
const context = lucide.map((n) => `<div class="small">${tile(20, 36, false, n)}<div class="cap">${n}</div></div>`).join('')

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Icon sheet</title>
<style>
  body{margin:0;padding:20px;background:#ffffff;color:#111827;font:14px system-ui,sans-serif}
  h1{font-size:16px;margin:0 0 4px} p{margin:0 0 14px;color:#4b5563;font-size:12px}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;max-width:1100px}
  .card{border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px}
  .row{display:flex;gap:18px;align-items:flex-end}
  .col{display:flex;flex-direction:column;align-items:center;gap:4px}
  .cap{font-size:10px;color:#6b7280}
  .name{margin-top:8px;font-weight:600;font-size:13px}
  .set{margin-top:16px;display:flex;gap:14px;flex-wrap:wrap}
  .small{display:flex;flex-direction:column;align-items:center;gap:2px}
</style></head><body>
<h1>New custom icons (14), drawn in the same style as the existing set</h1>
<p>Each is shown at its real size (20 px in a 36 px box), chosen (highlighted background), at phone size (36 px in a 44 px box) and enlarged. Name underneath.</p>
<div class="grid">${cards}</div>
<h1 style="margin-top:18px">For comparison: some existing icons at the same size</h1>
<div class="set">${context}</div>
</body></html>`

mkdirSync('docs/screenshots/icons-first', { recursive: true })
writeFileSync('docs/screenshots/icons-first/icon-sheet.html', html)
console.log('icon sheet written')
