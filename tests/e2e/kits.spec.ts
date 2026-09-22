import { test, expect } from '@playwright/test';

test('the two kits render the same headline as visibly different cards', async ({ page, request }) => {
  await page.goto('/studio/kits');
  await expect(page.getByTestId('kit-desoul-posting-vi')).toBeVisible();
  await expect(page.getByTestId('kit-demo')).toBeVisible();

  const vi = await page.getByTestId('kit-card-desoul-posting-vi').getAttribute('src');
  const demo = await page.getByTestId('kit-card-demo').getAttribute('src');
  expect(vi).not.toBe(demo);
  // The same title through two kits: different shape, and only one paints a highlight.
  expect(vi).toContain('ratio=4%3A5');
  expect(demo).toContain('ratio=1%3A1');
  expect(vi).toContain('hl=');
  expect(demo).not.toContain('hl=');

  // Both are real renders, not broken images.
  for (const src of [vi!, demo!]) {
    const res = await request.get(src);
    expect(res.status()).toBe(200);
    expect((await res.body()).length).toBeGreaterThan(20_000);
  }

  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'tests/shots/30-two-kits.png', fullPage: true });
});

test('the editor changes a kit through the preview and the tab strip', async ({ page }) => {
  await page.goto('/studio/kits/demo');
  await expect(page.getByTestId('kit-canvas')).toBeVisible();
  await expect(page.getByTestId('tab-strip')).toBeVisible();

  // Every tab the schema defines, each showing what it is set to.
  await expect(page.getByTestId('tab-card')).toContainText('1:1');
  await expect(page.getByTestId('tab-captions')).toContainText('dam');
  await page.screenshot({ path: 'tests/shots/31-kit-editor.png', fullPage: true });

  const before = await page.getByTestId('kit-canvas').getAttribute('src');
  await page.getByTestId('tab-card').click();
  await expect(page.getByTestId('preset-gallery')).toBeVisible();
  await page.getByTestId('preset-card-news').click();
  await expect(page.getByTestId('kit-canvas')).not.toHaveAttribute('src', before!);
  await expect(page.getByTestId('kit-canvas')).toHaveAttribute('src', /ratio=4%3A5/);
  await expect(page.getByTestId('tab-card')).toContainText('4:5');

  await page.getByTestId('kit-save').click();
  await expect(page.getByTestId('kit-saved')).toBeVisible();

  // Put it back, so the side-by-side screenshot keeps meaning something.
  await page.getByTestId('tab-card').click();
  await page.getByTestId('preset-card-square-flat').click();
  await page.getByTestId('kit-save').click();
  await expect(page.getByTestId('kit-saved')).toBeVisible();
});

test('a kit the schema rejects is refused rather than stored', async ({ request }) => {
  const res = await request.put('/api/studio/kits/demo', {
    data: { id: 'demo', name: 'Demo', schemaVersion: 1, identity: { channelName: 'x' },
            card: { ratio: '16:9' } },
  });
  expect(res.status()).toBe(400);
  expect(((await res.json()) as { error: string }).error).toMatch(/ratio|enum|allowed/i);
});
