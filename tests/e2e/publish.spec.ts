import { expect, test } from '@playwright/test';
import { dismissTour } from './fixtures';

/**
 * Đăng and the calendar. What is worth driving through a browser here is the part the unit
 * tests cannot see: that the screen refuses a post the linter blocks, that a chosen time
 * becomes a row, and that the row is the same one the calendar draws.
 */
test('the Đăng screen counts its checks and names what it would refuse', async ({ page, request }) => {
  const made = await request.post('/api/studio/runs', {
    data: { channelId: 'demo', itemRef: 'demo:1', overrides: {} },
  });
  const { id } = (await made.json()) as { id: string };
  // Four, not five: stop ON Đăng rather than past it, so the form is what is under test.
  for (let i = 0; i < 4; i++) await request.post(`/api/studio/runs/${id}/advance`, { data: { allowSpend: true } });

  await page.goto(`/studio/runs/${id}?step=publish`);
  await dismissTour(page);

  await expect(page.getByTestId('publish-screen')).toBeVisible();
  await expect(page.getByTestId('pub-library')).toBeDisabled();
  await expect(page.getByTestId('pub-blocked-telegram')).toContainText('xem thử');
  // The first comment arrives filled in with the source, which is this project's own rule.
  await expect(page.getByTestId('pub-comment')).toHaveValue(/Nguồn: http/);
  await expect(page.getByTestId('pub-lint')).toContainText('kiểm tra');

  // Emptying it takes the citation away, and the linter says so before anything is sent.
  await page.getByTestId('pub-comment').fill('');
  await expect(page.getByTestId('pub-finding')).toContainText(/nguồn/i);
  await page.getByTestId('pub-comment').fill('Nguồn: https://example.test/a');
  await expect(page.getByTestId('pub-finding')).toHaveCount(0);

  await page.getByTestId('pub-slot').click();
  await expect(page.getByTestId('pub-at')).not.toHaveValue('');
  await page.screenshot({ path: 'tests/shots/66-publish.png', fullPage: true });
});

test('the linter blocks a post with no source and the route says which check failed', async ({ request }) => {
  const made = await request.post('/api/studio/runs', {
    data: { channelId: 'demo', itemRef: 'demo:1', overrides: {} },
  });
  const { id } = (await made.json()) as { id: string };
  for (let i = 0; i < 4; i++) await request.post(`/api/studio/runs/${id}/advance`, { data: { allowSpend: true } });

  const res = await request.post('/api/studio/publish', {
    data: { runId: id, where: ['library'], firstComment: '' },
  });
  const body = (await res.json()) as { gate?: { checked: number }; error?: string };
  // The demo item carries a source url, so a post citing it nowhere is refused — by name,
  // before anything is queued, and with the number of checks it ran.
  expect(res.status()).toBe(400);
  expect(body.error).toMatch(/nguồn/i);
  expect(body.gate!.checked).toBeGreaterThanOrEqual(6);

  // The same post with the source in the first comment goes through.
  const ok = await request.post('/api/studio/publish', {
    data: { runId: id, where: ['library'], firstComment: 'Nguồn: https://example.test/a' },
  });
  expect(ok.status(), await ok.text()).toBe(200);
});

test('a time chosen on Đăng becomes a row the calendar shows', async ({ page, request }) => {
  const made = await request.post('/api/studio/runs', {
    data: { channelId: 'demo', itemRef: 'demo:1', overrides: {} },
  });
  const { id } = (await made.json()) as { id: string };
  for (let i = 0; i < 4; i++) await request.post(`/api/studio/runs/${id}/advance`, { data: { allowSpend: true } });

  const at = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const q = await request.post('/api/studio/publish', {
    data: { runId: id, where: ['library'], at, firstComment: 'Nguồn: https://example.test/a' },
  });
  expect(q.ok(), await q.text()).toBe(true);

  await page.goto('/studio/calendar');
  await dismissTour(page);
  await expect(page.getByTestId('cal-grid')).toBeVisible();
  await expect(page.getByTestId('queue-pending')).toBeVisible();
  await expect(page.getByTestId('queue-row').first()).toContainText('Thư viện');
  await page.screenshot({ path: 'tests/shots/67-calendar.png', fullPage: true });
});

/** The reference for the calendar is our own app — Studio wraps that component, not a copy. */
test('the SPA calendar, for the pair', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Calendar' }).or(page.getByText('Calendar', { exact: true })).first().click();
  await expect(page.getByText(/2026/).first()).toBeVisible();
  await page.screenshot({ path: 'tests/shots/68-spa-calendar.png', fullPage: false });
});
