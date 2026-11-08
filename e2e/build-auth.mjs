// Builds the app WITH accounts switched on (pretend Supabase address) into dist-auth, for e2e/login.spec.ts. Also builds `dist` when missing.
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const run = (cmd, env = {}) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } })
run('npx vite build --outDir dist-auth', { VITE_SUPABASE_URL: 'https://e2e.supabase.co', VITE_SUPABASE_ANON_KEY: 'e2e-anon-key' })
if (!existsSync('dist/index.html')) run('npx vite build')
