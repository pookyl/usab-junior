import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('homepage loads and displays title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Junior Badminton/i);
    await expect(page.locator('body')).toBeVisible();
  });

  test('navigation bar is visible', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('nav').first();
    await expect(nav).toBeVisible();
  });

  test('analytics script loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await page.waitForTimeout(2000);

    const scriptErrors = errors.filter(
      (e) => e.includes('script.js') || e.includes('Unexpected token'),
    );
    expect(scriptErrors).toHaveLength(0);
  });

  test('can navigate to tournaments page', async ({ page }) => {
    await page.goto('/');
    const tournamentsLink = page.locator('a[href="/tournaments"]').first();
    await expect(tournamentsLink).toBeVisible();
    await tournamentsLink.click();
    await expect(page).toHaveURL(/\/tournaments/);
  });
});

/**
 * Analytics POST verification — only runs against a deployed Vercel URL.
 * Usage: BASE_URL=https://your-preview.vercel.app npx playwright test
 */
test.describe('Analytics (deployed only)', () => {
  test.skip(!process.env.BASE_URL?.includes('vercel.app'), 'Skipped: only runs against Vercel deployments');

  test('pageview POST fires with status 200', async ({ page }) => {
    const analyticsRequests: { url: string; status: number }[] = [];

    page.on('response', (response) => {
      if (response.url().includes('/insights/view')) {
        analyticsRequests.push({
          url: response.url(),
          status: response.status(),
        });
      }
    });

    await page.goto('/');
    await page.waitForTimeout(3000);

    expect(analyticsRequests.length).toBeGreaterThanOrEqual(1);
    expect(analyticsRequests[0].status).toBe(200);
  });
});
