import type { ButtonHTMLAttributes } from 'react'
import { ICON_BOX, ICON_PX, SELECTED, UNSELECTED } from './iconSize'
import { Icon, type IconName } from './icons'
import { useTooltip } from './Tooltip'

type Role = 'radio' | 'menuitemradio' | 'checkbox' | 'menuitemcheckbox'
const isChecked = (role: string | undefined) => role === 'radio' || role === 'menuitemradio' || role === 'checkbox' || role === 'menuitemcheckbox'

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  icon: IconName
  /** The name: the screen-reader name (aria-label) and the tooltip. Required, because the button has no words. */
  label: string
  /** Shortcut shown in the tooltip. */
  keys?: string
  /** The chosen option: shown by a highlighted background. (`active` is the older name for the same thing.) */
  selected?: boolean
  active?: boolean
  /** Small caption under the icon on wide screens (older toolbars; icons-first screens do not use it). */
  caption?: string
  size?: number
}

/**
 * A button that shows an icon and nothing else. Its name is a tooltip on hover, on long-press and on keyboard focus, and its
 * `aria-label` for screen readers. For a radio or a checkbox in a menu pass `role` ("menuitemradio", "menuitemcheckbox", "radio",
 * "checkbox"): the chosen state then goes to `aria-checked` instead of `aria-pressed`.
 */
export function IconButton({ icon, label, keys, selected, active, caption, size = ICON_PX, className = '', role, ...rest }: Props) {
  const tip = useTooltip(label, keys)
  const on = selected ?? active ?? false
  const state = isChecked(role) ? { 'aria-checked': on } : { 'aria-pressed': selected !== undefined || active !== undefined ? on : undefined }
  return (
    <button
      type="button"
      aria-label={label}
      role={role}
      {...state}
      {...tip}
      {...rest}
      onPointerEnter={(e) => (tip.onPointerEnter(e), rest.onPointerEnter?.(e))}
      onPointerLeave={(e) => (tip.onPointerLeave(e), rest.onPointerLeave?.(e))}
      onPointerDown={(e) => (tip.onPointerDown(e), rest.onPointerDown?.(e))}
      onPointerUp={(e) => (tip.onPointerUp(e), rest.onPointerUp?.(e))}
      onFocus={(e) => (tip.onFocus(e), rest.onFocus?.(e))}
      onBlur={(e) => (tip.onBlur(e), rest.onBlur?.(e))}
      className={`group flex shrink-0 select-none flex-col items-center justify-center gap-0.5 rounded-ui border px-2 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        on ? 'border-brand bg-brand/15 text-ink' : 'border-transparent text-ink hover:bg-bg'
      } ${caption ? 'min-w-11' : 'min-w-9'} ${className}`}
    >
      <Icon name={icon} size={size} />
      {caption && <span className="hidden text-[10px] leading-none text-muted xl:block">{caption}</span>}
    </button>
  )
}

interface TileProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'role'> {
  icon: IconName
  label: string
  keys?: string
  selected?: boolean
  size?: number
  role?: Role | 'button' | 'menuitem'
}

/**
 * The one look for a control inside a menu or a bar: the icon alone in a square box (36 px, 44 px on touch), highlighted when chosen.
 * Same behaviour as IconButton (tooltip, aria-label, role for radios and checkboxes), but without the older caption layout.
 */
export function IconTile({ icon, label, keys, selected = false, size = ICON_PX, className = '', role, disabled, ...rest }: TileProps) {
  const tip = useTooltip(label, keys)
  const state = isChecked(role) ? { 'aria-checked': selected } : role === 'menuitem' ? {} : { 'aria-pressed': selected }
  return (
    <button
      type="button"
      aria-label={label}
      role={role}
      disabled={disabled}
      {...state}
      {...tip}
      {...rest}
      onPointerEnter={(e) => (tip.onPointerEnter(e), rest.onPointerEnter?.(e))}
      onPointerLeave={(e) => (tip.onPointerLeave(e), rest.onPointerLeave?.(e))}
      onPointerDown={(e) => (tip.onPointerDown(e), rest.onPointerDown?.(e))}
      onPointerUp={(e) => (tip.onPointerUp(e), rest.onPointerUp?.(e))}
      onFocus={(e) => (tip.onFocus(e), rest.onFocus?.(e))}
      onBlur={(e) => (tip.onBlur(e), rest.onBlur?.(e))}
      className={`grid shrink-0 select-none place-items-center rounded-ui transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${ICON_BOX} ${selected ? SELECTED : UNSELECTED} ${className}`}
    >
      <Icon name={icon} size={size} />
    </button>
  )
}

export interface ToggleItem<T extends string> {
  value: T
  icon: IconName
  label: string
  keys?: string
  disabled?: boolean
}

/** A group of IconTiles of which one is chosen (a radio group): pages on screen, fit width / page / height. */
export function IconToggleGroup<T extends string>({ label, value, onChange, items, itemRole = 'radio', className = '' }: { label: string; value: T | null; onChange: (v: T) => void; items: ToggleItem<T>[]; itemRole?: 'radio' | 'menuitemradio'; className?: string }) {
  return (
    <div role={itemRole === 'radio' ? 'radiogroup' : 'group'} aria-label={label} className={`flex items-center gap-1 ${className}`}>
      {items.map((it) => (
        <IconTile key={it.value} role={itemRole} icon={it.icon} label={it.label} keys={it.keys} disabled={it.disabled} selected={value === it.value} onClick={() => onChange(it.value)} />
      ))}
    </div>
  )
}

/** A round colour button (Document colour): the colour is the icon, a ring shows the chosen one. */
export function Swatch({ label, color, selected, onClick, role = 'radio', filter, className = '', ...rest }: { label: string; color: string; selected: boolean; onClick: () => void; role?: 'radio' | 'menuitemradio'; filter?: string; className?: string } & Record<`data-${string}`, string | undefined>) {
  const tip = useTooltip(label)
  return (
    <button type="button" role={role} aria-label={label} aria-checked={selected} onClick={onClick} {...tip} {...rest} className={`grid select-none place-items-center rounded-full ${ICON_BOX} ${className}`}>
      <span aria-hidden="true" className={`h-6 w-6 rounded-full border ${selected ? 'border-ink ring-2 ring-brand ring-offset-1 ring-offset-surface' : 'border-line'}`} style={{ background: color, filter }} />
    </button>
  )
}

/**
 * A button of any look that shows its name through the shared tooltip (rule 8) instead of the browser's `title`: for the places that keep
 * their own styling (the floating pen bar, flyouts). It has no icon logic of its own; give it an `aria-label` or visible text.
 */
export function TipButton({ tip, keys, children, ...rest }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> & { tip: string; keys?: string }) {
  const t = useTooltip(tip, keys)
  return (
    <button
      type="button"
      {...t}
      {...rest}
      onPointerEnter={(e) => (t.onPointerEnter(e), rest.onPointerEnter?.(e))}
      onPointerLeave={(e) => (t.onPointerLeave(e), rest.onPointerLeave?.(e))}
      onPointerDown={(e) => (t.onPointerDown(e), rest.onPointerDown?.(e))}
      onPointerUp={(e) => (t.onPointerUp(e), rest.onPointerUp?.(e))}
      onFocus={(e) => (t.onFocus(e), rest.onFocus?.(e))}
      onBlur={(e) => (t.onBlur(e), rest.onBlur?.(e))}
    >
      {children}
    </button>
  )
}
