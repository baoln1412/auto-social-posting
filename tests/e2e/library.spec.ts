import { test, expect } from '@playwright/test';
import { PNG_1PX } from './fixtures';
import newTour from '@/lib/studio/tours/new.json';

test('the library groups by day, finds a run by its source link, and downloads it', async ({
  page,
  request,
}) => {
  // A finished demo run, so there is something real to find.
  const run = await request.post('/api/studio/runs', {
    data: { channelId: 'demo', itemRef: 'demo:1' },
  });
  const { id } = (await run.json()) as { id: string };
  for (let i = 0; i < 4; i++) {
    await request.post(`/api/studio/runs/${id}/advance`, { data: {} });
  }

  // v3: the library is the post lake; runs with no post (demo:, url:, text:) live under Khác.
  await page.goto('/studio/library?market=other');
  await page.getByTestId('tour-skip').click();

  await expect(page.getByTestId('lib-day').first()).toBeVisible();
  await expect(page.getByTestId('lib-item').first()).toBeVisible();

  const all = await page.getByTestId('lib-item').count();

  // The owner remembers the link, not the uuid. Every demo run shares this source, so the
  // assertion is "it narrowed and it found them", not a fixed count — other tests in this
  // database legitimately made more.
  await page.getByTestId('lib-search').fill('demo-visa-rule');
  const bySource = await page.getByTestId('lib-item').count();
  expect(bySource).toBeGreaterThan(0);
  expect(bySource).toBeLessThanOrEqual(all);
  await expect(page.getByTestId('lib-download').first()).toBeVisible();

  // A run id is unique by construction, so this one is exact.
  await page.getByTestId('lib-search').fill(id);
  await expect(page.getByTestId('lib-item')).toHaveCount(1);
  await page.getByTestId('lib-search').fill('demo-visa-rule');
  await page.screenshot({ path: 'tests/shots/40-library.png', fullPage: true });

  // …and accent-free search still finds it.
  await page.getByTestId('lib-search').fill('kenh thu');
  await expect(page.getByTestId('lib-item').first()).toBeVisible();

  await page.getByTestId('lib-search').fill('chắc chắn không có');
  await expect(page.getByTestId('lib-empty')).toBeVisible();

  await page.getByTestId('lib-search').fill('');
  await page.getByTestId('lib-view').click();
  await expect(page.getByTestId('lib-item').first()).toBeVisible();
  await page.screenshot({ path: 'tests/shots/41-library-list.png', fullPage: true });

  const dl = await page.getByTestId('lib-download').first().getAttribute('href');
  expect((await request.get(dl!)).status()).toBe(200);
});

test('an uploaded background shows in the kit frame tab', async ({ page, request }) => {
  const up = await request.post('/api/studio/media', {
    multipart: {
      kind: 'bg',
      file: { name: 'nền của tôi.png', mimeType: 'image/png', buffer: PNG_1PX },
    },
  });
  expect(up.ok()).toBe(true);
  const { media } = (await up.json()) as { media: { id: string; url: string } };

  await page.goto('/studio/assets');
  await expect(page.getByTestId('media-bg').first()).toBeVisible();
  await expect(page.getByTestId('quota-bar')).toBeVisible();
  await expect(page.getByTestId('quota-label')).toContainText('/ 30 tệp');
  await page.screenshot({ path: 'tests/shots/42-assets.png', fullPage: true });

  // The same file, offered in the kit's frame tab.
  await page.goto('/studio/kits/demo');
  await page.getByTestId('tab-frame').click();
  await expect(page.getByTestId('kit-media')).toBeVisible();
  await page.getByTestId(`media-pick-${media.id}`).click();
  await page.getByTestId('kit-save').click();
  await expect(page.getByTestId('kit-saved')).toBeVisible();
  await expect(page.getByTestId('tab-frame')).toContainText(media.id.slice(0, 6));
  await page.screenshot({ path: 'tests/shots/43-kit-background.png', fullPage: true });

  // Clean up, so the quota bar in the shot above stays meaningful next run.
  await request.delete(`/api/studio/media/${media.id}`);
});

test('the tour runs once and not twice', async ({ page }) => {
  // Counted from the tour file, not typed in: hard-coding "1/4" made adding a step to the
  // tour fail a test about something else entirely.
  const n = newTour.length;
  await page.goto('/studio');
  await expect(page.getByTestId('tour')).toBeVisible();
  await expect(page.getByTestId('tour')).toContainText(`1/${n}`);
  await page.screenshot({ path: 'tests/shots/44-tour.png' });

  await page.getByTestId('tour-next').click();
  await expect(page.getByTestId('tour')).toContainText(`2/${n}`);
  await page.getByTestId('tour-back').click();
  await expect(page.getByTestId('tour')).toContainText(`1/${n}`);
  await page.getByTestId('tour-skip').click();
  await expect(page.getByTestId('tour')).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('tour')).toHaveCount(0);
});

test('every guide card opens the screen it names', async ({ page }) => {
  await page.goto('/studio/guide');
  const cards = page.getByTestId('guide-card');
  const n = await cards.count();
  expect(n).toBe(5);
  await page.screenshot({ path: 'tests/shots/45-guide.png', fullPage: true });

  for (let i = 0; i < n; i++) {
    await page.goto('/studio/guide');
    const href = await cards.nth(i).getAttribute('href');
    await cards.nth(i).click();
    await page.waitForURL(`**${href}`);
    // Not a 404 shell: every target renders its own heading.
    await expect(page.locator('h1')).toBeVisible();
  }
});
