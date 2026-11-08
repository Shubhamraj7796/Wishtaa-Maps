/** Browser-safe settings. Only the public anon key lives here (it is meant to be public: row-level security protects the data). */
const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

export const authConfig = {
  url: clean(import.meta.env.VITE_SUPABASE_URL),
  anonKey: clean(import.meta.env.VITE_SUPABASE_ANON_KEY),
  /** Cloudflare Turnstile site key (public). Leave unset until CAPTCHA is switched on in Supabase. */
  turnstileSiteKey: clean(import.meta.env.VITE_TURNSTILE_SITE_KEY),
}

/** The login screen exists only when both Supabase values are present, so the app still deploys and works as a guest without them. */
export const authEnabled = !!authConfig.url && !!authConfig.anonKey && !/YOUR-PROJECT-ID/i.test(authConfig.url ?? '')
