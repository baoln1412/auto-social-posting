import { test, expect } from '@playwright/test';

test('settings says Telegram needs a token instead of hiding it', async ({ page }) => {
  await page.goto('/studio/settings');
  await expect(page.getByTestId('telegram-settings')).toBeVisible();
  await expect(page.getByTestId('tg-state')).toHaveText('chưa có token');
  await expect(page.getByTestId('tg-blocked')).toContainText('TELEGRAM_BOT_TOKEN');
  // Off by default, whatever else is true.
  await expect(page.locator('body')).toContainText('Trạng thái gửi: tắt');
  await page.screenshot({ path: 'tests/shots/50-settings.png', fullPage: true });
});

test('the connect button reports the missing token rather than failing silently', async ({ page }) => {
  await page.goto('/studio/settings');
  // With no token the Kết nối button is not offered at all — the reason is shown in its place.
  await expect(page.getByTestId('tg-connect')).toHaveCount(0);

  const res = await page.request.post('/api/studio/telegram', { data: { action: 'code' } });
  expect(res.status()).toBe(400);
  expect(((await res.json()) as { error: string }).error).toMatch(/TELEGRAM_BOT_TOKEN/);
});

test('every nav item now leads to a screen that renders', async ({ page }) => {
  await page.goto('/studio');
  await page.getByTestId('tour-skip').click();
  const links = page.locator('aside nav a');
  const n = await links.count();
  expect(n).toBe(7);
  for (let i = 0; i < n; i++) {
    await page.goto('/studio');
    const href = await links.nth(i).getAttribute('href');
    await page.goto(href!);
    await expect(page.locator('h1')).toBeVisible();
  }
  await page.goto('/studio');
  await page.screenshot({ path: 'tests/shots/51-nav-complete.png', fullPage: true });
});
