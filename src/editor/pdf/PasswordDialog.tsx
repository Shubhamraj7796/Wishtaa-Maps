import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../store'
import { answerPassword } from './password'

/** "This PDF is password protected. Enter the password." Shown over the editor whenever a PDF being added asks for one. */
export function PasswordDialog() {
  const ask = useEditor((s) => s.pdfPassword)
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    setValue('')
    if (ask) input.current?.focus()
  }, [ask])
  if (!ask) return null
  return (
    <div className="fixed inset-0 z-[95] grid place-items-center bg-black/40 p-3" role="presentation">
      <form
        role="dialog"
        aria-modal="true"
        aria-label="PDF password"
        className="w-full max-w-sm rounded-ui border border-line bg-surface p-4 shadow-2xl"
        onSubmit={(e) => {
          e.preventDefault()
          if (value) answerPassword(value)
        }}
        onKeyDown={(e) => e.key === 'Escape' && answerPassword(null)}
      >
        <h2 className="text-base font-semibold">This PDF is password protected</h2>
        <p className="mt-1 break-words text-sm text-muted">Enter the password for “{ask.name}”. It is used to open the file now and is not saved.</p>
        <input ref={input} type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Password" aria-invalid={ask.wrong} className="mt-3 w-full rounded border border-line bg-surface px-2 py-2 text-sm" />
        {ask.wrong && <p role="alert" className="mt-1 text-sm text-bad">That password is not right. Try again.</p>}
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="rounded-ui border border-line px-3 py-2 text-sm [@media(pointer:coarse)]:min-h-11" onClick={() => answerPassword(null)}>
            Cancel
          </button>
          <button type="submit" disabled={!value} className="rounded-ui bg-brand px-3 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50 [@media(pointer:coarse)]:min-h-11">
            Open
          </button>
        </div>
      </form>
    </div>
  )
}
