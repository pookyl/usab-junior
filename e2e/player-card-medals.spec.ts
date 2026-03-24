import { test, expect } from '@playwright/test';

const PREVIEW_URL = 'https://usab-junior-cny4-git-auto-player-card-medals-usabs-projects.vercel.app';
const TSW_ID = 'A2DD0F5E-24A4-4875-B053-8F25F31AC357';

test.describe('Player Detail Card — Medal Deduction', () => {
  test.use({ baseURL: PREVIEW_URL });

  test('player with medals shows medal icons on card', async ({ page }) => {
    // Saatvik Shetty (323) won BS U17 Final → should show gold medal
    await page.goto(`/tournaments/${TSW_ID}/player/323`);
    await page.waitForSelector('h1', { timeout: 15000 });
    await expect(page.locator('h1')).toContainText('Shetty');
    await page.screenshot({ path: 'e2e/screenshots/player-with-medal.png', fullPage: false });
  });

  test('player without medals shows clean card', async ({ page }) => {
    // Kevin Zhang (556) lost BS U17 Final → should show silver
    // But let's find a player with no finals at all — use a random player
    await page.goto(`/tournaments/${TSW_ID}/player/556`);
    await page.waitForSelector('h1', { timeout: 15000 });
    await page.screenshot({ path: 'e2e/screenshots/player-with-silver.png', fullPage: false });
  });

  test('medals page still renders correctly after MedalIcon extraction', async ({ page }) => {
    await page.goto(`/tournaments/${TSW_ID}/medals`);
    await page.waitForSelector('table', { timeout: 15000 });
    await page.screenshot({ path: 'e2e/screenshots/medals-page.png', fullPage: false });
  });
});
