import { test, expect } from '@playwright/test';

const US = 'c7469ff0-5bae-495a-befd-8c2539c4ff31';

// A real reel is edge-tts + whisper + ffmpeg on this machine: minutes, not seconds.
test.setTimeout(16 * 60_000);

test('one real gold post becomes a post, a card and an MP4', async ({ page, request }) => {
  const ch = await request.post('/api/studio/channels', {
    data: { name: `US real ${Date.now()}`, kind: 'gold', config: { marketId: US }, kitId: 'demo' },
  });
  const { id: channelId } = (await ch.json()) as { id: string };

  const run = await request.post('/api/studio/runs', {
    // `long` band: a four-sentence gold post reads for well over a minute, and the budget
    // gate is right to hold that against the default medium band.
    data: { channelId, mode: 'read-post', overrides: { durationBand: 'long' } },
  });
  const { id: runId } = (await run.json()) as { id: string };
  await page.goto(`/studio/runs/${runId}`);

  // fetch — a real lake item, priced at nothing.
  await expect(page.getByTestId('preview-items')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('continue-fetch').click();
  await expect(page.getByTestId('step-fetch')).toHaveAttribute('data-state', 'done');

  // draft — the gold row passes through free, and the compliance gate names its three rules.
  await expect(page.getByTestId('cost-draft')).toHaveText('$0.00');
  await page.getByTestId('continue-draft').click();
  await expect(page.getByTestId('step-draft')).toContainText('3 quy tắc · đạt');
  await expect(page.getByTestId('draft-text')).not.toHaveValue('');
  await page.screenshot({ path: 'tests/shots/20-real-draft.png', fullPage: true });

  // image — the real card renderer, then the layout gate on the actual pixels.
  await page.getByTestId('continue-image').click();
  await expect(page.getByTestId('card-preview')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('step-image')).toContainText('3 quy tắc · đạt');
  const card = await page.getByTestId('card-preview').getAttribute('src');
  expect(card).toMatch(/^\/studio-runs\/.*-card\.png$/);
  const png = await request.get(card!);
  expect(png.status()).toBe(200);
  expect((await png.body()).length).toBeGreaterThan(50_000);
  await page.screenshot({ path: 'tests/shots/21-real-card.png', fullPage: true });

  // reel — make-reel.py for real. The stage rail has to show something while it runs.
  await page.getByTestId('continue-reel').click();
  await expect(page.getByTestId('render-rail')).toBeVisible({ timeout: 90_000 });
  // Visible is not the same as working: make-reel.py's ::step: markers have to reach the
  // rail, which they did not when the progress endpoint lived in its own route file.
  await expect(page.getByTestId('render-tts')).toHaveAttribute('data-done', 'true', {
    timeout: 5 * 60_000,
  });
  await page.screenshot({ path: 'tests/shots/22-real-rendering.png', fullPage: true });

  await expect(page.getByTestId('run-player')).toBeVisible({ timeout: 15 * 60_000 });
  await expect(page.getByTestId('step-reel')).toContainText('2 quy tắc · đạt');
  const mp4 = await page.getByTestId('run-player').getAttribute('src');
  const vid = await request.get(mp4!);
  expect(vid.status()).toBe(200);
  expect((await vid.body()).length).toBeGreaterThan(200_000);
  await page.screenshot({ path: 'tests/shots/23-real-done.png', fullPage: true });
});
