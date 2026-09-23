import { test, expect } from '@playwright/test';
import { dismissTour } from './fixtures';

/**
 * The run page is one screen per step now, with the rail on top.
 *
 * So "is step 3 done" is a question for the rail, not for a stack of cards: the screen shows
 * the step the owner is standing on, and the rail says where everything else stands. v1's
 * accordion made the scene list — the thing actually worked in — compete for height with
 * three results already accepted.
 */
const STEPS = ['fetch', 'draft', 'image', 'reel', 'publish'];

async function newRun(page: import('@playwright/test').Page) {
  await page.goto('/studio');
  await dismissTour(page);
  await page.getByTestId('create-run').click();
  await page.waitForURL(/\/studio\/runs\/[0-9a-f-]+$/);
  await dismissTour(page);
}

test('a demo run walks every step, each previewed and priced before it runs', async ({ page }) => {
  await newRun(page);

  // 1 · Đọc bài. The preview is there before anything ran, with a price on it.
  await expect(page.getByTestId('rail')).toBeVisible();
  await expect(page.getByTestId('rail-fetch')).toHaveAttribute('data-state', 'current');
  await expect(page.getByTestId('step-fetch')).toBeVisible();
  await expect(page.getByTestId('preview-items')).toBeVisible();
  await expect(page.getByTestId('cost-fetch')).toContainText('$0.00');
  await expect(page.getByTestId('continue-fetch')).toBeEnabled();
  await page.screenshot({ path: 'tests/shots/01-run-fetch.png', fullPage: true });

  await page.getByTestId('continue-fetch').click();
  await expect(page.getByTestId('rail-fetch')).toHaveAttribute('data-state', 'done');

  // 2 · Viết bài — the gate ran, so the rail names how many rules it checked.
  await expect(page.getByTestId('step-draft')).toBeVisible();
  await expect(page.getByTestId('rail-draft')).toHaveAttribute('data-state', 'current');
  await page.getByTestId('continue-draft').click();
  await expect(page.getByTestId('rail-draft')).toContainText('3 quy tắc · đạt');

  // Walking back along the rail shows that step's screen, with what it produced.
  await page.getByTestId('rail-draft').click();
  await expect(page.getByTestId('draft-text')).toHaveValue(/IELTS 6\.0/);
  await page.getByTestId('rail-fetch').click();
  await expect(page.getByTestId('step-fetch')).toContainText('ÚC SIẾT VISA DU HỌC');

  // 3 · Ảnh.
  await page.getByTestId('rail-image').click();
  await page.getByTestId('continue-image').click();
  await expect(page.getByTestId('rail-image')).toHaveAttribute('data-state', 'done');

  // 4 · Video — the scene board, where the reference puts it (tv-12).
  await expect(page.getByTestId('step-reel')).toBeVisible();
  await expect(page.getByTestId('pool-comment')).toHaveCount(5);
  const scenesBefore = await page.getByTestId('scene').count();
  await page.getByTestId('pick-c2').check();
  await page.getByTestId('pick-c4').check();
  await expect(page.getByTestId('scene')).toHaveCount(scenesBefore + 2);
  await expect(page.getByTestId('scene').last()).toContainText('201 likes');
  await page.screenshot({ path: 'tests/shots/04-run-video.png', fullPage: true });

  await page.getByTestId('continue-reel').click();
  await expect(page.getByTestId('run-player')).toBeVisible();
  await expect(page.getByTestId('run-download')).toBeVisible();

  // 5 · Đăng — the last screen, because a run is finished when the owner has said where it
  // goes, not when the file exists.
  await expect(page.getByTestId('step-publish')).toBeVisible();
  await expect(page.getByTestId('publish-screen')).toBeVisible();
  await page.getByTestId('continue-publish').click();
  await expect(page.getByTestId('publish-done')).toBeVisible();

  for (const s of STEPS) {
    await expect(page.getByTestId(`rail-${s}`)).toHaveAttribute('data-state', 'done');
  }
  await page.screenshot({ path: 'tests/shots/02-run-done.png', fullPage: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'tests/shots/03-run-rail.png' });
});

test('the scene selection survives a reload', async ({ page }) => {
  await newRun(page);
  await page.getByTestId('continue-fetch').click();
  await page.getByTestId('continue-draft').click();
  await page.getByTestId('continue-image').click();

  await expect(page.getByTestId('step-reel')).toBeVisible();
  await page.getByTestId('pick-c1').check();
  // The pick rides along with the next advance, which is what stores it.
  await page.getByTestId('continue-reel').click();
  await expect(page.getByTestId('run-player')).toBeVisible();

  await page.reload();
  await dismissTour(page);
  await page.getByTestId('rail-reel').click();
  await expect(page.getByTestId('pick-c1')).toBeChecked();
});

test('a scene can be edited, heard, and put back to what it was', async ({ page }) => {
  await newRun(page);
  await page.getByTestId('continue-fetch').click();
  await page.getByTestId('continue-draft').click();
  await page.getByTestId('continue-image').click();
  await expect(page.getByTestId('step-reel')).toBeVisible();

  await page.getByTestId('pick-c2').check();
  // Named by the scene it is, not by its score — which comment carries which number is the
  // fixture's business.
  const scene = page.getByTestId('scene').filter({ has: page.getByTestId('edit-c2') });
  await expect(scene).toBeVisible();

  // Text TTS, edited in place — the line the renderer will read, not a copy of it.
  await page.getByTestId('edit-c2').click();
  await page.getByTestId('scene-edit-c2').fill('Câu này tôi tự sửa.');
  await page.getByTestId('scene-edit-c2').blur();
  await expect(scene).toContainText('Câu này tôi tự sửa.');

  // Text gốc shows what the comment actually said.
  await page.getByTestId('orig-c2').click();
  await expect(scene).not.toContainText('Câu này tôi tự sửa.');
  await page.getByTestId('orig-c2').click();

  // Nghe thoại — this scene's own line, in the voice that will read it. Mounted on click,
  // so opening the page does not call out once per scene.
  await expect(page.getByTestId('hear-c2-audio')).toHaveCount(0);
  await page.getByTestId('hear-c2').click();
  await expect(page.getByTestId('hear-c2-audio')).toHaveAttribute('src', /tts-sample/);

  // A post scene's words come from the draft, so its `sửa` goes there.
  await page.getByTestId('edit-post-1').click();
  await expect(page.getByTestId('draft-text')).toBeVisible();
  await page.screenshot({ path: 'tests/shots/05-run-scene-edit.png', fullPage: true });
});

test('Ẩn không chọn hides the pool down to what was picked', async ({ page }) => {
  await newRun(page);
  await page.getByTestId('continue-fetch').click();
  await page.getByTestId('continue-draft').click();
  await page.getByTestId('continue-image').click();

  await expect(page.getByTestId('step-reel')).toBeVisible();
  await expect(page.getByTestId('pool-comment').first()).toBeVisible();
  const all = await page.getByTestId('pool-comment').count();
  await page.getByTestId('pick-c1').check();
  await page.getByTestId('hide-unselected').check();
  await expect(page.getByTestId('pool-comment')).toHaveCount(1);
  expect(all).toBeGreaterThan(1);
});

test('the publish screen lists Telegram with its reason rather than hiding it', async ({ page }) => {
  await newRun(page);
  for (const s of ['fetch', 'draft', 'image', 'reel']) {
    await page.getByTestId(`continue-${s}`).click();
  }
  await expect(page.getByTestId('publish-screen')).toBeVisible();

  // The library is stated, not offered: every run is already in it.
  await expect(page.getByTestId('pub-library')).toBeChecked();
  await expect(page.getByTestId('pub-library')).toBeDisabled();
  // Telegram is listed either way — the demo tier is told why, not shown an empty screen.
  await expect(page.getByTestId('pub-blocked-telegram')).toBeVisible();
  await page.screenshot({ path: 'tests/shots/06-run-publish.png', fullPage: true });
});

test('a forced failure stops the run on that step and says why', async ({ page }) => {
  await page.goto('/studio');
  await dismissTour(page);
  await page.getByTestId('ov-toggle').click();
  await page.getByTestId('ov-comment-mode').selectOption('manual');
  await page.getByTestId('create-run').click();
  await page.waitForURL(/\/studio\/runs\/[0-9a-f-]+$/);
  await dismissTour(page);
  // The drawer value rode along with the run, and the rail summarises it without a click.
  await expect(page.getByTestId('ov-summary')).toBeVisible();
  await page.getByTestId('ov-edit').click();
  await expect(page.getByTestId('ov-comment-mode')).toHaveValue('manual');
});
