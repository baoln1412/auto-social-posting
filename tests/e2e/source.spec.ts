import { test, expect } from '@playwright/test';
import { dismissTour } from './fixtures';

/**
 * Complaint A, end to end: a gold channel is built on the lake, and v1 read the paste box
 * only when the channel's own source declared `needs: 'url'`. So on this channel a pasted
 * link or a typed paragraph was dropped and the first listed gold row was used instead —
 * with nothing on screen to say so.
 */
const MARKET = 'c7469ff0-5bae-495a-befd-8c2539c4ff31';

async function goldChannel(request: import('@playwright/test').APIRequestContext) {
  const res = await request.post('/api/studio/channels', {
    data: {
      name: `Gold paste ${Date.now()}`,
      kind: 'gold',
      config: { marketId: MARKET },
      kitId: 'demo',
      makes: ['post'],
    },
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

test('the New page is two doors, and the box says what it read', async ({ page }) => {
  await page.goto('/studio');
  await dismissTour(page);

  await expect(page.getByTestId('door-auto')).toBeVisible();
  await expect(page.getByTestId('door-single')).toBeVisible();
  await expect(page.getByTestId('pipeline-state')).not.toHaveText('…');

  // Empty box: the channel decides, and the line says so rather than leaving it a mystery.
  await expect(page.getByTestId('detected')).toContainText('theo kênh');

  await page.getByTestId('source-box').fill('https://www.reddit.com/r/AskReddit/comments/x/y/');
  await expect(page.getByTestId('detected')).toHaveText('nguồn: Reddit');

  await page.getByTestId('source-box').fill('https://www.instagram.com/p/abc/');
  await expect(page.getByTestId('detected')).toHaveText('nguồn: Instagram');

  await page.getByTestId('source-box').fill('Hôm nay tôi muốn kể một chuyện.');
  await expect(page.getByTestId('detected')).toHaveText('nguồn: Tự viết');

  await page.screenshot({ path: 'tests/shots/80-two-doors.png', fullPage: true });
});

test('a paragraph typed on a gold channel becomes the item, not the first gold row', async ({
  page,
  request,
}) => {
  const channelId = await goldChannel(request);
  const words = 'Một người Việt ở Texas vừa kể lại chuyện xin thẻ xanh mất bảy năm.';

  const run = await request.post('/api/studio/runs', {
    data: { channelId, itemRef: words },
  });
  const { id: runId } = (await run.json()) as { id: string };

  await page.goto(`/studio/runs/${runId}`);
  await dismissTour(page);

  // The header names the source this run reads — the decision v1 made in silence.
  await expect(page.locator('header')).toContainText('Tự viết');
  await expect(page.getByTestId('preview-items')).toContainText('Một người Việt ở Texas');

  await page.getByTestId('continue-fetch').click();
  await expect(page.getByTestId('step-fetch')).toHaveAttribute('data-state', 'done');
  await expect(page.getByTestId('step-fetch')).toContainText('Một người Việt ở Texas');
  await page.screenshot({ path: 'tests/shots/81-paste-wins.png', fullPage: true });
});

test('a Reddit link on a gold channel goes to Reddit', async ({ page, request }) => {
  const channelId = await goldChannel(request);
  const run = await request.post('/api/studio/runs', {
    data: { channelId, itemRef: 'https://www.reddit.com/r/vietnam/comments/1abcdef/a_post/' },
  });
  const { id: runId } = (await run.json()) as { id: string };

  await page.goto(`/studio/runs/${runId}`);
  await dismissTour(page);

  // Reddit either answers or refuses; either way this run is reading Reddit and says so, and
  // the one thing it must never do is quietly show a gold headline.
  await expect(page.locator('header')).toContainText('Reddit');
  await expect(page.getByTestId('step-fetch')).toContainText('Reddit');
  await page.screenshot({ path: 'tests/shots/82-link-beats-channel.png', fullPage: true });
});

test('a long paste is kept beside the run, not stuffed into the ref', async ({ page, request }) => {
  const channelId = await goldChannel(request);
  const long = `Đoạn mở đầu của bài dài. ${'Một câu nữa để cho nó dài ra. '.repeat(40)}`;
  const run = await request.post('/api/studio/runs', { data: { channelId, itemRef: long } });
  const { id: runId } = (await run.json()) as { id: string };

  await page.goto(`/studio/runs/${runId}`);
  await dismissTour(page);

  // The ref stays a short text:<sha>; the words live in their own row. saveRunText was
  // written in slice 1 and never called, so item_ref used to hold the whole article.
  await expect(page.getByTestId('cost-fetch')).toContainText(/text:[0-9a-f]{12}/);
  await expect(page.getByTestId('preview-items')).toContainText('Đoạn mở đầu của bài dài.');
});
