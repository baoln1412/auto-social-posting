import { test, expect } from '@playwright/test';
import { dismissTour } from './fixtures';

/**
 * S17 — Thư viện is the gold lake, one PostCard per post (docs/plans/mock-v3/02-library.html).
 *
 * The card is app/components/PostCard.tsx imported unmodified — its "Original:" line is the
 * proof it is the same component the old app renders. Studio wraps it with what the lake
 * cannot know: the run's progress, the reel, and the three actions.
 */
test.describe('Thư viện = the lake', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/studio/library');
    await dismissTour(page);
  });

  test('the reference toolbar, the old app\'s market tabs and filters, day groups', async ({ page }) => {
    const bar = page.getByTestId('lake-toolbar');
    await expect(bar.getByTestId('lake-search')).toBeVisible();
    await expect(bar.getByTestId('lake-sort')).toBeVisible();
    await expect(bar.getByTestId('lake-view')).toBeVisible();
    await expect(bar.getByTestId('lake-refresh')).toBeVisible();
    await expect(bar.getByTestId('lake-create')).toHaveAttribute('href', '/studio');

    const tabs = page.getByTestId('lake-tabs').locator('a');
    expect(await tabs.count()).toBeGreaterThan(1);
    await expect(page.getByTestId('lake-tab-other')).toContainText('Khác');

    const filters = page.getByTestId('lake-filters');
    await expect(filters.getByTestId('lake-source')).toBeVisible();
    await expect(filters.getByTestId('lake-status')).toBeVisible();
    await expect(filters.getByTestId('lake-video-filter')).toBeVisible();
    await expect(filters.getByTestId('lake-count')).toContainText(/\d+ bài/);

    await expect(page.getByTestId('lake-day').first()).toBeVisible();
    await expect(page.getByTestId('lake-day').first().locator('.st-num')).toHaveText(/^\d+$/);
  });

  test('every card is PostCard itself, wrapped with progress dots and three actions', async ({ page }) => {
    const cards = page.getByTestId('lake-card');
    await expect(cards.first()).toBeVisible();
    const first = cards.first();
    await expect(first.getByText(/^Original:/)).toBeVisible();
    await expect(first.getByTestId('lake-dots').locator('i')).toHaveCount(5);
    await expect(first.getByTestId('lake-video')).toBeVisible();
    await expect(first.getByTestId('lake-image')).toBeVisible();
    await expect(first.getByTestId('lake-publish')).toBeVisible();
  });

  test('Video: chưa có keeps only posts with no run, and says how many', async ({ page }) => {
    await page.getByTestId('lake-video-filter').selectOption('none');
    await expect(page.getByTestId('lake-count')).toContainText(/\d+ bài/);
    const cards = page.getByTestId('lake-card');
    const n = await cards.count();
    for (let i = 0; i < n; i++) {
      await expect(cards.nth(i).getByTestId('lake-dots').locator('i.done')).toHaveCount(0);
      await expect(cards.nth(i).getByTestId('lake-video')).toHaveText(/Tạo video/);
    }
  });

  test('Tạo video on a card makes the run, and the card shows it after a reload', async ({ page }) => {
    await page.getByTestId('lake-video-filter').selectOption('none');
    const card = page.getByTestId('lake-card').first();
    const title = await card.getByTestId('lake-title').textContent();
    await card.getByTestId('lake-video').click();
    await page.waitForURL(/\/studio\/runs\/[0-9a-f-]{36}/);

    await page.goto('/studio/library');
    await dismissTour(page);
    const again = page.getByTestId('lake-card').filter({ has: page.getByText(title!.trim(), { exact: true }) }).first();
    await expect(again.getByTestId('lake-video')).not.toHaveText(/Tạo video/);
    await expect(again.getByTestId('lake-state')).toContainText(/Đang làm|Video xong|Đã đăng/);
  });

  test('Sửa ảnh opens the run on its Ảnh step', async ({ page }) => {
    const card = page.getByTestId('lake-card').first();
    await card.getByTestId('lake-image').click();
    await page.waitForURL(/\/studio\/runs\/[0-9a-f-]{36}\?step=image/);
    await expect(page.getByTestId('step-image')).toBeVisible();
  });

  test('Khác lists the runs that have no post — the v2 library, untouched', async ({ page }) => {
    await page.getByTestId('lake-tab-other').click();
    await expect(page.getByTestId('lib-search')).toBeVisible();
    await expect(page.getByTestId('lib-item').first()).toBeVisible();
  });
});
