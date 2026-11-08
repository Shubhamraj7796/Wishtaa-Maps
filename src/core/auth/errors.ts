import { AuthFailure, type FailureKind } from './types'

interface Raw {
  code?: string
  status?: number
  name?: string
  message?: string
}

const SIGN_IN_AGAIN = 'Your sign-in is no longer valid. Please sign in again.'
const SLOW_DOWN = 'Too many attempts. Please wait a few minutes and try again.'
const EXISTS = 'An account with this email already exists. Sign in instead, or use an emailed code.'

const BY_CODE: Record<string, [FailureKind, string]> = {
  invalid_credentials: ['invalid', 'That email and password do not match. Check them, or use an emailed code instead.'],
  email_not_confirmed: ['unconfirmed', 'This email is not confirmed yet. Open the link we emailed you, or ask for a new one.'],
  otp_expired: ['invalid', 'That code has expired or was already used. Ask for a new one.'],
  over_email_send_rate_limit: ['rate', 'Too many emails were requested. Please wait a few minutes and try again.'],
  over_request_rate_limit: ['rate', SLOW_DOWN],
  over_sms_send_rate_limit: ['rate', SLOW_DOWN],
  captcha_failed: ['captcha', 'The security check did not pass. Please try it again.'],
  weak_password: ['weak-password', 'That password is too weak or too common. Choose a stronger one.'],
  same_password: ['weak-password', 'The new password must be different from the current one.'],
  user_already_exists: ['other', EXISTS],
  email_exists: ['other', EXISTS],
  identity_already_exists: ['other', 'That Google account is already linked to a different Wishtaa Maps account.'],
  email_address_invalid: ['invalid', 'That email address does not look right.'],
  validation_failed: ['invalid', 'Please check what you typed and try again.'],
  user_not_found: ['invalid', 'That code is not valid. Check it, or ask for a new one.'],
  session_not_found: ['session', SIGN_IN_AGAIN],
  refresh_token_not_found: ['session', SIGN_IN_AGAIN],
  refresh_token_already_used: ['session', SIGN_IN_AGAIN],
  bad_jwt: ['session', SIGN_IN_AGAIN],
  reauthentication_needed: ['session', 'For your security, please sign in again to do this.'],
  manual_linking_disabled: ['config', 'Linking another sign-in method is not switched on for this site yet.'],
  provider_disabled: ['config', 'That sign-in method is not switched on for this site yet.'],
  signup_disabled: ['config', 'New accounts are not being accepted right now.'],
  email_provider_disabled: ['config', 'Sign-in with email is not switched on for this site yet.'],
}

/** Turns anything thrown by the sign-in service into a short message in plain words. Never includes tokens or server text we cannot vouch for. */
export function toFailure(e: unknown, online = typeof navigator === 'undefined' || navigator.onLine !== false): AuthFailure {
  if (e instanceof AuthFailure) return e
  const r = (e && typeof e === 'object' ? e : {}) as Raw
  const msg = r.message ?? ''
  const network = r.name === 'AuthRetryableFetchError' || r.name === 'TypeError' || r.status === 0 || !online || /failed to fetch|network|load failed/i.test(msg)
  if (network) return new AuthFailure('network', 'Could not reach the sign-in service. Check your internet connection, or try again in a little while. Your files are safe on this device.')
  const known = r.code ? BY_CODE[r.code] : undefined
  if (known) return new AuthFailure(known[0], known[1])
  if (r.status === 429) return new AuthFailure('rate', SLOW_DOWN)
  if (/token has expired|invalid.*(token|code)|otp/i.test(msg)) return new AuthFailure('invalid', 'That code is not valid or has expired. Ask for a new one.')
  if (/invalid login/i.test(msg)) return new AuthFailure('invalid', BY_CODE.invalid_credentials?.[1] ?? 'Sign-in failed.')
  if (/captcha/i.test(msg)) return new AuthFailure('captcha', BY_CODE.captcha_failed?.[1] ?? 'The security check did not pass.')
  return new AuthFailure('other', 'Something went wrong. Please try again in a moment.')
}

/** True when the failure means the saved sign-in can never work again (it was revoked, signed out elsewhere, or expired for good). */
export const isDeadSession = (e: unknown) => toFailure(e).kind === 'session'
