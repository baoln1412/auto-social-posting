import { test, expect } from '@playwright/test';
import { dismissTour } from './fixtures';

/**
 * Door 1: the crawler this repo already runs, given the step-by-step setup the reference
 * gives a single video.
 *
 * The trap this slice is built against: a second copy of the configuration. The feeds live
 * in rss_feeds and go through /api/feeds; the market's prompt lives on its content_pages row
 * and goes through /api/pages. Studio edits those in place, so there is nothing to drift.
 */
const MARKET = 'c7469ff0-5bae-495a-befd-8c2539c4ff31';

/**
 * content_pages.user_prompt is a production row, and saving the setup writes Studio's block
 * into it — which is the feature. A test must not leave that behind: whatever this file
 * finds at the start is what it puts back at the end.
 */
let originalPrompt = '';

test.beforeAll(async ({ request }) => {
  const { pages } = (await (await request.get('/api/pages')).json()) as {
    pages: { id: string; userPrompt: string }[];
  };
  originalPrompt = pages.find((p) => p.id === MARKET)?.userPrompt ?? '';
});

test.afterAll(async ({ request }) => {
  await request.patch('/api/pages', { data: { id: MARKET, userPrompt: originalPrompt } });
});

test('the five screens, and the gate that will not let an empty one past', async ({ page }) => {
  await page.goto(`/studio/pipeline/${MARKET}`);
  await dismissTour(page);

  await expect(page.getByTestId('prail')).toBeVisible();
  await expect(page.getByTestId('prail-0')).toHaveAttribute('data-state', 'current');

  // 1 · Nguồn — the market's real feeds, with the weight this setup gives each one.
  await expect(page.getByTestId('feed-row').first()).toBeVisible();
  await expect(page.getByTestId('pipeline-gate')).toContainText('đạt');
  await page.screenshot({ path: 'tests/shots/a0-pipeline-sources.png', fullPage: true });

  await page.getByTestId('pipeline-next').click();

  // 2 · Lọc & xếp — the last crawl, reordered live,each row showing its arithmetic.
  await expect(page.getByTestId('queue-row').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('queue-parts').first()).toContainText('chủ đề');
  const first = await page.getByTestId('queue-row').first().textContent();

  // Relative, not absolute: this market's setup is persisted and other tests in this file
  // edit it, so "labor is on" is only true until another test runs first.
  const topic = page.getByTestId('ord-topic-labor');
  const was = await topic.getAttribute('aria-pressed');
  await topic.click();
  await expect(topic).toHaveAttribute('aria-pressed', was === 'true' ? 'false' : 'true');

  // Boosting a topic reorders; it never removes.
  const before = await page.getByTestId('queue-row').count();
  await page.waitForTimeout(1_200);
  expect(await page.getByTestId('queue-row').count()).toBe(before);
  await page.screenshot({ path: 'tests/shots/a1-pipeline-order.png', fullPage: true });
  expect(first).toBeTruthy();

  await page.getByTestId('pipeline-next').click();

  // 3 · Đầu ra — the shape, and the two rules that are shown but never offered as a switch.
  await expect(page.getByTestId('out-format-tin-ngan')).toBeVisible();
  await page.getByTestId('out-format-danh-sach').click();
  await page.getByTestId('out-prompt-toggle').click();
  await expect(page.getByTestId('out-prompt')).toContainText('Theo <tên nguồn>');
  await expect(page.getByTestId('out-prompt')).toContainText('🔹');
  // Nothing has been drafted yet, so this screen has run no check at all — and a check that
  // never ran is not a pass.
  await expect(page.getByTestId('pipeline-gate')).toContainText('chưa kiểm tra');
  await expect(page.getByTestId('pipeline-next')).toBeDisabled();
  await page.screenshot({ path: 'tests/shots/a2-pipeline-output.png', fullPage: true });
});

test('a feed added in Studio is the same row the old Settings panel reads', async ({
  page,
  request,
}) => {
  // rss_feeds is the production Supabase table — the point of the test. Named and deleted
  // so a crawl that fires mid-test logs one unreachable host and nothing survives.
  const url = `https://example.invalid/studio-${Date.now()}.xml`;

  // Straight through /api/feeds — the route the old SourceManager posts to. No Studio table
  // holds a copy, so there is no second version of this feed to fall out of step.
  const add = await request.post('/api/feeds', {
    data: { pageId: MARKET, name: 'Nguồn thử Studio', url, feedType: 'rss' },
  });
  expect(add.status()).toBe(201);
  const id = ((await add.json()) as { feed: { id: string } }).feed.id;

  try {
    await page.goto(`/studio/pipeline/${MARKET}`);
    await dismissTour(page);
    await expect(page.getByTestId('feed-list')).toContainText('Nguồn thử Studio');

    // Turned off in Studio…
    await page.getByTestId(`feed-on-${id}`).uncheck();
    await expect.poll(async () => {
      const r = await request.get(`/api/feeds?pageId=${MARKET}`);
      const { feeds } = (await r.json()) as { feeds: { id: string; enabled: boolean }[] };
      return feeds.find((f) => f.id === id)?.enabled;
    }).toBe(false);
  } finally {
    await request.delete(`/api/feeds?id=${id}`);
  }
});

test('a pasted source is fetch-tested before it can be saved', async ({ page }) => {
  await page.goto(`/studio/pipeline/${MARKET}`);
  await dismissTour(page);

  // Nothing pasted: neither button is live.
  await expect(page.getByTestId('src-test')).toBeDisabled();
  await expect(page.getByTestId('src-save')).toBeDisabled();

  // A subreddit already publishes RSS, so it needs no adapter of its own.
  await page.getByTestId('src-paste').fill('https://www.reddit.com/r/vietnam');
  await expect(page.getByTestId('src-detected')).toContainText('RSS tin');
  await expect(page.getByTestId('src-save')).toBeDisabled();

  // Facebook is listed with its reason, not hidden — and cannot be saved.
  await page.getByTestId('src-paste').fill('https://www.facebook.com/someone/posts/1');
  await expect(page.getByTestId('src-detected')).toContainText('Facebook');
  await page.getByTestId('src-test').click();
  await expect(page.getByTestId('src-error')).toContainText('chưa nối');
  await expect(page.getByTestId('src-save')).toBeDisabled();

  // One that cannot fetch stays unsavable.
  await page.getByTestId('src-paste').fill('https://nothing.invalid/feed.xml');
  await page.getByTestId('src-test').click();
  await expect(page.getByTestId('src-error')).toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId('src-save')).toBeDisabled();
  await page.screenshot({ path: 'tests/shots/a3-pipeline-add-source.png', fullPage: true });
});

test('the setup saves, bumps its revision and comes back', async ({ page, request }) => {
  const read = async () =>
    (await (await request.get(`/api/studio/pipeline/${MARKET}`)).json()) as {
      revision: number;
      config: { order: { topics: string[] } };
    };
  const before = await read();

  await page.goto(`/studio/pipeline/${MARKET}`);
  await dismissTour(page);
  await page.getByTestId('pipeline-next').click();

  // Whichever topic this market is not currently boosting — the stored setup is shared
  // state, so naming one outright would pass or fail on test order.
  const topic = page.getByTestId('ord-topic-education');
  const on = (await topic.getAttribute('aria-pressed')) === 'true';
  await topic.click();
  await page.getByTestId('pipeline-save').click();

  await expect.poll(async () => (await read()).revision).toBeGreaterThan(before.revision);
  const after = await read();
  expect(after.config.order.topics.includes('education')).toBe(!on);
});

test('the schedule is read off the plist, and an unchecked shape cannot be scheduled', async ({
  page,
}) => {
  await page.goto(`/studio/pipeline/${MARKET}`);
  await dismissTour(page);

  await page.getByTestId('prail-3').click();
  await expect(page.getByTestId('media-kit')).toBeVisible();
  await page.screenshot({ path: 'tests/shots/a3b-pipeline-media.png', fullPage: true });

  await page.getByTestId('prail-4').click();

  // Not a remembered cadence: the times come out of the plist launchd actually loads.
  await expect(page.getByTestId('pipeline-schedule')).toContainText(/\d{2}:\d{2}/);

  // Nobody has drafted three posts in this session, so the shape is unchecked — and the
  // button that would set the crawler loose on it is the one that says so.
  await expect(page.getByTestId('pipeline-run-now')).toBeDisabled();
  await expect(page.getByTestId('run-blocked')).toContainText('chưa viết thử ba bài');
  await page.screenshot({ path: 'tests/shots/a4-pipeline-schedule.png', fullPage: true });
});

test('the market list says which markets have been set up', async ({ page }) => {
  await page.goto('/studio/pipeline');
  await dismissTour(page);
  await expect(page.getByTestId('market-row').first()).toBeVisible();
  await page.screenshot({ path: 'tests/shots/a5-pipeline-markets.png', fullPage: true });
});

test('saving the output shape writes it where the pipeline will read it', async ({ page, request }) => {
  // content_pages.user_prompt is the production row the 4-hourly run reads, so this restores
  // exactly what it found. The block markers are what make that safe: Studio owns what is
  // between them and never touches the rest.
  const readPrompt = async () => {
    const r = await request.get('/api/pages');
    const { pages } = (await r.json()) as { pages: { id: string; userPrompt: string }[] };
    return pages.find((p) => p.id === MARKET)?.userPrompt ?? '';
  };
  const original = await readPrompt();

  try {
    await page.goto(`/studio/pipeline/${MARKET}`);
    await dismissTour(page);
    await page.getByTestId('prail-2').click();
    await page.getByTestId('out-format-hoi-dap').click();
    await expect(page.getByTestId('out-format-hoi-dap')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('out-prompt-toggle').click();
    await expect(page.getByTestId('out-prompt')).toContainText('hỏi–đáp');
    await page.getByTestId('pipeline-save').click();

    // Poll the CONTENT, not the marker: a click returns when it dispatches, not when its
    // PATCH lands, and an earlier test in this file has already put a block here — so
    // waiting for the marker would pass instantly against somebody else's write.
    await expect.poll(readPrompt, { timeout: 15_000 }).toContain('hỏi–đáp');
    const after = await readPrompt();
    // The owner's own lines are still there, character for character.
    const own = original.replace(/<!-- studio:output -->[\s\S]*?<!-- \/studio:output -->/, '').trim();
    if (own) expect(after).toContain(own);
  } finally {
    await request.patch('/api/pages', { data: { id: MARKET, userPrompt: original } });
  }
});
