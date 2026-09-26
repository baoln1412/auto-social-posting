import { expect, test } from '@playwright/test';
import { dismissTour } from './fixtures';

/**
 * One way to make a video from a post, not three.
 *
 * PostCard ships two of its own — a `Mở trong Studio` link and the gradient `Tạo Video` that
 * opens the old one-shot modal — and Studio's cap adds a third. Three buttons on one card,
 * two of them going somewhere different, is what sent the owner down the ASP path without
 * knowing there had been a choice. PostCard cannot be edited, so the Studio library hides its
 * two; this counts what is left.
 */
test('a Library card offers exactly one way to make the video', async ({ page }) => {
  await page.goto('/studio/library');
  await dismissTour(page);
  const card = page.getByTestId('lake-card').first();
  await expect(card).toBeVisible();

  // By element, not by label: the cap's button reads `Tạo video`, `Xem video` or
  // `Mở lượt chạy` depending on what the post already has, and an earlier spec in the suite
  // can have made that run — which is how a label-based count found zero and failed a test
  // about something else entirely.
  await expect(card.getByTestId('lake-video')).toHaveCount(1);
  await expect(card.getByTestId('lake-video')).toBeVisible();
  await expect(card.getByTestId('open-in-studio')).toBeHidden();
  await expect(card.locator('button.bg-gradient-to-r')).toBeHidden();

  // And nothing else on the card offers to make one.
  const visibleVideoControls = card.locator('button:visible, a:visible').filter({ hasText: /video|lượt chạy/i });
  await expect(visibleVideoControls).toHaveCount(1);

  // The old one-shot path is not deleted — it is where it always was, on Desoul Posting.
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Tạo Video$/ }).first()).toBeVisible();
});

test('the kit chosen on the Library page is the kit the run is made with', async ({ page }) => {
  await page.goto('/studio/library');
  await dismissTour(page);

  const picker = page.getByTestId('lake-kit');
  await expect(picker).toBeVisible();
  // The default is the channel's own kit, and it says so.
  await expect(picker.locator('option', { hasText: 'mặc định của kênh' })).toHaveCount(1);

  const options = await picker.locator('option').all();
  const other = (await Promise.all(options.map((o) => o.getAttribute('value')))).find(
    (v) => v && v !== 'desoul-posting-vi',
  );
  test.skip(!other, 'only one kit on this install');
  await picker.selectOption(other!);

  // Make a run on a post that has none, and check what kit it came out wearing.
  await page.getByTestId('lake-video-filter').selectOption('none');
  await page.getByTestId('lake-card').first().getByTestId('lake-video').click();
  await page.waitForURL(/\/studio\/runs\/[0-9a-f-]{36}/);
  await expect(page.getByTestId('ov-summary')).toContainText(/kit:/i);
  await page.getByTestId('ov-edit').click();
  await expect(page.getByTestId('ov-kit')).toHaveValue(other!);
});
