import { defineConfig } from '@playwright/test'

/**
 * End-to-end checks against a PRODUCTION build (`npm run build`, then `npm run e2e`), or against a deployed address with
 * `E2E_URL=https://<preview>.vercel.app npm run e2e`. A Chromium is needed: Playwright's own (`npx playwright install chromium`), or
 * point `CHROME_PATH` at one that is already installed.
 */
const url = process.env.E2E_URL
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: url ?? 'http://127.0.0.1:4173',
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  webServer: url ? undefined : { command: 'node e2e/serve.mjs dist 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: true, timeout: 30_000 },
})
