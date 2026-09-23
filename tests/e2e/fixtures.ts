/** A real 1×1 PNG, so upload tests exercise the actual decode path rather than a text blob. */
export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

import type { Page } from '@playwright/test';

/**
 * Wait until every <img> matching `selector` has actually decoded.
 *
 * A committed screenshot of half-loaded thumbnails is a screenshot of nothing — and these
 * are composed frames, one python process each, so the first paint is genuinely later than
 * the click that asked for them.
 */
export async function imagesLoaded(page: Page, selector: string): Promise<void> {
  await page.waitForFunction(
    (sel) => {
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(sel));
      return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0);
    },
    selector,
    { timeout: 60_000 },
  );
}

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
