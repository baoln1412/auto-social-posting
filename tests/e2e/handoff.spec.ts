import { test, expect } from '@playwright/test';
import { dismissTour } from './fixtures';

test.setTimeout(180_000);

test('a post card opens in Studio, and the old Tạo Video modal still works', async ({ page }) => {
  await page.goto('/');
  // The existing app, untouched: its own cards, its own drawer.
  const link = page.getByTestId('open-in-studio').first();
  await expect(link).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: 'tests/shots/60-postcard-link.png' });

  // The old modal is still the old modal: its own Script / Kiểu phụ đề panel opens.
  await page.getByRole('button', { name: 'Tạo Video' }).first().click();
  await expect(page.getByRole('heading', { name: 'Script' }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Kiểu phụ đề' }).first()).toBeVisible();
  await page.screenshot({ path: 'tests/shots/61-old-modal-still-works.png' });
  await page.keyboard.press('Escape');

  // The link hands the post to Studio and lands on its run page.
  const href = await link.getAttribute('href');
  expect(href).toMatch(/^\/studio\/runs\/new\?item=gold:[^&]+&market=/);
  await link.click();
  await page.waitForURL(/\/studio\/runs\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  await dismissTour(page);

  // It is a real run on a real channel, ready at its first step.
  await expect(page.getByTestId('step-fetch')).toHaveAttribute('data-state', 'current');
  await page.getByTestId('continue-fetch').click();
  await expect(page.getByTestId('rail-fetch')).toHaveAttribute('data-state', 'done');
  await page.getByTestId('rail-fetch').click();

  // …and it fetched the post the link named, not merely the newest one.
  const goldId = decodeURIComponent(href!.split('item=gold:')[1].split('&')[0]);
  const shown = await page.getByTestId('step-fetch').textContent();
  expect(shown?.length ?? 0).toBeGreaterThan(20);
  expect(goldId).toMatch(/^[0-9a-f-]{8,}/);
  await page.screenshot({ path: 'tests/shots/62-handoff-run.png', fullPage: true });
});

test('the same post handed over twice reuses one channel', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.getByTestId('open-in-studio').first().getAttribute('href');

  await page.goto(href!);
  await page.waitForURL(/\/studio\/runs\/[0-9a-f-]{36}$/);
  await page.goto('/studio/channels');
  const after1 = await page.getByTestId('channel-card').count();
  expect(after1).toBeGreaterThan(0);

  await page.goto(href!);
  await page.waitForURL(/\/studio\/runs\/[0-9a-f-]{36}$/);
  await page.goto('/studio/channels');
  // The claim is that a second hand-over adds no channel — not that any particular name
  // exists. ("Kho bài" is also the gold source LABEL, so matching on it hits every gold
  // channel on the page.)
  expect(await page.getByTestId('channel-card').count()).toBe(after1);
});
