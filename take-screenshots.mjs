import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });

console.log('📸 Dashboard...');
await page.goto('http://localhost:5173/');
await page.waitForTimeout(2000);
await page.screenshot({ path: 'screenshot_01_dashboard.png' });

console.log('📸 Rankings U11 BS...');
await page.goto('http://localhost:5173/players');
await page.waitForTimeout(5000);
await page.screenshot({ path: 'screenshot_02_rankings_u11.png' });

console.log('📸 Rankings U13 BS (live fetch)...');
await page.click('button:has-text("U13")');
await page.waitForTimeout(6000);
await page.screenshot({ path: 'screenshot_03_rankings_u13.png' });

console.log('📸 Player detail...');
const firstPlayerLink = page.locator('tbody tr:first-child a').first();
await firstPlayerLink.click();
await page.waitForTimeout(5000);
await page.screenshot({ path: 'screenshot_04_player_detail.png' });

console.log('📸 Analytics...');
await page.goto('http://localhost:5173/analytics');
await page.waitForTimeout(4000);
await page.screenshot({ path: 'screenshot_05_analytics.png' });

await browser.close();
console.log('✅ All screenshots saved.');
