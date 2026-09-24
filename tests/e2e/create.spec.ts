import { test, expect } from '@playwright/test';
import { dismissTour } from './fixtures';

/**
 * S16 — the create page as the reference draws it (docs/plans/mock-v3/01-create.html):
 * the step rail as chips, one paste box with a bottom bar, Door 1 as a status strip under it,
 * suggestion cards that create a run, and real frames in Kết quả gần đây.
 *
 * The s8 assertions (source.spec, shell.spec) keep passing untouched: the test ids and the
 * `nguồn: …` wording are the contract, the layout is not.
 */
test.describe('Tạo video', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/studio');
    await dismissTour(page);
  });

  test('the rail is five idle chips with icons, above one box with a bottom bar', async ({ page }) => {
    const chips = page.getByTestId('create-rail').locator('.st-chip');
    await expect(chips).toHaveCount(5);
    await expect(chips.first()).toContainText('Đọc bài');
    await expect(chips.last()).toContainText('Đăng');
    for (let i = 0; i < 5; i++) await expect(chips.nth(i).locator('svg')).toHaveCount(1);

    const box = page.getByTestId('door-single');
    await expect(box).toHaveClass(/st-card/);
    const bar = box.getByTestId('create-bar');
    await expect(bar.getByTestId('detected')).toContainText('nguồn:');
    await expect(bar.getByTestId('channel-picker')).toBeVisible();
    await expect(bar.getByTestId('ov-toggle')).toContainText('Tuỳ chỉnh');
    await expect(bar.getByTestId('create-run').locator('svg')).toHaveCount(1);
  });

  test('Door 1 is a status strip under the box, with its schedule and both actions', async ({ page }) => {
    const strip = page.getByTestId('door-auto');
    await expect(strip).toContainText('Nguồn tự động');
    // The schedule read off the plist (or the honest "no plist" line), never a placeholder.
    await expect(page.getByTestId('pipeline-schedule')).toContainText(/giờ|lần|Chưa tìm thấy/);
    await expect(page.getByTestId('pipeline-state')).not.toHaveText('…');
    await expect(strip.getByTestId('pipeline-setup')).toHaveText('Thiết lập');
    await expect(strip.getByTestId('pipeline-run')).toContainText('Chạy ngay');
    // Below the box, not beside it: the reference has one hero action.
    const boxBox = await page.getByTestId('door-single').boundingBox();
    const stripBox = await strip.boundingBox();
    expect(stripBox!.y).toBeGreaterThan(boxBox!.y + boxBox!.height - 1);
  });

  test('a suggestion is a card with its source, a Gold badge and a button that makes the run', async ({ page }) => {
    const cards = page.getByTestId('suggestion');
    const n = await cards.count();
    test.skip(n === 0, 'no gold post without a reel in this lake');
    const first = cards.first();
    await expect(first.getByTestId('suggestion-source')).not.toHaveText('');
    await expect(first.locator('.st-badge')).toHaveText('Gold');
    await expect(first.getByTestId('suggestion-go').locator('svg')).toHaveCount(1);
    await first.getByTestId('suggestion-go').click();
    await page.waitForURL(/\/studio\/runs\/[0-9a-f-]{36}$/);
  });

  test('Kết quả gần đây shows a frame, or says why there is none — never a dash', async ({ page }) => {
    const items = page.getByTestId('recent-item');
    const n = await items.count();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(6);
    for (let i = 0; i < n; i++) {
      const it = items.nth(i);
      const img = it.locator('img');
      if (await img.count()) {
        await expect(img).toHaveJSProperty('complete', true);
        expect(await img.evaluate((e: HTMLImageElement) => e.naturalWidth)).toBeGreaterThan(0);
      } else {
        // The tile itself is the empty state, and it names the run's state — never a dash.
        await expect(it).toHaveClass(/st-empty/);
        await expect(it).toContainText(/render|chưa|lỗi|chặn|mới/);
      }
    }
    await expect(page.getByTestId('recent-all')).toContainText(/Xem tất cả \(\d+\)/);
  });
});
