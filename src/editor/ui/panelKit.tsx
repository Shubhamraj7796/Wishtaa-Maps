import { isHex } from '@/core/theme/color'

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

export function Color({ label, value, onChange, onClear }: { label: string; value: string; onChange: (v: string) => void; onClear?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span>{label}</span>
      <span className="flex items-center gap-1.5">
        <input aria-label={label} type="color" value={isHex(value) ? value : '#ffffff'} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent p-0.5" />
        {onClear && (
          <button type="button" onClick={onClear} className="rounded px-1.5 text-xs text-muted hover:text-ink" title="Back to the theme's colour">
            Auto
          </button>
        )}
      </span>
    </div>
  )
}
