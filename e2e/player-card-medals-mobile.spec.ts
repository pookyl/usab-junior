import { test, expect, devices } from '@playwright/test';

const PREVIEW_URL = 'https://usab-junior-cny4-git-auto-player-card-medals-usabs-projects.vercel.app';
const TSW_ID = 'A2DD0F5E-24A4-4875-B053-8F25F31AC357';

test.use({
  viewport: devices['iPhone 14'].viewport,
  userAgent: devices['iPhone 14'].userAgent,
  isMobile: true,
  hasTouch: true,
  baseURL: PREVIEW_URL,
});

test('mobile: player with gold medal', async ({ page }) => {
  await page.goto(`/tournaments/${TSW_ID}/player/323`);
  await page.waitForSelector('h1', { timeout: 15000 });
  await expect(page.locator('h1')).toContainText('Shetty');
  await page.screenshot({ path: 'e2e/screenshots/mobile-player-with-medal.png', fullPage: false });
});

test('mobile: player with silver medal', async ({ page }) => {
  await page.goto(`/tournaments/${TSW_ID}/player/556`);
  await page.waitForSelector('h1', { timeout: 15000 });
  await page.screenshot({ path: 'e2e/screenshots/mobile-player-with-silver.png', fullPage: false });
});

test('mobile: player without medal', async ({ page }) => {
  await page.goto(`/tournaments/${TSW_ID}/player/296`);
  await page.waitForSelector('h1', { timeout: 15000 });
  await page.screenshot({ path: 'e2e/screenshots/mobile-player-no-medal.png', fullPage: false });
});
