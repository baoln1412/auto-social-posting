import { test, expect } from '@playwright/test';
import { dismissTour } from './fixtures';

/**
 * S19 — the run page's step screens carry the old app's fixes (mock-v3/04, 05).
 *
 * A run on the demo channel walks to each screen. The Ảnh screen is the one the owner said
 * was missing: every News Card control, a check that counts what it checked, and the
 * sentence that says where the style lives.
 */
async function newRun(page: import('@playwright/test').Page) {
  await page.goto('/studio');
  await dismissTour(page);
  await page.getByTestId('create-run').click();
  await page.waitForURL(/\/studio\/runs\/[0-9a-f-]{36}/);
}

test('the Ảnh screen has every control the old card has, and says what it checked', async ({ page }) => {
  await newRun(page);
  // Walk to the image step: only the current step's screen is rendered, so each click is
  // done when the NEXT screen appears.
  await page.getByTestId('continue-fetch').click();
  await expect(page.getByTestId('step-draft')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('continue-draft').click();
  await expect(page.getByTestId('step-image')).toBeVisible({ timeout: 90_000 });

  for (const id of ['img-ratio-4:5', 'img-ratio-1:1', 'img-ratio-9:16', 'img-main', 'img-inset', 'img-highlight', 'img-reset', 'img-save']) {
    await expect(page.getByTestId(id), id).toBeVisible();
  }
  await expect(page.getByTestId('img-checks')).toContainText(/\d\/3/);
  await expect(page.getByTestId('step-image')).toContainText('Bộ nhận diện → Ảnh chụp bài viết');

  // A ratio is a control, not a decoration. The step names its file after a hash of the
  // parameters that drew it, so the proof is the PICTURE: 4:5 before, square after.
  const shape = () =>
    page.getByTestId('card-preview').evaluate((e: HTMLImageElement) => (e.complete && e.naturalWidth ? e.naturalWidth / e.naturalHeight : 0));
  await expect.poll(shape, { timeout: 30_000 }).toBeGreaterThan(0);
  // The demo kit draws 9:16; whatever it starts at, 1:1 must make it square and 4:5 tall.
  expect(await shape(), 'the kit’s own ratio').not.toBeCloseTo(1, 1);
  await page.getByTestId('img-ratio-1:1').click();
  await expect.poll(shape, { timeout: 30_000 }).toBeCloseTo(1, 1);
  await page.getByTestId('img-ratio-4:5').click();
  await expect.poll(shape, { timeout: 30_000 }).toBeCloseTo(0.8, 1);
});

test('the Viết bài screen offers the old app’s AI fix and script', async ({ page }) => {
  await newRun(page);
  await page.getByTestId('continue-fetch').click();
  await expect(page.getByTestId('step-draft')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('draft-ai')).toBeVisible();
  await expect(page.getByTestId('draft-script')).toBeVisible();
  await page.getByTestId('draft-ai').click();
  await expect(page.getByTestId('draft-ai-prompt')).toBeVisible();
  await expect(page.getByTestId('draft-ai-run')).toBeDisabled();
  await page.getByTestId('draft-ai-prompt').fill('Viết lại mở bài');
  await expect(page.getByTestId('draft-ai-run')).toBeEnabled();
});

test('the demo run opens finished — a result on every step, never “chưa có”', async ({ page }) => {
  // The run the seed ships finished, by its id — not "whatever the library lists first",
  // which is some other test's half-walked run.
  await page.goto('/studio/runs/demo-run-0001');
  await dismissTour(page);

  for (const step of ['fetch', 'draft', 'image', 'reel', 'publish'] as const) {
    await page.getByTestId(`rail-${step}`).click();
    await expect(page.getByTestId(`step-${step}`), step).toHaveAttribute('data-state', 'done');
    await expect(page.getByTestId(`step-${step}`), step).not.toContainText('Chưa có kết quả');
  }
  await expect(page.getByTestId('run-player')).toBeVisible();
});
