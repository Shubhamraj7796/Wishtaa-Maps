export interface PasswordRule {
  id: string
  label: string
  ok: boolean
}

const COMMON = ['password', 'passw0rd', '12345678', '123456789', '1234567890', 'qwertyuiop', 'qwerty123', 'iloveyou', 'letmein', 'welcome', 'admin123', 'abc12345', 'wishtaa']

/** Minimum length shown to the person. Set the same value in Supabase (Authentication, Sign In / Providers, Email, minimum password length). */
export const MIN_PASSWORD = 10

/** The rules, each with a plain label so the screen can tick them off as the person types. Supabase checks again on the server. */
export function checkPassword(password: string, email = ''): PasswordRule[] {
  const local = email.split('@')[0]?.toLowerCase() ?? ''
  const lower = password.toLowerCase()
  return [
    { id: 'length', label: `At least ${MIN_PASSWORD} characters`, ok: password.length >= MIN_PASSWORD },
    { id: 'case', label: 'An upper-case and a lower-case letter', ok: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { id: 'digit', label: 'A number', ok: /\d/.test(password) },
    { id: 'plain', label: 'Not a common password, and not your email', ok: !COMMON.some((c) => lower.includes(c)) && !(local.length >= 4 && lower.includes(local)) },
  ]
}

export const passwordOk = (password: string, email = '') => checkPassword(password, email).every((r) => r.ok)

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const validEmail = (email: string) => email.trim().length <= 254 && EMAIL.test(email.trim())
export const normalizeEmail = (email: string) => email.trim().toLowerCase()
