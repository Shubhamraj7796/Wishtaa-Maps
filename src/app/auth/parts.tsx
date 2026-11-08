import { useEffect, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { checkPassword } from '@/core/auth/passwords'
import { AuthFailure } from '@/core/auth/types'
import { toFailure } from '@/core/auth/errors'
import { Check, Eye, EyeOff, X } from '../icons'

export const inputClass = 'w-full rounded-ui border border-line bg-bg px-3 py-2 text-sm focus:border-brand disabled:opacity-60'

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode }) {
  const id = useId()
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className="text-sm">
      <label htmlFor={id} className="mb-1 block font-medium">{label}</label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-err`} className="mt-1 text-xs text-bad">{error}</p>}
    </div>
  )
}

/** A password box with a Show / Hide control (so there is no need to type it twice). */
export function PasswordInput({ value, onChange, autoComplete, id, ...rest }: { value: string; onChange: (v: string) => void; autoComplete: 'current-password' | 'new-password' } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'autoComplete'>) {
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <input {...rest} id={id} type={shown ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} className={`${inputClass} pr-10`} />
      <button type="button" onClick={() => setShown(!shown)} aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown} title={shown ? 'Hide password' : 'Show password'} className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-ui text-muted hover:bg-surface">
        {shown ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
      </button>
    </div>
  )
}

/** The password rules, ticked off as the person types. */
export function PasswordRules({ password, email }: { password: string; email: string }) {
  const rules = checkPassword(password, email)
  return (
    <ul aria-label="Password rules" className="mt-2 space-y-0.5 text-xs">
      {rules.map((r) => (
        <li key={r.id} className={`flex items-center gap-1.5 ${r.ok ? 'text-ok' : 'text-muted'}`}>
          {r.ok ? <Check size={13} aria-hidden="true" /> : <X size={13} aria-hidden="true" />}
          <span>{r.label}</span>
          <span className="sr-only">{r.ok ? '(done)' : '(not yet)'}</span>
        </li>
      ))}
    </ul>
  )
}

/** A message that screen readers announce. */
export function Alert({ children, tone = 'bad' }: { children: ReactNode; tone?: 'bad' | 'ok' | 'info' }) {
  const cls = tone === 'ok' ? 'border-ok/40 bg-ok/10' : tone === 'info' ? 'border-line bg-bg' : 'border-bad/40 bg-bad/10'
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={`rounded-ui border px-3 py-2 text-sm ${cls}`}>
      {children}
    </div>
  )
}

/** Counts down whole seconds to zero (for "Send a new code in 24 s"). */
export function useCountdown(initial: number) {
  const [left, setLeft] = useState(initial)
  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft(left - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  return [left, setLeft] as const
}

/** Runs an async step with loading and error state; the error is always a plain sentence. */
export function useStep() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failure, setFailure] = useState<AuthFailure | null>(null)
  const run = async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true)
    setError(null)
    setFailure(null)
    try {
      return await work()
    } catch (e) {
      const f = toFailure(e)
      setError(f.message)
      setFailure(f)
      return undefined
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, failure, run, clear: () => (setError(null), setFailure(null)) }
}

export function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  )
}

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="4" className="fill-brand" />
      <g className="stroke-brand" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M13 9V3M17 15l5 4M9 15l-5 4" />
      </g>
      <g className="fill-surface stroke-brand" strokeWidth="2">
        <circle cx="13" cy="3" r="2" />
        <circle cx="22" cy="19" r="2" />
        <circle cx="4" cy="19" r="2" />
      </g>
    </svg>
  )
}
