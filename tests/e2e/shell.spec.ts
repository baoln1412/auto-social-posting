import { test, expect } from '@playwright/test';
import { dismissTour } from './fixtures';

test('the studio shell shows its nav, the demo channel and the tier', async ({ page }) => {
  await page.goto('/studio');

  await expect(page.locator('h1')).toBeVisible();
  await expect(page.getByTestId('tier-badge')).toHaveText('owner');
  // The channel lives in the create box now, as the drawing has it.
  await expect(page.getByTestId('channel-picker')).toContainText('Kênh thử');
  await expect(page.getByTestId('ov-toggle')).toBeVisible();

  // Two doors, not four kinds of video: the reference's four chips are a step rail.
  await expect(page.getByTestId('door-auto')).toBeVisible();
  await expect(page.getByTestId('door-single')).toBeVisible();

  await dismissTour(page);
  await page.screenshot({ path: 'tests/shots/00-shell.png', fullPage: true });
});
