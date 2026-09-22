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
  if (await page.getByTestId('tour').count()) {
    await page.getByTestId('tour-skip').click();
  }
}
