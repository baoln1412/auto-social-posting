import { test, expect } from '@playwright/test';
import { dismissTour } from './fixtures';

/**
 * "the video caption cover the title, I want a function for dragging caption, title and the
 * logo."
 *
 * The three were drawn by two renderers that knew nothing about each other — the headline
 * and the badge are pixels inside the card, the caption band is burned over the finished
 * video by make-reel.py — and nothing stopped them landing on each other. These check that
 * a handle moves the thing it names, which is the whole claim.
 */

async function atVideoStep(page: import('@playwright/test').Page) {
  await page.goto('/studio');
  await dismissTour(page);
  await page.getByTestId('create-run').click();
  await page.waitForURL(/\/studio\/runs\/[0-9a-f-]+$/);
  await dismissTour(page);
  await page.getByTestId('continue-fetch').click();
  await page.getByTestId('continue-draft').click();
  await page.getByTestId('continue-image').click();
  await expect(page.getByTestId('frame-placer')).toBeVisible();
}

/** Drag a handle by a fraction of the frame, the way a pointer actually does it. */
async function dragBy(
  page: import('@playwright/test').Page,
  testId: string,
  fx: number,
  fy: number,
) {
  const frame = (await page.locator('[data-testid="frame-placer"] img').boundingBox())!;
  const h = (await page.getByTestId(testId).boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(
      h.x + h.width / 2 + (frame.width * fx * i) / 6,
      h.y + h.height / 2 + (frame.height * fy * i) / 6,
    );
  }
  await page.mouse.up();
  return { frame, before: h };
}

test('dragging the headline moves it and redraws the card', async ({ page }) => {
  await atVideoStep(page);
  const img = page.locator('[data-testid="frame-placer"] img');
  const before = await img.getAttribute('src');

  await dragBy(page, 'place-title', 0, -0.25);

  // The handle follows the pointer at once; the picture follows after the debounce, and it
  // has to be a different picture or the control moved a number nothing reads.
  await expect.poll(() => img.getAttribute('src'), { timeout: 10_000 }).not.toBe(before);
  await expect(page.getByTestId('place-reset')).toBeEnabled();
  await page.screenshot({ path: 'tests/shots/95-place-title.png', fullPage: true });
});

test('dragging the caption band moves only the band, and only downward or up', async ({ page }) => {
  await atVideoStep(page);
  const img = page.locator('[data-testid="frame-placer"] img');
  const band = page.getByTestId('place-caption');
  const frame = (await img.boundingBox())!;
  const start = (await band.boundingBox())!;

  // A sideways push as well as a downward one: the band is the full width of the frame by
  // construction in make-reel.py, so the horizontal half must go nowhere.
  await dragBy(page, 'place-caption', 0.2, -0.15);

  const end = (await band.boundingBox())!;
  expect(Math.abs(end.x - start.x)).toBeLessThan(2);
  expect(start.y - end.y).toBeGreaterThan(frame.height * 0.1);
  await expect
    .poll(() => img.getAttribute('src'), { timeout: 10_000 })
    .toMatch(/pos%22%3A0\.[0-9]/);
});

test('the badge gets a handle only on the engine that draws one', async ({ page }) => {
  // The demo channel's own kit is the studio engine, whose card has no badge at all.
  await atVideoStep(page);
  await expect(page.getByTestId('place-title')).toBeVisible();
  await expect(page.getByTestId('place-logo')).toHaveCount(0);
});

test('on the classic card the badge can be dragged off its corner', async ({ page }) => {
  await page.goto('/studio');
  await dismissTour(page);
  await page.getByTestId('create-run').click();
  await page.waitForURL(/\/studio\/runs\/[0-9a-f-]+$/);
  await dismissTour(page);

  // The drawer reaches the server on Continue, not on change — so the kit is chosen before
  // the run walks, the same order the owner would use.
  await page.getByTestId('ov-edit').click();
  await page.getByTestId('ov-kit').selectOption({ label: 'Desoul Posting VI' });
  await page.getByTestId('continue-fetch').click();
  await page.getByTestId('continue-draft').click();
  await page.getByTestId('continue-image').click();

  await expect(page.getByTestId('frame-placer')).toBeVisible();
  const badge = page.getByTestId('place-logo');
  await expect(badge).toBeVisible();

  const img = page.locator('[data-testid="frame-placer"] img');
  const before = await img.getAttribute('src');
  const start = (await badge.boundingBox())!;

  await dragBy(page, 'place-logo', -0.6, 0);

  expect((await badge.boundingBox())!.x).toBeLessThan(start.x - 10);
  await expect.poll(() => img.getAttribute('src'), { timeout: 10_000 }).not.toBe(before);
  await page.screenshot({ path: 'tests/shots/96-place-logo.png', fullPage: true });
});

test('Về mặc định puts every handle back where the kit had it', async ({ page }) => {
  await atVideoStep(page);
  const title = page.getByTestId('place-title');
  const at0 = (await title.boundingBox())!;

  await dragBy(page, 'place-title', 0, -0.25);
  expect((await title.boundingBox())!.y).toBeLessThan(at0.y - 10);

  await page.getByTestId('place-reset').click();
  await expect.poll(async () => (await title.boundingBox())!.y, { timeout: 5_000 }).toBeCloseTo(at0.y, 0);
  await expect(page.getByTestId('place-reset')).toBeDisabled();
});

test('the kit editor moves the same three, and keeps them', async ({ page }) => {
  // Where the owner actually went looking: Bộ nhận diện → Chỉnh lớp, where the card and the
  // subtitle used to be two rows marked CỐ ĐỊNH with no way to move either.
  await page.goto('/studio/kits/demo');
  await dismissTour(page);
  await page.getByTestId('kit-mode-layers').click();
  await expect(page.getByTestId('layer-place-title')).toContainText('kéo trên khung');

  const canvas = page.getByTestId('layer-canvas');
  const img = canvas.locator('img');
  const before = await img.getAttribute('src');
  const frame = (await canvas.boundingBox())!;
  const h = (await page.getByTestId('place-title').boundingBox())!;

  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 - (frame.height * 0.3 * i) / 6);
  }
  await page.mouse.up();

  // The phone above is built from the kit, so a moved handle is a different picture.
  await expect.poll(() => img.getAttribute('src'), { timeout: 10_000 }).not.toBe(before);
  await expect(page.getByTestId('place-reset')).toBeEnabled();

  await page.getByTestId('kit-save').click();
  await expect(page.getByTestId('kit-saved')).toBeVisible();

  await page.reload();
  await dismissTour(page);
  await page.getByTestId('kit-mode-layers').click();
  // Solid, not dashed: the kit now says where the headline goes rather than leaving it
  // anchored to the bottom of the card.
  await expect(page.getByTestId('place-title')).not.toContainText('đáy');
  await expect(page.getByTestId('place-reset')).toBeEnabled();

  // Put the kit back, so the next run of this file starts where this one did.
  await page.getByTestId('place-reset').click();
  await page.getByTestId('kit-save').click();
  await expect(page.getByTestId('kit-saved')).toBeVisible();
});

test('the Video screen can show each moment of the story frame', async ({ page }) => {
  // Until now the still drew a card the finished reel only holds for three seconds, so the
  // one screen meant for judging the video showed a moment that mostly does not exist.
  await atVideoStep(page);
  const img = page.locator('[data-testid="frame-placer"] img');
  await expect(page.getByTestId('ctl-moment')).toBeVisible();
  await expect(page.getByTestId('ctl-moment-hero')).toHaveAttribute('aria-pressed', 'true');

  for (const at of ['inset', 'bed'] as const) {
    const before = await img.getAttribute('src');
    await page.getByTestId(`ctl-moment-${at}`).click();
    await expect(page.getByTestId(`ctl-moment-${at}`)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => img.getAttribute('src'), { timeout: 10_000 }).not.toBe(before);
    await expect(img).toHaveAttribute('src', new RegExp(`at=${at}`));
  }
  await page.screenshot({ path: 'tests/shots/97-moment-bed.png', fullPage: true });
});

test('the bed shows what the script put in the middle, and offers a motion draft', async ({ page }) => {
  // The demo narration supplies exactly one tenant, a figure (29.710 đô la), so the chip
  // carries no counter and clicking it again is a no-op. A chip that moved while the
  // picture stayed put would be the "control that appears to do nothing" bug again —
  // tests/unit/middle.test.ts holds the cycling itself, which is pure.
  await atVideoStep(page);
  const img = page.locator('[data-testid="frame-placer"] img');
  await page.getByTestId('ctl-moment-bed').click();
  await expect(img).toHaveAttribute('src', /at=bed/);
  await expect(img).toHaveAttribute('src', /num=29\.710/);
  await expect(page.getByTestId('ctl-moment-count')).toHaveCount(0);

  const before = await img.getAttribute('src');
  await page.getByTestId('ctl-moment-bed').click();
  await expect(page.getByTestId('ctl-moment-bed')).toHaveAttribute('aria-pressed', 'true');
  await expect(img).toHaveAttribute('src', String(before));

  // Timing questions need motion, and this button is the only thing here that spends an encode.
  await expect(page.getByTestId('ctl-motion-draft')).toBeEnabled();
});
