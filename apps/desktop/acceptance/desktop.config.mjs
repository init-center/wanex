import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './desktop',
  testMatch: '**/*.spec.mjs',
  workers: 1,
  retries: 0,
  // The parent still enforces 60 seconds including worker startup and cleanup.
  timeout: 50000,
  expect: { timeout: 10000 },
  reporter: 'line',
  outputDir: process.env.WANEX_DESKTOP_E2E_OUTPUT,
})
