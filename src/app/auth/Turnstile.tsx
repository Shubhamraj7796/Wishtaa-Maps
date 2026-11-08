import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { authConfig } from '@/core/auth/config'

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string
  reset(id: string): void
  remove(id: string): void
}
declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile)
    const s = document.createElement('script')
    s.src = SCRIPT
    s.async = true
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Security check did not load')))
    s.onerror = () => {
      loading = null
      reject(new Error('Security check did not load'))
    }
    document.head.appendChild(s)
  })
  return loading
}

export interface Captcha {
  /** Put this where the check should appear (nothing when no CAPTCHA is set up). */
  element: ReactNode
  /** The one-time token to send with the request, once the check passed. */
  token: string | undefined
  /** True when a check is required before sending. */
  needed: boolean
  /** The check could not load (blocked or offline). */
  failed: boolean
  /** A token works once: ask for a fresh check after every request. */
  reset: () => void
}

/** Cloudflare Turnstile (managed, usually invisible). Does nothing until VITE_TURNSTILE_SITE_KEY is set. */
export function useCaptcha(): Captcha {
  const siteKey = authConfig.turnstileSiteKey
  const [token, setToken] = useState<string>()
  const [failed, setFailed] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const id = useRef<string>()

  useEffect(() => {
    if (!siteKey) return
    let gone = false
    loadTurnstile().then(
      (t) => {
        if (gone || !box.current) return
        id.current = t.render(box.current, {
          sitekey: siteKey,
          theme: 'auto',
          callback: (v: string) => setToken(v),
          'expired-callback': () => setToken(undefined),
          'error-callback': () => {
            setToken(undefined)
            setFailed(true)
          },
        })
      },
      () => setFailed(true)
    )
    return () => {
      gone = true
      if (id.current) window.turnstile?.remove(id.current)
      id.current = undefined
    }
  }, [siteKey])

  const reset = useCallback(() => {
    setToken(undefined)
    if (id.current) window.turnstile?.reset(id.current)
  }, [])

  return { element: siteKey ? <div ref={box} className="min-h-[65px]" data-captcha /> : null, token, needed: !!siteKey, failed, reset }
}
