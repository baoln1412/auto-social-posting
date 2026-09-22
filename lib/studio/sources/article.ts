/**
 * One article URL. The body comes from `extractArticleBody` in app/lib/crawl.ts — the
 * extractor the pipeline already uses, imported rather than reimplemented.
 */
import * as cheerio from 'cheerio';
import { BROWSER_HEADERS, extractArticleBody } from '@/app/lib/crawl';
import { canonicalUrl } from '@/app/lib/lake';
import type { SourceItem } from '../steps/types';

export function articleToItem(url: string, title: string, body: string): SourceItem {
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {
    /* keep the raw string */
  }
  return {
    id: `url:${canonicalUrl(url)}`,
    title: title.trim() || host,
    text: body,
    url,
    source: host,
    comments: [],
  };
}

/** og:title, else <title>. Best-effort: a missing title falls back to the host. */
async function fetchTitle(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return '';
    const $ = cheerio.load(await res.text());
    return ($('meta[property="og:title"]').attr('content') ?? $('title').text() ?? '').trim();
  } catch {
    return '';
  }
}

export async function listArticle(url: string): Promise<SourceItem[]> {
  // ponytail: two round trips to the same page — extractArticleBody returns the body only,
  // and copying its 30 lines to steal the title in one pass is the thing the plan forbids.
  // Collapse it by exporting a body+title extractor from crawl.ts if this ever matters.
  const [body, title] = await Promise.all([extractArticleBody(url), fetchTitle(url)]);
  if (!body) throw new Error('Không đọc được nội dung bài viết từ đường dẫn này.');
  return [articleToItem(url, title, body)];
}
