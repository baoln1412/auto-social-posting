import { test, expect } from '@playwright/test';
import { dismissTour, imagesLoaded } from './fixtures';
import { FIELD_LABELS, TAB_LABELS } from '@/lib/studio/kits/labels';

/**
 * §9: "Schema keys are not labels." The editor is generated from the schema, so without the
 * label map it puts `card.engine` and `highlightBg` on screen. Every tab here is checked for
 * a human name on every control, and for a canvas that answers when one is moved.
 */
const TABS = ['identity', 'post', 'voice', 'frame', 'card', 'captions', 'signature', 'stickers'];

test('every tab names its controls in Vietnamese, and none shows a schema key', async ({ page }) => {
  await page.goto('/studio/kits/demo');
  await dismissTour(page);

  for (const key of TABS) {
    await page.getByTestId(`tab-${key}`).click();
    const panel = page.locator('aside');
    await expect(panel.getByText(TAB_LABELS[key].label, { exact: true }).first()).toBeVisible();

    // The editor marks an unnamed control with ⚠ rather than printing its key, so this
    // catches a schema field added without a label even though the unit test also would.
    await expect(panel.getByText('⚠')).toHaveCount(0);

    await imagesLoaded(page, '[data-testid="kit-canvas"], [data-testid^="preset-thumb-"]');
    await page.screenshot({ path: `tests/shots/b-kit-${key}.png`, fullPage: true });
  }
});

test('every control the plan marks keep or add is on its tab', async ({ page }) => {
  await page.goto('/studio/kits/demo');
  await dismissTour(page);

  // §4's rows, by the field that carries each one.
  const expected: Record<string, string[]> = {
    identity: ['channelName', 'handle', 'avatar', 'logo'],
    post: ['topics', 'tags', 'language', 'narration', 'commentMode', 'format', 'length', 'hashtags'],
    voice: ['provider', 'voiceId'],
    card: ['theme', 'font', 'titleSize', 'width', 'y', 'radius', 'highlightColor', 'comments', 'ratio'],
    captions: ['font', 'color', 'highlightMode', 'highlightColor', 'outlineWidth', 'shadow', 'pos', 'size'],
    frame: ['layout', 'intro', 'durationBand', 'background'],
    stickers: ['set', 'where'],
    signature: ['handle', 'watermark'],
  };

  for (const [tab, fields] of Object.entries(expected)) {
    await page.getByTestId(`tab-${tab}`).click();
    for (const f of fields) {
      await expect(page.getByTestId(`field-${tab}-${f}`), `${tab}.${f}`).toBeVisible();
      expect(FIELD_LABELS[`${tab}.${f}`], `${tab}.${f} label`).toBeTruthy();
    }
  }
});

test('a card control changes the canvas, and a caption control changes it too', async ({ page }) => {
  await page.goto('/studio/kits/demo');
  await dismissTour(page);
  const canvas = page.getByTestId('kit-canvas');

  await page.getByTestId('tab-card').click();
  const card = await canvas.getAttribute('src');
  await page.getByTestId('field-card-width').fill('60');
  await expect.poll(() => canvas.getAttribute('src'), { timeout: 3_000 }).not.toBe(card);
  await expect(canvas).toHaveAttribute('src', /width=60/);

  // The caption tabs draw the composed frame instead, and the same rule holds there.
  await page.getByTestId('tab-captions').click();
  await expect(canvas).toHaveAttribute('src', /\/api\/studio\/frame\?/);
  const frame = await canvas.getAttribute('src');
  await page.getByTestId('field-captions-size').fill('110');
  await expect.poll(() => canvas.getAttribute('src'), { timeout: 3_000 }).not.toBe(frame);
});

test('the caption presets are a wall of rendered styles, not a list of names', async ({ page }) => {
  await page.goto('/studio/kits/demo');
  await dismissTour(page);
  await page.getByTestId('tab-captions').click();

  const thumbs = page.locator('[data-testid^="preset-thumb-"]');
  await expect(thumbs.first()).toBeVisible();
  expect(await thumbs.count()).toBeGreaterThanOrEqual(5);
  // Each thumbnail is the real composed frame at that preset, so two of them differ.
  const a = await thumbs.nth(0).getAttribute('src');
  const b = await thumbs.nth(1).getAttribute('src');
  expect(a).not.toBe(b);
  expect(a).toContain('/api/studio/frame?');
  await imagesLoaded(page, '[data-testid^="preset-thumb-"]');
  await page.screenshot({ path: 'tests/shots/b-kit-caption-wall.png', fullPage: true });
});

test('the voice tab can be heard before anything is rendered', async ({ page }) => {
  await page.goto('/studio/kits/demo');
  await dismissTour(page);
  await page.getByTestId('tab-voice').click();

  await expect(page.getByTestId('voice-sample-text')).toBeVisible();
  await expect(page.getByTestId('voice-sample-audio')).toHaveCount(0);
  await page.getByTestId('voice-listen').click();
  await expect(page.getByTestId('voice-sample-audio')).toHaveAttribute(
    'src',
    /\/api\/studio\/tts-sample\?.*voice=/,
  );
  await page.screenshot({ path: 'tests/shots/b-kit-voice.png', fullPage: true });
});

test('opened from a run, saving asks which of the two it meant', async ({ page, request }) => {
  const run = await request.post('/api/studio/runs', { data: { channelId: 'demo' } });
  const { id } = (await run.json()) as { id: string };

  // The drawer is where the owner is when they want more than it offers.
  await page.goto(`/studio/runs/${id}`);
  await dismissTour(page);
  // `Sửa` beside the override summary — the run page's drawer, not the New page's gear.
  // (.click().catch() on the wrong testid waits the full timeout; the helper in fixtures.ts
  //  exists because that once killed a browser mid-run.)
  await page.getByTestId('ov-edit').click();
  await expect(page.getByTestId('ov-full-config')).toHaveAttribute('href', new RegExp(`run=${id}$`));
  await page.getByTestId('ov-full-config').click();

  await page.waitForURL(/\/studio\/kits\/.*run=/);
  await dismissTour(page);
  await expect(page.getByTestId('kit-save')).toHaveText('Lưu vào bộ nhận diện');
  await page.getByTestId('tab-captions').click();
  await page.getByTestId('field-captions-size').fill('96');
  await page.screenshot({ path: 'tests/shots/b-kit-from-run.png', fullPage: true });

  await page.getByTestId('kit-save-run').click();
  await page.waitForURL(new RegExp(`/studio/runs/${id}$`));

  // This run carries the change…
  await dismissTour(page);
  await page.getByTestId('ov-edit').click();
  await expect(page.getByTestId('field-captions-size')).toHaveCount(0); // back on the run
  const preview = await request.post(`/api/studio/runs/${id}/preview`, {
    data: { step: 'fetch', opts: {} },
  });
  expect(preview.ok()).toBe(true);

  // …and the kit does not. Overrides have never written back to a kit, and the whole point
  // of offering the choice is that "chỉ lượt này" means exactly that.
  await page.goto('/studio/kits/demo');
  await dismissTour(page);
  await page.getByTestId('tab-captions').click();
  await expect(page.getByTestId('field-captions-size')).not.toHaveValue('96');
});
