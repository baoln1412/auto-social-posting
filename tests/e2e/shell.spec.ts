import { test, expect } from '@playwright/test';

test('the studio shell shows its nav, the demo channel and the tier', async ({ page }) => {
  await page.goto('/studio');

  await expect(page.getByRole('heading', { name: 'Tạo mới' })).toBeVisible();
  await expect(page.getByTestId('channel-row').filter({ hasText: 'Kênh thử' })).toBeVisible();
  await expect(page.getByTestId('tier-badge')).toHaveText('owner');
  await expect(page.getByTestId('channel-picker')).toBeVisible();

  await page.getByTestId('mode-text-to-reel').click();
  await expect(page.getByTestId('mode-text-to-reel')).toHaveAttribute('aria-pressed', 'true');

  await page.screenshot({ path: 'tests/shots/00-shell.png', fullPage: true });
});
