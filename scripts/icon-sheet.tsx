// Writes docs/screenshots/icons-first/icon-sheet.html: every custom icon at its real size (20 px in a 36 px box), chosen, and at phone size
// (36 px in a 44 px box), on a light and on a dark background, plus enlarged, each with its name.
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

type Theme = 'light' | 'dark'
const INK: Record<Theme, { icon: string; chosenIcon: string; chosenBg: string; chosenRing: string }> = {
  light: { icon: '#4b5563', chosenIcon: '#111827', chosenBg: 'rgba(13,148,136,0.2)', chosenRing: 'rgba(13,148,136,0.6)' },
  dark: { icon: '#cbd5e1', chosenIcon: '#f8fafc', chosenBg: 'rgba(45,212,191,0.25)', chosenRing: 'rgba(45,212,191,0.6)' },
}

const tile = (theme: Theme, size: number, box: number, selected: boolean, name: string) => {
  const c = INK[theme]
  return `<div style="width:${box}px;height:${box}px;display:grid;place-items:center;border-radius:8px;color:${selected ? c.chosenIcon : c.icon};background:${selected ? c.chosenBg : 'transparent'};box-shadow:${selected ? `inset 0 0 0 1px ${c.chosenRing}` : 'none'}">${renderToStaticMarkup(<Icon name={name as never} size={size} />)}</div>`
}

const group = (theme: Theme, name: string) => `
      <div class="grp ${theme}">
        <div class="col"><div class="cap">20 px</div>${tile(theme, 20, 36, false, name)}</div>
        <div class="col"><div class="cap">chosen</div>${tile(theme, 20, 36, true, name)}</div>
        <div class="col"><div class="cap">phone 36</div>${tile(theme, 36, 44, false, name)}</div>
      </div>`

const cards = Object.keys(CUSTOM_ICONS)
  .map(
    (name) => `
  <div class="card">
    <div class="name">${NAMES[name] ?? name}</div>
    <div class="row">
      ${group('light', name)}
      ${group('dark', name)}
      <div class="col big"><div class="cap">enlarged</div>${tile('light', 72, 84, false, name)}</div>
    </div>
  </div>`
  )
  .join('\n')

const lucide = ['reset', 'zoomIn', 'zoomOut', 'repeat', 'subTopic', 'notes', 'camera', 'split', 'edit', 'focus', 'preview', 'panelLeftClose']
const context = lucide.map((n) => `<div class="small">${tile('light', 20, 36, false, n)}<div class="cap">${n}</div></div>`).join('')

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Icon sheet</title>
<style>
  body{margin:0;padding:20px;background:#ffffff;color:#111827;font:14px system-ui,sans-serif}
  h1{font-size:16px;margin:0 0 4px} p{margin:0 0 14px;color:#4b5563;font-size:12px}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;max-width:1240px}
  .card{border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px}
  .row{display:flex;gap:14px;align-items:flex-end}
  .grp{display:flex;gap:12px;padding:8px 10px;border-radius:8px;align-items:flex-end}
  .grp.light{background:#ffffff;border:1px solid #e5e7eb}
  .grp.dark{background:#111827;border:1px solid #1f2937}
  .grp.dark .cap{color:#94a3b8}
  .col{display:flex;flex-direction:column;align-items:center;gap:4px}
  .cap{font-size:10px;color:#6b7280}
  .name{margin:0 0 8px;font-weight:600;font-size:13px}
  .set{margin-top:16px;display:flex;gap:14px;flex-wrap:wrap}
  .small{display:flex;flex-direction:column;align-items:center;gap:2px}
</style></head><body>
<h1>The 14 new custom icons, light and dark</h1>
<p>For each icon: its real size (20 px in a 36 px box), chosen (highlighted background), and phone size (36 px in a 44 px box), on a light and on a dark background; then enlarged. The name is above each row.</p>
<div class="grid">${cards}</div>
<h1 style="margin-top:18px">For comparison: some existing icons at the same size</h1>
<div class="set">${context}</div>
</body></html>`

mkdirSync('docs/screenshots/icons-first', { recursive: true })
writeFileSync('docs/screenshots/icons-first/icon-sheet.html', html)
console.log('icon sheet written')
