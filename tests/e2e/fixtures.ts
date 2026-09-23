/** A real 1×1 PNG, so upload tests exercise the actual decode path rather than a text blob. */
export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

import type { Page } from '@playwright/test';

/**
 * Close the first-run tour if it is showing.
 *
 * `.click().catch()` does NOT do this: a click on a locator that is not there still waits the
 * full timeout before rejecting, which killed the browser mid-test. Count first.
 */
export async function dismissTour(page: Page): Promise<void> {
  // Give it a moment to mount first. Counting immediately after goto() found nothing, the
  // helper returned, and the tour then rendered itself into the screenshot the test took
  // three lines later. waitFor is safe to catch — unlike click, it rejects at ITS timeout.
  await page
    .getByTestId('tour')
    .waitFor({ state: 'visible', timeout: 2_000 })
    .catch(() => undefined);
  if (await page.getByTestId('tour').count()) {
    await page.getByTestId('tour-skip').click();
  }
}
