import type { ButtonHTMLAttributes } from 'react'
import { Icon, type IconName } from './icons'

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  icon: IconName
  /** Describes the button: used as the tooltip and the screen-reader name. */
  label: string
  /** Shortcut shown in the tooltip. */
  keys?: string
  active?: boolean
  /** Small caption under the icon on wide screens. */
  caption?: string
  size?: number
}

/** A button that shows an icon. The label is always available as a tooltip and to screen readers. */
export function IconButton({ icon, label, keys, active, caption, size = 18, className = '', ...rest }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={keys ? `${label} (${keys})` : label}
      {...rest}
      className={`group flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-ui border px-2 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'border-brand bg-brand/15 text-ink' : 'border-transparent text-ink hover:bg-bg'
      } ${caption ? 'min-w-11' : 'min-w-9'} ${className}`}
    >
      <Icon name={icon} size={size} />
      {caption && <span className="hidden text-[10px] leading-none text-muted xl:block">{caption}</span>}
    </button>
  )
}
