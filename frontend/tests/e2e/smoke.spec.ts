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
    await page.goto('/new');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'ActionBrief' })).toBeVisible();
  });

  test('the API refuses unauthenticated generation', async ({ request }) => {
    const response = await request.post('/api/briefs');
    expect(response.status()).toBe(401);
  });

  // `/print/render/[token]` no longer lives in the frontend — it moved to the
  // backend as the internal render target for the PDF pipeline, reachable only
  // by that service's own Chromium instance. There is nothing to smoke-test
  // for it here. Briefs are never persisted, so there is no `/library` or
  // `/brief/[id]` route to test either — only `/brief/preview`, which reads
  // the just-generated document out of sessionStorage and is covered by the
  // mocked-model integration test.

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

  test('no department is preselected, multiple can be picked, and at least one is required', async ({
    page,
  }) => {
    const financeCheckbox = page.locator('input[name=departments][value=finance]');
    const marketingCheckbox = page.locator('input[name=departments][value=marketing]');
    const generateButton = page.getByRole('button', { name: /Generate brief/i });

    await expect(financeCheckbox).not.toBeChecked();
    await expect(marketingCheckbox).not.toBeChecked();
    await expect(page.getByText('Select at least one department.')).toBeVisible();
    await expect(generateButton).toBeDisabled();

    await financeCheckbox.check({ force: true });
    await marketingCheckbox.check({ force: true });
    await expect(financeCheckbox).toBeChecked();
    await expect(marketingCheckbox).toBeChecked();
    await expect(page.getByText('Select at least one department.')).toBeHidden();

    // Free to deselect all the way back down to none.
    await financeCheckbox.uncheck({ force: true });
    await marketingCheckbox.uncheck({ force: true });
    await expect(page.getByText('Select at least one department.')).toBeVisible();
    await expect(generateButton).toBeDisabled();
  });

  test('the context panel discloses and collapses', async ({ page }) => {
    const toggle = page.locator('button[aria-controls="context-panel"]');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByLabel('Attendees and their roles')).toBeVisible();
  });

  test('visiting the preview screen without a just-generated brief prompts to start one', async ({
    page,
  }) => {
    await page.goto('/brief/preview');
    await expect(page.getByText('Nothing to show here')).toBeVisible();
    await expect(page.getByRole('link', { name: /New brief/i })).toBeVisible();
  });

  test('signing out returns to the gate', async ({ page, isMobile }) => {
    if (isMobile) {
      await page.getByRole('button', { name: 'Open menu' }).click();
    }
    await page.getByRole('button', { name: /Sign out/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
