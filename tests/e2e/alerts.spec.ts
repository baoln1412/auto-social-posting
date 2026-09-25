import { expect, test } from '@playwright/test';
import { dismissTour } from './fixtures';

/**
 * The claim S23 has to keep: a step that fails is visible to the owner within a second,
 * without them going looking for it.
 *
 * The demo channel can be told to fail a named step, which is how a render failure is forced
 * here rather than by breaking something real.
 */
test('a forced render failure reaches the bell, and the page that explains it', async ({ page, request }) => {
  // Start from a clean bell so the count under test is this failure's.
  await request.post('/api/studio/alerts', { data: {} });

  const made = await request.post('/api/studio/runs', {
    data: { channelId: 'demo', itemRef: 'demo:1', overrides: { demo: { boom: 'reel' } } },
  });
  const { id } = (await made.json()) as { id: string };

  for (let i = 0; i < 4; i++) await request.post(`/api/studio/runs/${id}/advance`, { data: { allowSpend: true } });

  // The bell is server-rendered, so the very next page the owner opens carries the count.
  await page.goto('/studio');
  await dismissTour(page);
  await expect(page.getByTestId('bell-count')).toBeVisible();
  await page.screenshot({ path: 'tests/shots/69-alert-bell.png' });

  // And the bell goes somewhere that says what broke.
  await page.getByTestId('bell').click();
  await page.waitForURL(/\/studio\/analytics/);
  const row = page.getByTestId('alert-row').first();
  await expect(row).toContainText('Dựng video');
  await expect(row).toContainText(/Video/);
  // The SPA's dashboard fetches its own numbers; shooting before they land captures a
  // "Loading analytics…" that says nothing about what was built.
  await expect(page.getByTestId('an-dashboard').getByText('Loading analytics…')).toHaveCount(0);
  await page.screenshot({ path: 'tests/shots/70-analytics.png', fullPage: true });

  // Reading them empties the count without deleting the history.
  await page.getByTestId('alerts-clear').click();
  await expect(page.getByTestId('alerts-unseen')).toHaveCount(0);
  await expect(page.getByTestId('alert-row').first()).toBeVisible();

  await page.goto('/studio');
  await expect(page.getByTestId('bell-count')).toHaveCount(0);
});

test('the analytics page separates a post with no numbers from one with zero', async ({ page }) => {
  await page.goto('/studio/analytics');
  await dismissTour(page);
  await expect(page.getByTestId('an-dashboard')).toBeVisible();
  await expect(page.getByTestId('an-dashboard').getByText('Loading analytics…')).toHaveCount(0);
  // No page is connected on this machine, so nothing has insights — and the page says that
  // rather than printing zeros.
  const runs = page.getByTestId('an-run');
  if (await runs.count()) await expect(runs.first().getByTestId('an-nonumbers')).toBeVisible();
  else await expect(page.getByTestId('an-empty')).toBeVisible();
});

/** The reference for the top half is our own app — Studio wraps that dashboard, not a copy. */
test('the SPA analytics tab, for the pair', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Analytics', { exact: true }).first().click();
  await expect(page.getByText('Analytics Overview')).toBeVisible();
  await page.screenshot({ path: 'tests/shots/71-spa-analytics.png', fullPage: false });
});
