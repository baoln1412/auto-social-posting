import { test, expect, type BrowserContext } from '@playwright/test';
import { signTier } from '@/lib/studio/tier';

const SECRET = 'playwright-tier-secret';

/** A real signed cookie — the same path production uses, not an env-var shortcut. */
async function asDemo(context: BrowserContext) {
  await context.addCookies([
    {
      name: 'desoul_tier',
      value: signTier('demo', SECRET),
      url: 'http://127.0.0.1:3001',
    },
  ]);
}

test('the demo tier walks the whole flow with mock data and spends nothing', async ({
  page,
  context,
}) => {
  await asDemo(context);
  await page.goto('/studio');
  await expect(page.getByTestId('tier-badge')).toHaveText('demo');
  await page.getByTestId('tour-skip').click();

  // It sees the demo channel and nothing that belongs to the owner.
  await expect(page.getByTestId('channel-picker').locator('option')).toHaveCount(1);
  await expect(page.getByTestId('channel-picker')).toContainText('Kênh thử');

  await page.getByTestId('create-run').click();
  await page.waitForURL(/\/studio\/runs\/[0-9a-f-]{36}$/);

  for (const step of ['fetch', 'draft', 'image', 'reel']) {
    await expect(page.getByTestId(`cost-${step}`)).toContainText('$0.00');
  }
  await page.getByTestId('continue-fetch').click();
  await page.getByTestId('continue-draft').click();
  await page.getByTestId('continue-image').click();
  await page.getByTestId('continue-reel').click();
  await expect(page.getByTestId('run-player')).toBeVisible();

  // Every step, after the fact, still cost nothing.
  for (const step of ['fetch', 'draft', 'image', 'reel']) {
    await expect(page.getByTestId(`cost-${step}`)).toContainText('$0.00');
  }
  await expect(page.locator('body')).toContainText('không tốn phí');
  await page.screenshot({ path: 'tests/shots/70-demo-tier-run.png', fullPage: true });
});

test('the demo tier is shown none of the owner’s work', async ({ page, context }) => {
  await asDemo(context);

  await page.goto('/studio/channels');
  const channels = page.getByTestId('channel-card');
  await expect(channels).toHaveCount(1);
  await expect(channels).toContainText('Kênh thử');

  await page.goto('/studio/library');
  await page.getByTestId('tour-skip').click();
  for (const item of await page.getByTestId('lib-item').all()) {
    await expect(item).toContainText('Kênh thử');
  }
  await page.screenshot({ path: 'tests/shots/71-demo-tier-library.png', fullPage: true });
});

test('the demo tier cannot create, edit or deliver', async ({ page, context, request }) => {
  await asDemo(context);
  const cookie = `desoul_tier=${signTier('demo', SECRET)}`;

  const channel = await request.post('/api/studio/channels', {
    headers: { cookie },
    data: { name: 'x', kind: 'gold', config: { marketId: 'x' } },
  });
  expect(channel.status()).toBe(403);

  const kit = await request.put('/api/studio/kits/demo', {
    headers: { cookie },
    data: { id: 'demo', name: 'Demo', schemaVersion: 1, identity: { channelName: 'x' } },
  });
  expect(kit.status()).toBe(403);

  const upload = await request.post('/api/studio/media', {
    headers: { cookie },
    multipart: { kind: 'bg', file: { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from('x') } },
  });
  expect(upload.status()).toBe(403);

  const telegram = await request.post('/api/studio/telegram', {
    headers: { cookie },
    data: { action: 'code' },
  });
  expect(telegram.status()).toBe(403);

  await page.goto('/studio/settings');
  await expect(page.getByTestId('settings-denied')).toBeVisible();
  await page.screenshot({ path: 'tests/shots/72-demo-tier-settings.png' });
});

test('a post-only channel stops after the card', async ({ page, request }) => {
  const ch = await request.post('/api/studio/channels', {
    data: {
      name: `Chỉ bài ${Date.now()}`,
      kind: 'gold',
      config: { marketId: 'c7469ff0-5bae-495a-befd-8c2539c4ff31' },
      kitId: 'desoul-posting-vi',
      makes: ['post'],
    },
  });
  const { id: channelId } = (await ch.json()) as { id: string };
  const run = await request.post('/api/studio/runs', {
    data: { channelId, mode: 'read-post' },
  });
  const { id } = (await run.json()) as { id: string };

  await page.goto(`/studio/runs/${id}`);
  await expect(page.getByTestId('step-image')).toBeVisible();
  await expect(page.getByTestId('step-reel')).toHaveCount(0);

  await page.getByTestId('continue-fetch').click();
  await page.getByTestId('continue-draft').click();
  await page.getByTestId('continue-image').click();
  await expect(page.getByTestId('rail-card')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('run-status')).toContainText('xong');
  await page.screenshot({ path: 'tests/shots/73-post-only-run.png', fullPage: true });
});
