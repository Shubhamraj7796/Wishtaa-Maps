import { useEffect, useRef, useState } from 'react'
import { FILL_PATTERNS, SHAPES, type Corner, type FillKind, type FillPattern, type LineStyle, type Shape, type TopicStyle } from '@/core/model/types'
import { isRectLike, SHAPE_DEFS, SHAPE_NAME } from '@/core/shapes'
import { MAX_TOPIC_WIDTH, MIN_TOPIC_WIDTH, type Look } from '@/core/theme/resolve'
import { ShapeIcon } from '@/ui/icons'
import * as A from '../actions'
import { useEditor } from '../store'
import { Check, Color, Row, Section, field } from './panelKit'

const COLUMNS = 6

/** The picker's grid: the theme's own shape first, then every shape. Arrow keys move, Enter picks, Escape closes. */
export function ShapePicker({ value, onPick }: { value: Shape | undefined; onPick: (s: Shape | undefined) => void }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const options: (Shape | undefined)[] = [undefined, ...SHAPES]
  const [focus, setFocus] = useState(0)

  useEffect(() => {
    if (!open) return
    const i = Math.max(0, options.indexOf(value))
    setFocus(i)
    requestAnimationFrame(() => grid.current?.querySelectorAll<HTMLElement>('[role=menuitemradio]')[i]?.focus())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const close = (restore = true) => {
    setOpen(false)
    if (restore) trigger.current?.focus()
  }
  const move = (to: number) => {
    const n = Math.min(options.length - 1, Math.max(0, to))
    setFocus(n)
    grid.current?.querySelectorAll<HTMLElement>('[role=menuitemradio]')[n]?.focus()
  }
  const onKey = (e: React.KeyboardEvent) => {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNS, ArrowUp: -COLUMNS }
    if (e.key in keys) {
      e.preventDefault()
      move(focus + (keys[e.key] as number))
    } else if (e.key === 'Home') {
      e.preventDefault()
      move(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      move(options.length - 1)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Tab') close(false)
  }

  return (
    <div className="relative">
      <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`Shape: ${value ? SHAPE_NAME(value) : 'from the theme'}. Change`} onClick={() => setOpen(!open)} className={`${field} flex items-center gap-2 hover:bg-bg`}>
        {value ? <ShapeIcon shape={value} size={26} /> : <span className="text-xs">Theme</span>}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onPointerDown={() => close(false)} />
          <div ref={grid} role="menu" aria-label="Shapes" onKeyDown={onKey} className="absolute right-0 top-full z-40 mt-1 w-[19.5rem] max-w-[90vw] rounded-ui border border-line bg-surface p-2 shadow-xl">
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` }}>
              {options.map((sh, i) => (
                <button
                  key={sh ?? 'theme'}
                  type="button"
                  role="menuitemradio"
                  aria-checked={value === sh}
                  aria-label={sh ? SHAPE_NAME(sh) : 'Shape from the theme'}
                  title={sh ? SHAPE_NAME(sh) : 'Follow the theme'}
                  tabIndex={i === focus ? 0 : -1}
                  onClick={() => {
                    onPick(sh)
                    close()
                  }}
                  className={`grid h-11 place-items-center rounded-ui border ${value === sh ? 'border-brand bg-brand/15' : 'border-transparent hover:bg-bg'}`}
                >
                  {sh ? <ShapeIcon shape={sh} size={34} /> : <span className="text-[10px] leading-tight">Theme</span>}
                </button>
              ))}
            </div>
            <p className="px-1 pt-2 text-[11px] text-muted">{SHAPE_DEFS.length} shapes. Arrow keys to move, Enter to choose.</p>
          </div>
        </>
      )}
    </div>
  )
}

const CORNERS: { id: Corner; label: string; d: string }[] = [
  { id: 'square', label: 'Square corners', d: 'M3 17V3H17' },
  { id: 'rounded', label: 'Rounded corners', d: 'M3 17V10Q3 3 10 3H17' },
  { id: 'pill', label: 'Pill (fully round) corners', d: 'M3 17V13A10 10 0 0 1 13 3H17' },
]

const num = (v: string) => (v === '' ? undefined : Number(v))

/** Everything about the look of the selected topic's box: shape, corners, filling, shadow, width and border. */
export function TopicSection({ style: st, look, count }: { style: TopicStyle; look: Look; count: number }) {
  const scope = useEditor((s) => s.styleScope)
  const shape = look.shape
  const rect = isRectLike(shape)
  const filled = look.fillKind !== 'none'
  const set = (p: Partial<TopicStyle>) => A.styleSelected(p)

  return (
    <Section title={count > 1 ? `Topic · ${count} topics` : 'Topic'}>
      <Row label="Apply changes to">
        <select aria-label="Apply changes to" value={scope} onChange={(e) => A.setStyleScope(e.target.value as 'selection' | 'level' | 'branch')} className={field}>
          <option value="selection">Selected topics</option>
          <option value="level">All topics at this level</option>
          <option value="branch">This branch (and below)</option>
        </select>
      </Row>

      <Row label="Shape">
        <ShapePicker value={st.shape} onPick={(s) => set({ shape: s })} />
      </Row>

      <div className="flex items-center justify-between gap-2 text-sm">
        <span>Corner</span>
        <div role="radiogroup" aria-label="Corner" className="flex gap-1">
          {CORNERS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={st.corner === c.id}
              aria-label={c.label}
              title={rect ? c.label : 'Corners apply to box shapes'}
              disabled={!rect}
              onClick={() => set({ corner: st.corner === c.id ? undefined : c.id })}
              className={`grid h-8 w-9 place-items-center rounded-ui border disabled:opacity-40 ${st.corner === c.id ? 'border-brand bg-brand/15' : 'border-line hover:bg-bg'}`}
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d={c.d} />
              </svg>
            </button>
          ))}
        </div>
      </div>

      <Check label="Filling" checked={filled} onChange={(v) => set({ fillKind: v ? (st.fillKind && st.fillKind !== 'none' ? st.fillKind : 'solid') : 'none' })} />
      {filled && (
        <div className="space-y-2 pl-6">
          <Row label="Type">
            <select aria-label="Filling type" value={look.fillKind} onChange={(e) => set({ fillKind: e.target.value as FillKind })} className={field}>
              <option value="solid">Solid colour</option>
              <option value="gradient">Gradient</option>
              <option value="pattern">Pattern</option>
            </select>
          </Row>
          <Color label={look.fillKind === 'gradient' ? 'From' : 'Colour'} value={look.fill === 'transparent' ? look.border : look.fill} onChange={(v) => set({ fill: v })} onClear={st.fill ? () => set({ fill: undefined }) : undefined} />
          {look.fillKind === 'gradient' && <Color label="To" value={look.fill2} onChange={(v) => set({ fill2: v })} onClear={st.fill2 ? () => set({ fill2: undefined }) : undefined} />}
          {look.fillKind === 'pattern' && (
            <>
              <Row label="Pattern">
                <select aria-label="Pattern" value={look.pattern} onChange={(e) => set({ pattern: e.target.value as FillPattern })} className={field}>
                  {FILL_PATTERNS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Row>
              <Color label="Pattern colour" value={look.fill2} onChange={(v) => set({ fill2: v })} onClear={st.fill2 ? () => set({ fill2: undefined }) : undefined} />
            </>
          )}
        </div>
      )}

      <Check label="Shadow" checked={look.shadow} onChange={(v) => set({ shadow: v ? true : undefined })} />

      <Check label="Custom width" checked={look.width !== null} onChange={(v) => set({ width: v ? 200 : undefined })} hint="The text wraps inside the width. Drag the handle on the selected topic, or press Alt+Shift+Left or Right." />
      {look.width !== null && (
        <div className="pl-6">
          <Row label="Width (px)">
            <input
              type="number"
              aria-label="Width in pixels"
              min={MIN_TOPIC_WIDTH}
              max={MAX_TOPIC_WIDTH}
              step={10}
              value={look.width}
              onChange={(e) => {
                const v = num(e.target.value)
                if (v !== undefined && Number.isFinite(v)) A.commitTopicWidth(v)
              }}
              className={`${field} w-24`}
            />
          </Row>
          <p className="pt-1 text-[11px] text-muted">
            {MIN_TOPIC_WIDTH} to {MAX_TOPIC_WIDTH} px.
          </p>
        </div>
      )}

      {shape === 'doubleCircle' && (
        <div className="space-y-2 rounded-ui border border-line p-2.5" role="group" aria-label="Double circle">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Double circle</div>
          <Color label="Inner circle" value={look.innerFill === 'transparent' ? look.border : look.innerFill} onChange={(v) => set({ innerFill: v })} onClear={st.innerFill ? () => set({ innerFill: undefined }) : undefined} />
          <Color label="Ring" value={look.ringColor} onChange={(v) => set({ ringColor: v })} onClear={st.ringColor ? () => set({ ringColor: undefined }) : undefined} />
          <Row label="Ring thickness">
            <input type="number" aria-label="Ring thickness" min={1} max={30} value={look.ringWidth} onChange={(e) => set({ ringWidth: num(e.target.value) })} className={`${field} w-20`} />
          </Row>
          <Row label="Gap">
            <input type="number" aria-label="Gap between ring and inner circle" min={0} max={30} value={look.ringGap} onChange={(e) => set({ ringGap: num(e.target.value) })} className={`${field} w-20`} />
          </Row>
        </div>
      )}

      <div className="border-t border-line pt-2 text-xs font-semibold uppercase tracking-wide text-muted">Border</div>
      <Color label="Border colour" value={look.border} onChange={(v) => set({ border: v })} onClear={st.border ? () => set({ border: undefined }) : undefined} />
      <Row label="Weight">
        <input type="number" aria-label="Border weight" min={0} max={12} step={0.5} value={st.borderWidth ?? ''} placeholder={String(look.borderWidth)} onChange={(e) => set({ borderWidth: num(e.target.value) })} className={`${field} w-20`} />
      </Row>
      <Row label="Dashes">
        <select aria-label="Border dashes" value={st.borderDash ?? 'solid'} onChange={(e) => set({ borderDash: e.target.value === 'solid' ? undefined : (e.target.value as LineStyle) })} className={field}>
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </Row>
      <Row label="Border style">
        <select aria-label="Border style" value={st.borderLine ?? 'single'} onChange={(e) => set({ borderLine: e.target.value === 'double' ? 'double' : undefined })} className={field}>
          <option value="single">Single</option>
          <option value="double">Double</option>
        </select>
      </Row>
    </Section>
  )
}
