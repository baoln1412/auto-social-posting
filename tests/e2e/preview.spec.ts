import { test, expect } from '@playwright/test';
import { dismissTour } from './fixtures';

/**
 * The owner's complaint C: "each step should be viewable when I change the options, not at
 * the last step only". v1 previewed once per page load — a drawer change or a ticked comment
 * updated client state and nothing else until the next advance.
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
  await expect(page.getByTestId('controls-reel')).toBeVisible();
}

test('changing the caption preset redraws the frame, without continuing', async ({ page }) => {
  await atVideoStep(page);

  const frame = page.getByTestId('preview-frame');
  await expect(frame).toBeVisible();
  const before = await frame.getAttribute('src');
  expect(before).toContain('/api/studio/frame?');

  // The control opens on what the kit is actually set to, so pick something else.
  const from = await page.getByTestId('ctl-caption-preset').inputValue();
  const to = from === 'karaoke' ? 'tinnong' : 'karaoke';

  // The frame is the composed still — plate, caption band, sticker — so a preset is a
  // visible choice, not a name in a list.
  await page.getByTestId('ctl-caption-preset').selectOption(to);

  await expect.poll(() => frame.getAttribute('src'), { timeout: 2_000 }).not.toBe(before);
  await expect(frame).toHaveAttribute('src', new RegExp(`preset%22%3A%22${to}`));

  // Nothing was continued: the step is still the one we were standing on.
  await expect(page.getByTestId('step-reel')).toHaveAttribute('data-state', 'current');
  await page.screenshot({ path: 'tests/shots/90-preview-preset.png', fullPage: true });
});

test('the frame the preview points at is a real PNG', async ({ page, request }) => {
  await atVideoStep(page);
  const src = await page.getByTestId('preview-frame').getAttribute('src');
  const res = await request.get(src!);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('image/png');
  // 1080×1920 is what make-reel.py draws; a stub would not weigh this.
  expect((await res.body()).length).toBeGreaterThan(20_000);
});

test('the size knob moves the frame too, and the veil says a redraw is in flight', async ({
  page,
}) => {
  await atVideoStep(page);
  const frame = page.getByTestId('preview-frame');
  const before = await frame.getAttribute('src');

  await page.getByTestId('ctl-caption-size').fill('120');
  // Debounced 400ms: the last good picture stays up, dimmed, rather than blanking.
  await expect(page.getByTestId('preview-veil')).toHaveAttribute('data-stale', 'true');
  await expect.poll(() => frame.getAttribute('src'), { timeout: 3_000 }).not.toBe(before);
  await expect(page.getByTestId('preview-veil')).toHaveAttribute('data-stale', 'false');
  await page.screenshot({ path: 'tests/shots/91-preview-size.png', fullPage: true });
});

test('the scene picker chooses which frame is drawn, and it can be heard', async ({ page }) => {
  await atVideoStep(page);
  const frame = page.getByTestId('preview-frame');
  const before = await frame.getAttribute('src');

  await page.getByTestId('ctl-scene').selectOption('1');
  await expect.poll(() => frame.getAttribute('src'), { timeout: 3_000 }).not.toBe(before);

  // Nghe thử mounts its <audio> on click: one per scene on page load would call out to
  // Microsoft for every scene of every run just by opening the page.
  await expect(page.getByTestId('ctl-listen-audio')).toHaveCount(0);
  await page.getByTestId('ctl-listen').click();
  await expect(page.getByTestId('ctl-listen-audio')).toHaveAttribute(
    'src',
    /\/api\/studio\/tts-sample\?/,
  );
});

test('the kit editor canvas is the same composed frame on the caption tab', async ({ page }) => {
  await page.goto('/studio/kits/demo');
  await dismissTour(page);
  const canvas = page.getByTestId('kit-canvas');
  const card = await canvas.getAttribute('src');
  expect(card).toContain('/card?');

  await page.getByTestId('tab-captions').click();
  await expect(canvas).toHaveAttribute('src', /\/api\/studio\/frame\?/);
  await page.screenshot({ path: 'tests/shots/92-kit-frame-canvas.png', fullPage: true });
});
