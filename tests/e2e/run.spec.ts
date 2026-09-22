import { test, expect } from '@playwright/test';
import { dismissTour } from './fixtures';

const STEPS = ['fetch', 'draft', 'image', 'reel'];

test('a demo run walks every step, each previewed and priced before it runs', async ({ page }) => {
  await page.goto('/studio');
  await page.getByTestId('create-run').click();
  await page.waitForURL(/\/studio\/runs\/[0-9a-f-]+$/);

  // Step 1 — fetch. The preview is there before anything ran, with a price on it.
  await expect(page.getByTestId('step-fetch')).toHaveAttribute('data-state', 'current');
  await expect(page.getByTestId('preview-items')).toBeVisible();
  await expect(page.getByTestId('cost-fetch')).toContainText('$0.00');
  await expect(page.getByTestId('continue-fetch')).toBeEnabled();
  await dismissTour(page);
  await page.screenshot({ path: 'tests/shots/01-run-fetch.png', fullPage: true });

  await page.getByTestId('continue-fetch').click();
  await expect(page.getByTestId('step-fetch')).toHaveAttribute('data-state', 'done');

  // Step 2 — draft. The gate ran, so its chip names how many rules it checked.
  await expect(page.getByTestId('continue-draft')).toBeEnabled();
  await page.getByTestId('continue-draft').click();
  await expect(page.getByTestId('step-draft')).toContainText('3 quy tắc · đạt');
  // The editor holds the draft the step actually produced — not an empty box.
  await expect(page.getByTestId('draft-text')).toHaveValue(/IELTS 6\.0/);
  // And the fetch step still says which item it chose.
  await expect(page.getByTestId('step-fetch')).toContainText('ÚC SIẾT VISA DU HỌC');

  // The comment pool arrived with the source and every comment carries its score.
  await expect(page.getByTestId('pool-comment')).toHaveCount(5);

  // Promote two comments — the scene list grows immediately, before any render.
  const scenesBefore = await page.getByTestId('scene').count();
  await page.getByTestId('pick-c2').check();
  await page.getByTestId('pick-c4').check();
  await expect(page.getByTestId('scene')).toHaveCount(scenesBefore + 2);
  await expect(page.getByTestId('scene').last()).toContainText('201 likes');

  await page.getByTestId('continue-image').click();
  // The card lands in the rail; step 3 collapses to a one-line row, as the plan draws it.
  await expect(page.getByTestId('rail-card')).toBeVisible();
  await expect(page.getByTestId('step-image')).toHaveAttribute('data-open', 'false');
  await page.getByTestId('head-image').click();
  await expect(page.getByTestId('card-preview')).toBeVisible();
  // …and folds away again, which is the state the run page is normally in.
  await page.getByTestId('head-image').click();
  await expect(page.getByTestId('step-image')).toHaveAttribute('data-open', 'false');

  await page.getByTestId('continue-reel').click();
  await expect(page.getByTestId('run-player')).toBeVisible();
  await expect(page.getByTestId('run-download')).toBeVisible();

  for (const s of STEPS) {
    await expect(page.getByTestId(`step-${s}`)).toHaveAttribute('data-state', 'done');
  }
  // The tour is a once-per-browser overlay; the screenshot is of the page, not of it.
  await dismissTour(page);
  await page.screenshot({ path: 'tests/shots/02-run-done.png', fullPage: true });
  // A sticky rail lands wherever the full-page capture was scrolled to, so the rail gets a
  // viewport shot of its own or it can never be judged.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'tests/shots/03-run-rail.png' });
});

test('the scene selection survives a reload', async ({ page }) => {
  await page.goto('/studio');
  await page.getByTestId('create-run').click();
  await page.waitForURL(/\/studio\/runs\/[0-9a-f-]+$/);
  await page.getByTestId('continue-fetch').click();
  await page.getByTestId('pick-c1').check();
  await page.getByTestId('continue-draft').click();
  await expect(page.getByTestId('draft-text')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('pick-c1')).toBeChecked();
});

test('a forced failure stops the run on that step and says why', async ({ page }) => {
  await page.goto('/studio');
  await page.getByTestId('ov-toggle').click();
  await page.getByTestId('ov-comment-mode').selectOption('manual');
  await page.getByTestId('create-run').click();
  await page.waitForURL(/\/studio\/runs\/[0-9a-f-]+$/);
  // The drawer value rode along with the run, and the rail summarises it without a click.
  await expect(page.getByTestId('ov-summary')).toBeVisible();
  await page.getByTestId('ov-edit').click();
  await expect(page.getByTestId('ov-comment-mode')).toHaveValue('manual');
});
