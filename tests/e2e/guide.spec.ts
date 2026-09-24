import { expect, test } from '@playwright/test';

/**
 * The guide hub. What a guide page gets wrong is not looks — it is pointing somewhere that is
 * not there any more, so every card's destination is opened, and every guide has to carry steps
 * rather than a promise that the screen will explain itself.
 */
test('every card opens a screen that exists, and every guide has steps', async ({ page }) => {
  await page.goto('/studio/guide');
  const cards = page.getByTestId('guide-card');
  const n = await cards.count();
  expect(n).toBe(5);
  await expect(page.getByTestId('guide-detail')).toHaveCount(n);

  const details = page.getByTestId('guide-detail');
  for (let i = 0; i < n; i++) {
    const steps = await details.nth(i).getByTestId('guide-step').count();
    expect(steps, `guide ${i + 1} has numbered steps`).toBeGreaterThanOrEqual(2);
  }
  await page.screenshot({ path: 'tests/shots/61-guide.png', fullPage: true });

  // Clicked, not fetched: a route can answer 200 and render a 404 shell.
  for (let i = 0; i < n; i++) {
    await page.goto('/studio/guide');
    const href = await cards.nth(i).getAttribute('href');
    await cards.nth(i).click();
    await page.waitForURL(`**${href}`);
    await expect(page.locator('h1')).toBeVisible();
  }
  console.log(`checked ${n} guides, their steps and their destinations`);
});

test('Bắt đầu tour runs the tour again after it was dismissed', async ({ page }) => {
  await page.goto('/studio');
  await page.getByTestId('tour-skip').click();
  await expect(page.getByTestId('tour')).toHaveCount(0);

  await page.goto('/studio/guide');
  await page.getByTestId('guide-tour').click();
  await page.waitForURL('**/studio');
  await expect(page.getByTestId('tour')).toBeVisible();
  await expect(page.getByTestId('tour')).toContainText('1/');
});
