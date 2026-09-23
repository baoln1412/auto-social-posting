/**
 * A feed as a source, so a pasted feed can be fetch-tested before it is saved.
 *
 * `crawlFeeds()` is called rather than a second parser: it already owns the browser headers
 * that keep news sites from soft-blocking us, the public-DNS dispatcher, the retry that does
 * not hammer a 403, and the rss / web_scrape / news_sitemap split. A feed that passes this
 * test passes because the thing that will crawl it every four hours fetched it.
 */
import { crawlFeeds } from '@/app/lib/crawl';
import type { SourceItem } from '../steps/types';

/** How far back the test looks. A healthy feed with nothing new today is still healthy. */
const LOOKBACK_DAYS = 30;

export function feedItem(a: {
  title: string;
  url: string;
  source: string;
  description?: string;
}): SourceItem {
  return {
    id: `url:${a.url}`,
    title: a.title || '(không tiêu đề)',
    text: a.description ?? '',
    url: a.url,
    source: a.source || undefined,
    // A feed item has no comment pool; the reel's scenes come from the draft.
    comments: [],
  };
}

export async function listRss(
  url: string,
  limit: number,
  feedType = 'rss',
  name = 'Nguồn thử',
): Promise<SourceItem[]> {
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const { articles, perFeed } = await crawlFeeds([{ name, url, feedType }], cutoff);
  // ok=false is a hard fetch or parse failure, which is different from a healthy feed with
  // nothing recent — and the difference is exactly what the owner needs told.
  if (perFeed[0]?.status === 'failed') {
    throw new Error('Không lấy được nội dung — kiểm tra đường dẫn, hoặc trang có chặn bot.');
  }
  return articles.slice(0, limit).map(feedItem);
}
