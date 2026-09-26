import { expect, test } from '@playwright/test';
import { dismissTour } from './fixtures';

/**
 * A Bộ nhận diện you can actually make.
 *
 * v3 shipped the editor with no way in: two kits arrived as files and the page offered
 * nothing else, so "đổi diện mạo của kênh" meant editing one of the two the pack came with —
 * the one thing seedDemo warns against, since a later revision bump replaces it.
 */
test('a new kit is a copy, opens in the editor, and can be deleted again', async ({ page }) => {
  await page.goto('/studio/kits');
  await dismissTour(page);

  const before = await page.getByTestId('kit-grid').locator('> li').count();
  await page.getByTestId('kit-new').click();
  const name = `Thử ${Date.now()}`;
  await page.getByTestId('kit-new-name').fill(name);
  await page.getByTestId('kit-new-from').selectOption('desoul-posting-vi');
  await page.getByTestId('kit-new-go').click();

  // It lands in the editor, on the kit it just made.
  await page.waitForURL(/\/studio\/kits\/[a-z0-9-]+$/);
  const id = page.url().split('/').pop()!;
  expect(id).not.toBe('desoul-posting-vi');

  // And it is a copy: the card it draws is the source's, not an empty one.
  await page.goto('/studio/kits');
  await expect(page.getByTestId('kit-grid').locator('> li')).toHaveCount(before + 1);
  await expect(page.getByTestId(`kit-card-${id}`)).toBeVisible();
  await page.screenshot({ path: 'tests/shots/72-kits.png', fullPage: true });

  // A shipped kit offers no delete, because the next boot would bring it back.
  await expect(page.getByTestId('kit-delete-desoul-posting-vi')).toHaveCount(0);

  await page.getByTestId(`kit-delete-${id}`).click();
  await expect(page.getByTestId(`kit-card-${id}`)).toHaveCount(0);
});

// Refusing to delete a kit a channel is wearing is covered in tests/unit/kit-create.test.ts:
// pointing a channel at a kit needs a write the channels API does not expose, and adding one
// only so a browser could make it would be a route with a single caller — the test.

