import { useSyncExternalStore } from 'react'
import { Icon } from '@/ui/icons'
import { getPen, setPen, subscribePen, type PenPrefs } from '../pdf/penPrefs'
import { ALL_TOOLS, type ToolId } from '../pdf/toolPrefs'

const NAMES: Record<ToolId, string> = {
  select: 'Select',
  lasso: 'Lasso (pick markup with a loop)',
  highlight: 'Highlight',
  underline: 'Underline',
  strike: 'Strikethrough',
  pen: 'Pen',
  text: 'Text box',
  shapes: 'Shapes (rectangle, ellipse, line, arrow)',
  whiteout: 'Whiteout',
  eraser: 'Eraser',
  link: 'Link',
}

const PEN_ROWS: { key: keyof PenPrefs; label: string; hint: string }[] = [
  { key: 'pressure', label: 'Pressure', hint: 'A stylus that can sense pressure draws a thicker line when pressed harder' },
  { key: 'snapLines', label: 'Straighten lines when I hold still', hint: 'Hold the pen still for about half a second at the end of a nearly straight stroke and it becomes a straight line (a hooked end becomes an arrow)' },
  { key: 'snapShapes', label: 'Snap rectangles, circles and ellipses', hint: 'The same for a nearly closed stroke' },
  { key: 'palm', label: 'Palm rejection', hint: 'A hand resting on the screen does not draw: not after a pen has been used, not while it is down, and not a very large touch' },
  { key: 'stylusOnly', label: 'Stylus only', hint: 'Only a stylus (or a mouse) draws; a finger always scrolls and zooms' },
]

/**
 * The bar's settings: which tools it shows and in what order, and how the pen behaves. Everything here is kept on this device.
 * "Reset to defaults" brings back every tool, forgets the presets and puts the pen settings back as they start.
 */
export function ToolSettings({ tools, onTools, onReset, onClose, side, top }: { tools: ToolId[]; onTools: (list: ToolId[]) => void; onReset: () => void; onClose: () => void; side: 'left' | 'right'; top: number }) {
  const pen = useSyncExternalStore(subscribePen, getPen)
  // Every tool, the shown ones first in their order; a hidden tool keeps a place at the end.
  const order: ToolId[] = [...tools, ...ALL_TOOLS.filter((t) => !tools.includes(t))]
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= tools.length) return
    const next = [...tools]
    const [t] = next.splice(i, 1)
    next.splice(j, 0, t as ToolId)
    onTools(next)
  }
  const toggle = (t: ToolId) => {
    if (t === 'select') return
    // A tool that comes back goes to the end of the shown ones.
    onTools(tools.includes(t) ? tools.filter((x) => x !== t) : [...tools, t])
  }
  return (
    <div role="dialog" aria-label="Customise the markup tools" data-flyout="settings" className={`absolute z-30 max-h-[80vh] w-72 overflow-y-auto rounded-ui border border-line bg-surface p-3 text-sm shadow-xl ${side === 'left' ? 'left-full ml-2' : 'right-full mr-2'}`} style={{ top: Math.max(0, top - 8) }}>
      <div className="mb-2 flex items-center">
        <span className="flex-1 font-medium">Customise the tools</span>
        <button type="button" aria-label="Close the settings" className="grid h-8 w-8 place-items-center rounded hover:bg-bg [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" onClick={onClose}>
          <Icon name="close" size={15} />
        </button>
      </div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Tools on the bar</p>
      <ul className="mb-3 space-y-0.5">
        {order.map((t) => {
          const i = tools.indexOf(t)
          const on = i >= 0
          return (
            <li key={t} className="flex items-center gap-1" data-tool-row={t}>
              <label className="flex min-w-0 flex-1 items-center gap-2 py-1 [@media(pointer:coarse)]:min-h-11">
                <input type="checkbox" checked={on} disabled={t === 'select'} onChange={() => toggle(t)} aria-label={`Show ${NAMES[t]}`} />
                <span className="truncate">{NAMES[t]}</span>
              </label>
              <button type="button" disabled={!on || i === 0} aria-label={`Move ${NAMES[t]} up`} title="Move up" onClick={() => move(i, -1)} className="grid h-7 w-7 place-items-center rounded hover:bg-bg disabled:opacity-30 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
                <Icon name="chevronDown" size={14} className="rotate-180" />
              </button>
              <button type="button" disabled={!on || i === tools.length - 1} aria-label={`Move ${NAMES[t]} down`} title="Move down" onClick={() => move(i, 1)} className="grid h-7 w-7 place-items-center rounded hover:bg-bg disabled:opacity-30 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
                <Icon name="chevronDown" size={14} />
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Pen</p>
      <ul className="mb-3 space-y-0.5">
        {PEN_ROWS.map((r) => (
          <li key={r.key}>
            <label className="flex items-center gap-2 py-1 [@media(pointer:coarse)]:min-h-11" title={r.hint}>
              <input type="checkbox" checked={pen[r.key]} onChange={(e) => setPen({ [r.key]: e.target.checked })} />
              <span>{r.label}</span>
            </label>
          </li>
        ))}
      </ul>
      <button type="button" data-reset-tools onClick={onReset} className="w-full rounded-ui border border-line px-3 py-2 text-left hover:bg-bg [@media(pointer:coarse)]:min-h-11">
        Reset to defaults
      </button>
    </div>
  )
}
