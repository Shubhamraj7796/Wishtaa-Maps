import type { Scene } from '../layout/types'
import { centralFill } from '../theme/model'
import { accentFor, type ResolvedTheme } from '../theme/resolve'

const W = 240
const H = 150

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * A small picture of a map (an SVG data URL): coloured boxes and connecting lines on the map's background.
 * Cheap enough to redo on every save. Very large maps show only their top levels.
 */
export function makeThumbnail(scene: Scene, theme: ResolvedTheme): string {
  const b = scene.bounds
  const bg = `<rect width="${W}" height="${H}" fill="${esc(theme.bg)}"/>`
  if (!scene.boxes.size || b.w <= 0 || b.h <= 0) {
    return svg(`${bg}<rect x="95" y="62" width="50" height="26" rx="8" fill="${esc(centralFill(theme))}"/>`)
  }
  const pad = 10
  const k = Math.min((W - pad * 2) / b.w, (H - pad * 2) / b.h)
  const ox = (W - b.w * k) / 2 - b.x * k
  const oy = (H - b.h * k) / 2 - b.y * k
  const maxDepth = scene.boxes.size > 600 ? 3 : Infinity
  const minSide = 1.6
  const parts: string[] = [bg]

  const lines: string[] = []
  for (const e of scene.edges) {
    const a = scene.boxes.get(e.from)
    const c = scene.boxes.get(e.to)
    if (!a || !c || c.depth > maxDepth) continue
    const x1 = (a.x + a.w / 2) * k + ox
    const y1 = (a.y + a.h / 2) * k + oy
    const x2 = (c.x + c.w / 2) * k + ox
    const y2 = (c.y + c.h / 2) * k + oy
    lines.push(`<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${esc(accentFor(theme, c.branch))}" stroke-width="1.2" opacity=".7"/>`)
  }
  parts.push(`<g fill="none" stroke-linecap="round">${lines.join('')}</g>`)

  for (const box of scene.boxes.values()) {
    if (box.depth > maxDepth) continue
    const color = box.branch < 0 ? centralFill(theme) : accentFor(theme, box.branch)
    const w = Math.max(minSide * 2, box.w * k)
    const h = Math.max(minSide, box.h * k)
    parts.push(`<rect x="${(box.x * k + ox).toFixed(1)}" y="${(box.y * k + oy).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(3, h / 2).toFixed(1)}" fill="${esc(color)}" opacity="${box.depth > 1 ? 0.55 : 0.95}"/>`)
  }
  return svg(parts.join(''))
}

function svg(inner: string): string {
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${inner}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(doc)}`
}
