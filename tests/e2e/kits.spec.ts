import { test, expect } from '@playwright/test';

test('the two kits render the same headline as visibly different cards', async ({ page, request }) => {
  await page.goto('/studio/kits');
  await expect(page.getByTestId('kit-desoul-posting-vi')).toBeVisible();
  await expect(page.getByTestId('kit-demo')).toBeVisible();

  const vi = await page.getByTestId('kit-card-desoul-posting-vi').getAttribute('src');
  const demo = await page.getByTestId('kit-card-demo').getAttribute('src');
  expect(vi).not.toBe(demo);
  // The same title through two kits: different renderer, different shape, different theme.
  expect(vi).toContain('/api/image/card');
  expect(vi).toContain('ratio=4%3A5');
  expect(demo).toContain('/api/studio/card');
  expect(demo).toContain('ratio=9%3A16');
  expect(demo).toContain('theme=');
  // The classic route has no theme parameter, so a kit must never send it one.
  expect(vi).not.toContain('theme=');

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
  await expect(page.getByTestId('tab-card')).toContainText('9:16');
  await expect(page.getByTestId('tab-captions')).toContainText('dam');
  await page.screenshot({ path: 'tests/shots/31-kit-editor.png', fullPage: true });

  const before = await page.getByTestId('kit-canvas').getAttribute('src');
  await page.getByTestId('tab-card').click();
  await expect(page.getByTestId('preset-gallery')).toBeVisible();

  // A classic preset switches the renderer as well as the shape.
  await page.getByTestId('preset-card-news').click();
  await expect(page.getByTestId('kit-canvas')).not.toHaveAttribute('src', before!);
  await expect(page.getByTestId('kit-canvas')).toHaveAttribute('src', /\/api\/image\/card/);
  await expect(page.getByTestId('kit-canvas')).toHaveAttribute('src', /ratio=4%3A5/);
  await expect(page.getByTestId('tab-card')).toContainText('4:5');

  await page.getByTestId('kit-save').click();
  await expect(page.getByTestId('kit-saved')).toBeVisible();

  // Put it back, so the side-by-side screenshot keeps meaning something.
  await page.getByTestId('tab-card').click();
  await page.getByTestId('preset-card-toi').click();
  await page.getByTestId('field-card-ratio').selectOption('9:16');
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

test('the four drawn themes each render, and the classic card is untouched', async ({ page, request }) => {
  const title = 'MỸ: CỤ BÀ 82 TUỔI Ở POMONA BỊ LỪA MẤT 2.500 ĐÔ VÌ CHIÊU VÉ SỐ TRÚNG THƯỞNG';
  const hl = 'CỤ BÀ 82 TUỔI Ở POMONA BỊ LỪA MẤT 2.500 ĐÔ VÌ CHIÊU VÉ SỐ TRÚNG THƯỞNG';

  for (const theme of ['sang', 'toi', 'pastel', 'bao']) {
    const q = new URLSearchParams({ title, hl, theme, ratio: '4:5', font: 'BeVietnamPro-Black' });
    const res = await request.get(`/api/studio/card?${q}`);
    expect(res.status(), theme).toBe(200);
    expect((await res.body()).length, theme).toBeGreaterThan(10_000);
  }

  // 9:16 — a frame the classic route cannot make at all.
  const tall = await request.get(
    `/api/studio/card?${new URLSearchParams({ title, hl, theme: 'toi', ratio: '9:16', radius: '28' })}`,
  );
  expect(tall.status()).toBe(200);

  // The classic route still answers exactly as it did, and still ignores a theme.
  const classic = await request.get(`/api/image/card?${new URLSearchParams({ title, hl, ratio: '4:5' })}`);
  expect(classic.status()).toBe(200);
  expect((await classic.body()).length).toBeGreaterThan(50_000);

  // Both engines side by side on the kits page.
  await page.goto('/studio/kits');
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('kit-card-demo')).toHaveAttribute('src', /api\/studio\/card/);
  await expect(page.getByTestId('kit-card-desoul-posting-vi')).toHaveAttribute('src', /api\/image\/card/);
  await page.screenshot({ path: 'tests/shots/32-two-engines.png', fullPage: true });
});

test('the editor exposes the card controls the plan drew', async ({ page }) => {
  await page.goto('/studio/kits/demo');
  await expect(page.getByTestId('tab-card')).toBeVisible();
  for (const field of ['theme', 'font', 'radius', 'titleSize', 'highlightColor', 'ratio']) {
    await expect(page.getByTestId(`field-card-${field}`), field).toBeVisible();
  }
  for (const preset of ['sang', 'toi', 'pastel', 'bao']) {
    await expect(page.getByTestId(`preset-card-${preset}`), preset).toBeVisible();
  }

  const before = await page.getByTestId('kit-canvas').getAttribute('src');
  await page.getByTestId('preset-card-bao').click();
  await expect(page.getByTestId('kit-canvas')).not.toHaveAttribute('src', before!);
  await expect(page.getByTestId('kit-canvas')).toHaveAttribute('src', /theme=bao/);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'tests/shots/33-kit-card-controls.png', fullPage: true });

  // Put the demo kit back where the side-by-side screenshot expects it.
  await page.getByTestId('preset-card-toi').click();
  await page.getByTestId('field-card-ratio').selectOption('9:16');
  await page.getByTestId('kit-save').click();
  await expect(page.getByTestId('kit-saved')).toBeVisible();
});

test('choosing a theme does not leave the previous highlight behind', async ({ page }) => {
  await page.goto('/studio/kits/demo');
  await page.getByTestId('tab-card').click();

  // The demo kit carries a yellow highlight that is invisible on the newspaper theme's white.
  await page.getByTestId('preset-card-bao').click();
  // A colour input is never empty, so "unset" is carried on the control, not in its value.
  await expect(page.getByTestId('field-card-highlightColor')).toHaveAttribute('data-unset', 'true');
  await expect(page.getByTestId('kit-contrast-warning')).toHaveCount(0);

  // And if the owner picks one anyway, they are told before they save, not after.
  await page.getByTestId('swatch-card-highlightColor').fill('#F8EF63');
  await expect(page.getByTestId('kit-contrast-warning')).toBeVisible();
  await expect(page.getByTestId('kit-contrast-warning')).toContainText('3:1');
  await page.screenshot({ path: 'tests/shots/34-contrast-warning.png', fullPage: true });

  // ↺ puts it back to the theme's own colour — without it the first click on the swatch
  // would pin a colour with no way to remove it.
  await page.getByTestId('clear-card-highlightColor').click();
  await expect(page.getByTestId('field-card-highlightColor')).toHaveAttribute('data-unset', 'true');

  await page.getByTestId('preset-card-toi').click();
  await expect(page.getByTestId('kit-contrast-warning')).toHaveCount(0);
  await page.getByTestId('field-card-ratio').selectOption('9:16');
  await page.getByTestId('kit-save').click();
  await expect(page.getByTestId('kit-saved')).toBeVisible();
});
