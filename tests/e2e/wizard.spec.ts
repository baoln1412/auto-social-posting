import { test, expect } from '@playwright/test';

test('the wizard walks five steps and will not pass a source that cannot fetch', async ({ page }) => {
  const name = `Tin định cư Mỹ ${Date.now()}`;
  await page.goto('/studio/channels');
  await page.getByTestId('new-channel').click();
  await page.waitForURL(/\/studio\/channels\/new$/);

  // 1 — source. Threads has no token: shown with the reason, not hidden.
  await expect(page.getByTestId('rail-0')).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId('blocked-threads')).toBeVisible();
  await expect(page.getByTestId('source-threads').getByRole('radio')).toBeDisabled();
  await page.screenshot({ path: 'tests/shots/10-wizard-source.png' });

  await page.getByTestId('source-gold').getByRole('radio').check();
  await page.getByTestId('wizard-next').click();

  // 2 — the gate. Nothing fetched yet, so there is no way forward.
  await expect(page.getByTestId('wizard-next')).toBeDisabled();
  await page.getByTestId('cfg-market').selectOption({ label: 'US Immigration' });
  await page.getByTestId('run-test').click();
  await expect(page.getByTestId('test-item')).toHaveCount(3, { timeout: 30_000 });
  await expect(page.getByTestId('wizard-next')).toBeEnabled();
  await page.screenshot({ path: 'tests/shots/11-wizard-fetch-test.png' });

  await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('make-reel')).toBeChecked();
  await page.screenshot({ path: 'tests/shots/12-wizard-makes.png' });

  await page.getByTestId('wizard-next').click();
  await page.getByTestId('kit-demo').check();
  await page.screenshot({ path: 'tests/shots/13-wizard-kit.png' });

  await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('wizard-save')).toBeDisabled();
  await page.getByTestId('channel-name').fill(name);
  await page.screenshot({ path: 'tests/shots/14-wizard-done.png' });
  await page.getByTestId('wizard-save').click();

  await page.waitForURL(/\/studio\/channels$/);
  await expect(page.getByTestId('channel-card').filter({ hasText: name })).toBeVisible();
  await page.screenshot({ path: 'tests/shots/15-channels.png' });
});

test('changing the source withdraws the proof that the last one fetched', async ({ page }) => {
  await page.goto('/studio/channels/new');
  await page.getByTestId('source-gold').getByRole('radio').check();
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('run-test').click();
  await expect(page.getByTestId('test-items')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('wizard-back').click();
  await page.getByTestId('source-reddit').getByRole('radio').check();
  await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('test-items')).toHaveCount(0);
  await expect(page.getByTestId('wizard-next')).toBeDisabled();
});

test('a bad url fails the fetch test out loud instead of creating a dead channel', async ({ page }) => {
  await page.goto('/studio/channels/new');
  await page.getByTestId('source-article').getByRole('radio').check();
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('cfg-url').fill('https://example.invalid/nothing-here');
  await page.getByTestId('run-test').click();
  await expect(page.getByTestId('test-error')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('wizard-next')).toBeDisabled();
});

test('a run on a real gold channel fetches the item it was pointed at', async ({ page, request }) => {
  const ch = await request.post('/api/studio/channels', {
    data: {
      name: `Gold ${Date.now()}`,
      kind: 'gold',
      config: { marketId: 'c7469ff0-5bae-495a-befd-8c2539c4ff31' },
      kitId: 'demo',
      makes: ['post', 'reel'],
    },
  });
  expect(ch.ok()).toBe(true);
  const { id: channelId } = (await ch.json()) as { id: string };

  // Which item the run is pointed at comes from the source itself, not a fixture.
  const probe = await request.post('/api/studio/sources/test', {
    data: { kind: 'gold', config: { marketId: 'c7469ff0-5bae-495a-befd-8c2539c4ff31' } },
  });
  const { items } = (await probe.json()) as { items: { id: string; title: string }[] };
  const target = items[1];

  const run = await request.post('/api/studio/runs', {
    data: { channelId, itemRef: target.id },
  });
  const { id: runId } = (await run.json()) as { id: string };

  await page.goto(`/studio/runs/${runId}`);
  await page.getByTestId('continue-fetch').click();
  await expect(page.getByTestId('step-fetch')).toHaveAttribute('data-state', 'done');
  await expect(page.getByTestId('step-fetch')).toContainText(target.title);
  await page.screenshot({ path: 'tests/shots/16-run-real-gold.png', fullPage: true });
});
