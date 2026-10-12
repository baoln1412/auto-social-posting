import { test, expect } from '@playwright/test';
import { dismissTour, imagesLoaded } from './fixtures';

/**
 * Chỉnh lớp — the canvas and the stack beside it (ref/tv-33).
 *
 * That a layer lands where it was put is measured on a rendered MP4 in
 * tests/unit/layer-render.test.ts; this is about the editor: adding, ordering, locking,
 * grouping, undoing, and that what it stores is what the kit keeps.
 */
test('the canvas and the stack, as the reference draws them', async ({ page }) => {
  await page.goto('/studio/kits/demo');
  await dismissTour(page);
  await page.getByTestId('kit-mode-layers').click();

  await expect(page.getByTestId('layer-editor')).toBeVisible();
  await expect(page.getByTestId('layer-count')).toHaveText('0/20');
  // What the engine draws gets its own rows, and they are draggable on the frame rather
  // than locked — the demo kit is the studio engine, whose card has no badge, so two.
  await expect(page.getByTestId('layer-place-title')).toContainText('kéo trên khung');
  await expect(page.getByTestId('layer-place-caption')).toContainText('kéo trên khung');
  await expect(page.getByTestId('layer-place-logo')).toHaveCount(0);
  await expect(page.getByTestId('place-title')).toBeVisible();
  await expect(page.getByTestId('place-caption')).toBeVisible();

  for (const t of ['text', 'image', 'shape', 'banner']) {
    await page.getByTestId(`layer-add-${t}`).click();
  }
  await expect(page.getByTestId('layer-count')).toHaveText('4/20');
  await expect(page.getByTestId('layer-list').locator('li')).toHaveCount(6); // 4 + 2 engine rows

  await imagesLoaded(page, '[data-testid="layer-canvas"] img');
  await page.screenshot({ path: 'tests/shots/c0-layers.png', fullPage: true });
});

test('a layer can be dragged, and undo puts it back', async ({ page }) => {
  await page.goto('/studio/kits/demo');
  await dismissTour(page);
  await page.getByTestId('kit-mode-layers').click();
  await page.getByTestId('layer-add-shape').click();

  const box = page.getByTestId('layer-list').locator('li').first();
  await expect(box).toBeVisible();
  const id = await page
    .locator('[data-testid^="layer-box-"]')
    .first()
    .getAttribute('data-testid');
  const layer = page.getByTestId(id!);
  const before = await layer.getAttribute('data-x');

  // Drag it left by a quarter of the canvas.
  const canvas = await page.getByTestId('layer-canvas').boundingBox();
  const at = await layer.boundingBox();
  await page.mouse.move(at!.x + at!.width / 2, at!.y + at!.height / 2);
  await page.mouse.down();
  await page.mouse.move(at!.x + at!.width / 2 - canvas!.width * 0.25, at!.y + at!.height / 2, {
    steps: 8,
  });
  await page.mouse.up();

  const after = await layer.getAttribute('data-x');
  expect(Number(after)).toBeLessThan(Number(before));
  // Clamped, never dragged out of the frame — a negative x draws nothing and looks lost.
  expect(Number(after)).toBeGreaterThanOrEqual(0);

  await page.getByTestId('layer-undo').click();
  await expect(layer).toHaveAttribute('data-x', before!);
});

test('order, delete and the engine rows behave', async ({ page }) => {
  await page.goto('/studio/kits/demo');
  await dismissTour(page);
  await page.getByTestId('kit-mode-layers').click();
  await page.getByTestId('layer-add-shape').click();
  await page.getByTestId('layer-add-banner').click();

  // The list reads top-of-stack first, so the newest layer is at the top.
  const rows = page.getByTestId('layer-list').locator('li');
  const first = await rows.first().textContent();
  expect(first).toContain('Banner');

  const id = (await page.locator('[data-testid^="layer-down-"]').first().getAttribute('data-testid'))!
    .replace('layer-down-', '');
  await page.getByTestId(`layer-down-${id}`).click();
  await expect(rows.first()).toContainText('Hình');

  await page.getByTestId(`layer-del-${id}`).click();
  await expect(page.getByTestId('layer-count')).toHaveText('1/20');
  // Deleting the owner's layers never touches the engine's rows.
  await expect(page.getByTestId('layer-place-title')).toBeVisible();
});

test('what the editor stores is what the kit keeps', async ({ page, request }) => {
  await page.goto('/studio/kits/demo');
  await dismissTour(page);
  await page.getByTestId('kit-mode-layers').click();
  await page.getByTestId('layer-add-banner').click();
  await page.getByTestId('layer-text').fill('THEO NGUỒN');
  await page.getByTestId('kit-save').click();
  await expect(page.getByTestId('kit-saved')).toBeVisible();

  await page.reload();
  await dismissTour(page);
  await page.getByTestId('kit-mode-layers').click();
  await expect(page.getByTestId('layer-count')).toHaveText('1/20');
  await expect(page.getByTestId('layer-list')).toContainText('THEO NGUỒN');

  // Put it back, so the next run of this file starts where this one did.
  await page.locator('[data-testid^="layer-del-"]').first().click();
  await page.getByTestId('kit-save').click();
  await expect(page.getByTestId('kit-saved')).toBeVisible();
  expect(request).toBeTruthy();
});
