import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { passwordOk } from '@/core/auth/passwords'
import { auth, useAuth } from '../account'
import { useAuthUi } from '../authUi'
import { Alert, Field, Logo, PasswordInput, PasswordRules, useStep } from '../auth/parts'
import { useFiles } from '../FilesContext'
import { buttonPrimary, buttonSecondary } from '../Modal'

/** Where the "reset password" email leads. The link signs the person in for this one purpose; they choose a new password here. */
export default function ResetPassword() {
  const s = useAuth()
  const f = useFiles()
  const navigate = useNavigate()
  const open = useAuthUi((a) => a.open)
  const [pw, setPw] = useState('')
  const step = useStep()
  useEffect(() => {
    void auth.init().catch(() => undefined)
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (await step.run(async () => (await auth.setPassword(pw), true))) {
      f.notify('Your password was changed.')
      navigate('/home', { replace: true })
    }
  }

  const shell = (children: React.ReactNode) => (
    <div className="mx-auto max-w-sm p-6">
      <div className="mb-4 flex items-center gap-3"><Logo /><h1 className="text-lg font-semibold">Choose a new password</h1></div>
      {children}
    </div>
  )

  if (s.status === 'loading') return shell(<p role="status" className="text-sm text-muted">Checking your reset link…</p>)
  if (!s.recovery || !s.user) {
    return shell(
      <div className="space-y-3">
        <Alert>This reset link is not valid, has expired, or was already used.</Alert>
        <div className="flex gap-2">
          <button type="button" className={buttonPrimary} onClick={() => open({ kind: 'signin', view: 'password' })}>Ask for a new link</button>
          <button type="button" className={buttonSecondary} onClick={() => navigate('/home')}>Go to the app</button>
        </div>
      </div>
    )
  }
  const email = s.user.email ?? ''
  return shell(
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      <p className="text-sm text-muted">For {email}.</p>
      <Field label="New password">{(p) => <PasswordInput {...p} data-autofocus value={pw} onChange={setPw} autoComplete="new-password" disabled={step.busy} />}</Field>
      <PasswordRules password={pw} email={email} />
      {step.error && <Alert>{step.error}</Alert>}
      <button type="submit" className={`${buttonPrimary} w-full`} disabled={step.busy || !passwordOk(pw, email)}>Save new password</button>
    </form>
  )
}
