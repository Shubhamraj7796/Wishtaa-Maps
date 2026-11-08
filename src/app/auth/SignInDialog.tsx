import { useEffect, useState, type FormEvent } from 'react'
import { RESEND_SECONDS } from '@/core/auth/cooldown'
import { passwordOk, validEmail, normalizeEmail } from '@/core/auth/passwords'
import { auth, useAuth } from '../account'
import { Mail, KeyRound, Loader2 } from '../icons'
import { Modal, buttonPrimary, buttonSecondary } from '../Modal'
import { markGoogleReturn } from './googleReturn'
import { Alert, Field, GoogleMark, inputClass, Logo, PasswordInput, PasswordRules, useCountdown, useStep } from './parts'
import { useCaptcha } from './Turnstile'

export type SignInView = 'email' | 'code' | 'password' | 'signup' | 'check-email' | 'forgot' | 'forgot-sent'

const TITLES: Record<SignInView, string> = {
  email: 'Welcome to Wishtaa Maps',
  code: 'Enter your code',
  password: 'Sign in with a password',
  signup: 'Create your account',
  'check-email': 'Check your email',
  forgot: 'Reset your password',
  'forgot-sent': 'Check your email',
}

/**
 * Sign in or create an account: an emailed 6-digit code (no password), email and password, or Google. All three lead to the same
 * account for the same email address. Files are never touched by signing in.
 */
export function SignInDialog({ initial = 'email', reason, onClose }: { initial?: SignInView; reason?: string; onClose: () => void }) {
  const state = useAuth()
  const [view, setView] = useState<SignInView>(initial)
  const [email, setEmail] = useState(() => auth.state.expiredEmail ?? '')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [left, setLeft] = useCountdown(0)
  const step = useStep()
  const captcha = useCaptcha()

  useEffect(() => {
    void auth.init().catch(() => undefined)
  }, [])
  // Signed in: the dialog's job is done.
  useEffect(() => {
    if (state.status === 'signed-in' && !state.offline) onClose()
  }, [state.status, state.offline, onClose])

  const go = (v: SignInView) => {
    step.clear()
    setView(v)
  }
  const checkBlocked = captcha.needed && !captcha.token
  const emailOk = validEmail(email)
  const clean = normalizeEmail(email)

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!emailOk) return
    const ok = await step.run(async () => {
      await auth.sendCode(clean, captcha.token)
      return true
    })
    captcha.reset()
    if (ok) {
      setCode('')
      setLeft(auth.resendIn(clean) || RESEND_SECONDS)
      setView('code')
    }
  }

  const verify = async (value: string) => {
    await step.run(() => auth.verifyCode(clean, value))
    // On success the sign-in state changes and the dialog closes by itself. On failure the box is emptied for another try.
    if (auth.state.status !== 'signed-in') setCode('')
  }

  const signInPassword = async (e: FormEvent) => {
    e.preventDefault()
    await step.run(() => auth.signInPassword(clean, password, captcha.token))
    captcha.reset()
  }

  const signUp = async (e: FormEvent) => {
    e.preventDefault()
    const r = await step.run(() => auth.signUp(clean, password, captcha.token))
    captcha.reset()
    if (r === 'confirm') {
      setLeft(auth.resendIn(clean) || RESEND_SECONDS)
      setView('check-email')
    }
  }

  const resend = async (kind: 'code' | 'confirm') => {
    const ok = await step.run(async () => {
      if (kind === 'code') await auth.sendCode(clean, captcha.token)
      else await auth.resendConfirmation(clean, captcha.token)
      return true
    })
    captcha.reset()
    if (ok) setLeft(RESEND_SECONDS)
  }

  const forgot = async (e: FormEvent) => {
    e.preventDefault()
    const ok = await step.run(async () => {
      await auth.forgotPassword(clean, captcha.token)
      return true
    })
    captcha.reset()
    if (ok) setView('forgot-sent')
  }

  const google = async () => {
    markGoogleReturn()
    const ok = await step.run(async () => {
      await auth.signInGoogle()
      return true
    })
    if (!ok) captcha.reset()
  }

  const spinner = step.busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null
  const emailField = (
    <Field label="Email">
      {(p) => (
        <input {...p} data-autofocus type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className={inputClass} disabled={step.busy} />
      )}
    </Field>
  )
  const blocked = checkBlocked && !captcha.failed
  const captchaNote = captcha.failed ? (
    <Alert>The security check could not load. Turn off any content blocker for this site, check your connection, and reload the page.</Alert>
  ) : blocked ? (
    <p className="text-xs text-muted" role="status">Running a quick security check…</p>
  ) : null

  const googleButton = (
    <>
      <div className="my-3 flex items-center gap-3 text-xs text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>
      <button type="button" onClick={() => void google()} disabled={step.busy} className={`${buttonSecondary} w-full`}>
        <GoogleMark /> Sign in with Google
      </button>
    </>
  )

  return (
    <Modal title={TITLES[view]} onClose={onClose}>
      <div className="mb-3 flex items-center gap-3">
        <Logo size={36} />
        <p className="text-xs text-muted">Signing in adds sync and Google Drive linking. You can always keep using Wishtaa Maps without an account; your files stay where they are.</p>
      </div>
      {reason && <div className="mb-3"><Alert tone="info">{reason}</Alert></div>}

      {view === 'email' && (
        <form onSubmit={(e) => void sendCode(e)} className="space-y-3" noValidate>
          <p className="text-sm">Enter your email and we will send you a 6-digit code. No password needed.</p>
          {emailField}
          {step.error && <Alert>{step.error}</Alert>}
          {captchaNote}
          <button type="submit" disabled={step.busy || !emailOk || blocked} className={`${buttonPrimary} w-full`} aria-busy={step.busy}>
            {spinner}
            <Mail size={16} aria-hidden="true" /> Continue
          </button>
          {googleButton}
          <button type="button" onClick={() => go('password')} className="mt-1 w-full text-center text-sm text-brand underline-offset-2 hover:underline">
            <KeyRound size={14} aria-hidden="true" className="mr-1 inline" /> Use a password instead
          </button>
        </form>
      )}

      {view === 'code' && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void verify(code)
          }}
          className="space-y-3"
        >
          <p className="text-sm">We emailed a 6-digit code to <strong className="break-all">{clean}</strong>. It can take a minute. Check your spam folder too.</p>
          <Field label="6-digit code">
            {(p) => (
              <input
                {...p}
                data-autofocus
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                disabled={step.busy}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                  setCode(v)
                  if (v.length === 6) void verify(v)
                }}
                className={`${inputClass} text-center text-lg tracking-[0.4em]`}
              />
            )}
          </Field>
          {step.error && <Alert>{step.error}</Alert>}
          <button type="submit" disabled={step.busy || code.length !== 6} className={`${buttonPrimary} w-full`} aria-busy={step.busy}>
            {spinner} Sign in
          </button>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <button type="button" disabled={step.busy || left > 0 || blocked} onClick={() => void resend('code')} className="text-brand underline-offset-2 hover:underline disabled:text-muted disabled:no-underline">
              {left > 0 ? `Send a new code in ${left} s` : 'Send a new code'}
            </button>
            <button type="button" onClick={() => go('email')} className="text-brand underline-offset-2 hover:underline">Use a different email</button>
          </div>
          {captchaNote}
        </form>
      )}

      {view === 'password' && (
        <form onSubmit={(e) => void signInPassword(e)} className="space-y-3" noValidate>
          {emailField}
          <Field label="Password">{(p) => <PasswordInput {...p} value={password} onChange={setPassword} autoComplete="current-password" disabled={step.busy} />}</Field>
          {step.error && <Alert>{step.error}</Alert>}
          {step.failure?.kind === 'unconfirmed' && (
            <button type="button" onClick={() => void resend('confirm')} disabled={step.busy || left > 0} className="text-sm text-brand underline-offset-2 hover:underline disabled:text-muted">
              {left > 0 ? `Send the link again in ${left} s` : 'Send the confirmation link again'}
            </button>
          )}
          {captchaNote}
          <button type="submit" disabled={step.busy || !emailOk || !password || blocked} className={`${buttonPrimary} w-full`} aria-busy={step.busy}>
            {spinner} Sign in
          </button>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <button type="button" onClick={() => go('forgot')} className="text-brand underline-offset-2 hover:underline">Forgot password?</button>
            <button type="button" onClick={() => go('email')} className="text-brand underline-offset-2 hover:underline">Email me a code instead</button>
          </div>
          {googleButton}
          <button type="button" onClick={() => go('signup')} className="mt-1 w-full text-center text-sm text-brand underline-offset-2 hover:underline">New here? Create an account with a password</button>
        </form>
      )}

      {view === 'signup' && (
        <form onSubmit={(e) => void signUp(e)} className="space-y-3" noValidate>
          {emailField}
          <Field label="Choose a password">
            {(p) => <PasswordInput {...p} value={password} onChange={setPassword} autoComplete="new-password" disabled={step.busy} />}
          </Field>
          <PasswordRules password={password} email={clean} />
          {step.error && <Alert>{step.error}</Alert>}
          {captchaNote}
          <button type="submit" disabled={step.busy || !emailOk || !passwordOk(password, clean) || blocked} className={`${buttonPrimary} w-full`} aria-busy={step.busy}>
            {spinner} Create account
          </button>
          <p className="text-xs text-muted">We will email you a link to confirm your address.</p>
          {googleButton}
          <button type="button" onClick={() => go('password')} className="mt-1 w-full text-center text-sm text-brand underline-offset-2 hover:underline">I already have an account</button>
        </form>
      )}

      {view === 'check-email' && (
        <div className="space-y-3">
          <Alert tone="ok">If this address can be used for a new account, we have sent a confirmation link to <strong className="break-all">{clean}</strong>. Open it, then come back and sign in.</Alert>
          <p className="text-sm text-muted">Already have an account with this email? You can sign in with an emailed code or with Google instead.</p>
          {step.error && <Alert>{step.error}</Alert>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonPrimary} onClick={() => go('password')}>I confirmed, sign in</button>
            <button type="button" className={buttonSecondary} onClick={() => go('email')}>Email me a code</button>
            <button type="button" className={buttonSecondary} disabled={step.busy || left > 0 || blocked} onClick={() => void resend('confirm')}>{left > 0 ? `Send again in ${left} s` : 'Send the link again'}</button>
          </div>
          {captchaNote}
        </div>
      )}

      {view === 'forgot' && (
        <form onSubmit={(e) => void forgot(e)} className="space-y-3" noValidate>
          <p className="text-sm">Enter your email. We will send a link to choose a new password.</p>
          {emailField}
          {step.error && <Alert>{step.error}</Alert>}
          {captchaNote}
          <button type="submit" disabled={step.busy || !emailOk || blocked} className={`${buttonPrimary} w-full`} aria-busy={step.busy}>
            {spinner} Send reset link
          </button>
          <button type="button" onClick={() => go('password')} className="w-full text-center text-sm text-brand underline-offset-2 hover:underline">Back to sign in</button>
        </form>
      )}

      {view === 'forgot-sent' && (
        <div className="space-y-3">
          <Alert tone="ok">If there is an account for <strong className="break-all">{clean}</strong>, a reset link is on its way. It works once and expires soon.</Alert>
          <button type="button" className={buttonSecondary} onClick={() => go('password')}>Back to sign in</button>
        </div>
      )}

      <p className="mt-3 text-center text-xs text-muted">
        By continuing you agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline">Terms</a> and the <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline">Privacy Policy</a>.
      </p>

      {/* The security check stays mounted across steps so its token is ready when a step needs it. */}
      <div className={view === 'code' || view === 'forgot-sent' ? 'hidden' : 'mt-3'}>{captcha.element}</div>
    </Modal>
  )
}
