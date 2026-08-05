import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration.
 *
 * Runs against an already-running server rather than starting one, because the
 * production boot path is part of what these tests are checking. Both the
 * frontend AND the backend must be running first (the frontend proxies /api/*
 * to BACKEND_URL) — start the backend, then `npm run build && npm start` here.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';

/**
 * In a container the system Chromium is usually already present and Playwright's
 * own download is unwanted. `E2E_CHROMIUM` points at it; without the variable
 * Playwright uses its bundled browser as normal.
 */
const executablePath = process.env.E2E_CHROMIUM || undefined;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
