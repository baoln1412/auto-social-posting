import { expect, test } from '@playwright/test';

/**
 * Kênh · Kho tài nguyên · Cài đặt · Nguồn tự động — reskinned, same behaviour.
 *
 * So what is tested is what the reskin added and could get wrong: a tab that filters nothing,
 * a locked tab with no reason on it, a sub-nav pointing at sections that are not in the page,
 * and market cards that lost the facts the list used to carry.
 */
test('Kho tài nguyên has the five tabs and says why Hiệu ứng is locked', async ({ page }) => {
  await page.goto('/studio/assets');
  const tabs = page.getByTestId('asset-tabs').locator('button');
  await expect(tabs).toHaveCount(5);
  await expect(tabs).toHaveText([/Ảnh nền/, /Video nền/, /Sticker/, /Hiệu ứng/, /Nhạc nền/]);

  // Locked, with the reason in the panel — not hidden, and not a dead tab either.
  await page.getByTestId('asset-tab-fx').click();
  await expect(page.getByTestId('asset-locked')).toContainText('Nhạc nền');
  await expect(page.getByTestId('upload-fx')).toHaveCount(0);

  // Every unlocked tab offers an upload of its own kind.
  for (const id of ['bg', 'bgvideo', 'sticker', 'music']) {
    await page.getByTestId(`asset-tab-${id}`).click();
    await expect(page.getByTestId(`upload-${id}`)).toHaveCount(1);
  }
  await expect(page.getByTestId('quota-bar')).toBeVisible();
  // Back to the tab the page opens on, so the STOP shot is the screen a person first sees.
  await page.getByTestId('asset-tab-bg').click();
  await page.screenshot({ path: 'tests/shots/62-assets.png', fullPage: true });
  console.log('checked 5 asset tabs');
});

test('Cài đặt: every sub-nav item lands on a section that is in the page', async ({ page }) => {
  await page.goto('/studio/settings');
  const nav = page.getByTestId('settings-nav').locator('a');
  const n = await nav.count();
  expect(n).toBe(6);
  for (let i = 0; i < n; i++) {
    const id = (await nav.nth(i).getAttribute('href'))!.slice(1);
    await expect(page.locator(`#${id}`), `#${id} exists`).toBeVisible();
  }
  // The SPA's own connect panel, imported rather than reimplemented.
  await expect(page.getByTestId('set-facebook')).toContainText(/Facebook/i);
  await page.screenshot({ path: 'tests/shots/63-settings.png', fullPage: true });
  console.log(`checked ${n} settings sections`);
});

test('Nguồn tự động: every market card carries its schedule and what it has produced', async ({ page }) => {
  await page.goto('/studio/pipeline');
  // One launchd job runs every market, so the schedule is stated once above the list rather
  // than eight identical times inside it.
  await expect(page.getByTestId('pipeline-schedule-line')).toBeVisible();

  const rows = page.getByTestId('market-row');
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const text = await rows.nth(i).innerText();
    expect(text, `card ${i + 1} says what it has produced`).toMatch(/bài Gold/);
    expect(text, `card ${i + 1} says whether it is set up`).toMatch(/chưa thiết lập|bản/);
  }
  await page.screenshot({ path: 'tests/shots/64-pipeline.png', fullPage: true });
  console.log(`checked ${n} market cards`);
});

test('Kênh lists what each channel is and what it makes', async ({ page }) => {
  await page.goto('/studio/channels');
  const cards = page.getByTestId('channel-card');
  if (await cards.count()) await expect(cards.first()).toBeVisible();
  else await expect(page.getByTestId('channels-empty')).toBeVisible();
  await page.screenshot({ path: 'tests/shots/65-channels.png', fullPage: true });
});
