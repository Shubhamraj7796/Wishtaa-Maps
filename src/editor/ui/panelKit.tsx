import { ColorPicker, type ColorPickerProps } from './ColorPicker'

export const field = 'rounded-ui border border-line bg-surface px-2 py-1 text-sm'

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="shrink-0">{label}</span>
      {children}
    </label>
  )
}

export function Check({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm" title={hint}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-brand))]" />
      <span>{label}</span>
    </label>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 border-b border-line px-4 py-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  )
}

/** A colour row: a swatch that opens the colour picker (scheme colours, recent, hex, eyedropper, opacity, contrast). */
export function Color({ label, value, onChange, onClear, ...more }: { label: string; value: string; onChange: (v: string) => void; onClear?: () => void } & Pick<ColorPickerProps, 'onNone' | 'opacity' | 'onOpacityPreview' | 'onOpacityCommit' | 'contrastAgainst'>) {
  return <ColorPicker label={label} value={value} onChange={onChange} onClear={onClear} {...more} />
}
