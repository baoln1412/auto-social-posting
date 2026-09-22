import { test, expect } from '@playwright/test';
import { dismissTour } from './fixtures';

test('the studio shell shows its nav, the demo channel and the tier', async ({ page }) => {
  await page.goto('/studio');

  await expect(page.locator('h1')).toBeVisible();
  await expect(page.getByTestId('tier-badge')).toHaveText('owner');
  // The channel lives in the create box now, as the drawing has it.
  await expect(page.getByTestId('channel-picker')).toContainText('Kênh thử');
  await expect(page.getByTestId('ov-toggle')).toBeVisible();

  await page.getByTestId('mode-text-to-reel').click();
  await expect(page.getByTestId('mode-text-to-reel')).toHaveAttribute('aria-pressed', 'true');

  await dismissTour(page);
  await page.screenshot({ path: 'tests/shots/00-shell.png', fullPage: true });
});
