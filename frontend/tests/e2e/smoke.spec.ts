import { expect, test } from '@playwright/test';

/**
 * Smoke coverage for the paths a broken deploy would break.
 *
 * Requires a running server and `E2E_PASSCODE` matching its `APP_PASSCODE`.
 * Deliberately does not generate a brief: that would spend real model credit.
 * The generation pipeline is covered by tests/integration/pipeline.test.ts with
 * the model mocked.
 */

const PASSCODE = process.env.E2E_PASSCODE ?? 'test-passcode-123';

test.describe('unauthenticated', () => {
  test('health endpoint reports every subsystem', async ({ request }) => {
    const response = await request.get('/api/health');
    const body = (await response.json()) as {
      ok: boolean;
      checks: Record<string, boolean>;
    };
    expect(body.checks.server).toBe(true);
    expect(body.checks.config).toBe(true);
    expect(body.checks.database).toBe(true);
  });

  test('the app redirects to the sign-in gate', async ({ page }) => {
    await page.goto('/library');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'ActionBrief' })).toBeVisible();
  });

  test('the API refuses unauthenticated reads', async ({ request }) => {
    const response = await request.get('/api/briefs');
    expect(response.status()).toBe(401);
  });

  // `/print/[id]` no longer lives in the frontend — it moved to the backend as
  // the internal render target for the PDF pipeline, reachable only by that
  // service's own Chromium instance. There is nothing to smoke-test for it here.

  test('the example brief is viewable without signing in', async ({ page }) => {
    await page.goto('/example');
    await expect(page.locator('.doc-page')).toBeVisible();
    // The stylesheet must have applied: .doc-page is 210mm, i.e. ~794px.
    const width = await page.locator('.doc-page').evaluate((el) => el.clientWidth);
    expect(Math.abs(width - 794)).toBeLessThan(6);
  });

  test('a wrong passcode is rejected', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Access code').fill('definitely-not-the-code');
    await page.getByRole('button', { name: 'Sign in' }).click();
    // Scoped to the form: Next's route announcer is also role="alert", so an
    // unscoped query is a strict-mode violation rather than a real failure.
    await expect(page.locator('form [role="alert"]')).toContainText('not correct');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('authenticated', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Access code').fill(PASSCODE);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/new/);
  });

  test('the upload screen is usable and gated on a file', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /Turn a transcript/i }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Generate brief/i })).toBeDisabled();
  });

  test('department selection is keyboard operable', async ({ page }) => {
    const finance = page.locator('input[name=department][value=finance]');
    await finance.focus();
    await page.keyboard.press('ArrowRight');
    await expect(
      page.locator('input[name=department][value=marketing]'),
    ).toBeChecked();
  });

  test('the context panel discloses and collapses', async ({ page }) => {
    const toggle = page.locator('button[aria-controls="context-panel"]');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByLabel('Attendees and their roles')).toBeVisible();
  });

  test('the library renders', async ({ page }) => {
    await page.goto('/library');
    await expect(
      page.getByRole('heading', { name: /Every brief/i }),
    ).toBeVisible();
  });

  test('signing out returns to the gate', async ({ page, isMobile }) => {
    if (isMobile) {
      await page.getByRole('button', { name: 'Open menu' }).click();
    }
    await page.getByRole('button', { name: /Sign out/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
