/**
 * Reusable news crawler: RSS/Atom parse + web scrape + image extraction +
 * US location detection + exact-URL & fuzzy-title dedup.
 *
 * Extracted from app/api/fetch-news/route.ts so the bronze ingestion pipeline
 * and the legacy route can share one implementation. LLM-based semantic dedup
 * is intentionally NOT here — the bronze layer stays deterministic; semantic
 * dedup/classification happens later in the silver stage (by Claude).
 */

import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import type { Article } from '@/app/types';

export interface FeedEntry {
  name: string;
  url: string;
  feedType: string;
  scrapeSelector?: string;
}

// ── Humanized request headers ────────────────────────────────────────────────
// News sites (Fox, NYT, Times of India, …) soft-block obvious bot User-Agents.
// Present as a real browser: realistic UA + Accept/Accept-Language. Pattern
// adapted from botasaurus's "humanized requests" — built here on plain fetch,
// no dependency. Exported so feed discovery hits the same sites the same way.
export const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml;q=0.8,*/*;q=0.7',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ── Fetch with bounded retry + backoff ───────────────────────────────────────
// Every external call already has a timeout; add a small retry so a transient
// blip (or a 5xx/429) on one feed doesn't silently drop it for the whole crawl
// cycle. Durable-retry principle adapted from trigger.dev, local + dependency-free.
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { retries?: number; timeoutMs?: number } = {},
): Promise<Response> {
  const { retries = 2, timeoutMs = 10000 } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      // Retry transient upstream failures; surface client errors (4xx) as-is.
      if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw lastErr;
}

// Run async work over items with bounded concurrency (best-effort per item).
export async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

const parser = new Parser({
  headers: BROWSER_HEADERS,
  customFields: {
    item: [
      ['media:content', 'media:content', { keepArray: true }],
      ['media:thumbnail', 'media:thumbnail'],
      ['content:encoded', 'content:encoded'],
    ],
  },
});

// ── US location detection (meaningful for the US market) ─────────────────────
const US_LOCATIONS: [RegExp, string][] = [
  [/\bAlabama\b/i, 'Alabama'], [/\bAlaska\b/i, 'Alaska'], [/\bArizona\b/i, 'Arizona'],
  [/\bArkansas\b/i, 'Arkansas'], [/\bCalifornia\b/i, 'California'], [/\bColorado\b/i, 'Colorado'],
  [/\bConnecticut\b/i, 'Connecticut'], [/\bDelaware\b/i, 'Delaware'], [/\bFlorida\b/i, 'Florida'],
  [/\bGeorgia\b/i, 'Georgia'], [/\bHawaii\b/i, 'Hawaii'], [/\bIdaho\b/i, 'Idaho'],
  [/\bIllinois\b/i, 'Illinois'], [/\bIndiana\b/i, 'Indiana'], [/\bIowa\b/i, 'Iowa'],
  [/\bKansas\b/i, 'Kansas'], [/\bKentucky\b/i, 'Kentucky'], [/\bLouisiana\b/i, 'Louisiana'],
  [/\bMaine\b/i, 'Maine'], [/\bMaryland\b/i, 'Maryland'], [/\bMassachusetts\b/i, 'Massachusetts'],
  [/\bMichigan\b/i, 'Michigan'], [/\bMinnesota\b/i, 'Minnesota'], [/\bMississippi\b/i, 'Mississippi'],
  [/\bMissouri\b/i, 'Missouri'], [/\bMontana\b/i, 'Montana'], [/\bNebraska\b/i, 'Nebraska'],
  [/\bNevada\b/i, 'Nevada'], [/\bNew\s+Hampshire\b/i, 'New Hampshire'], [/\bNew\s+Jersey\b/i, 'New Jersey'],
  [/\bNew\s+Mexico\b/i, 'New Mexico'], [/\bNew\s+York\b/i, 'New York'], [/\bNorth\s+Carolina\b/i, 'North Carolina'],
  [/\bNorth\s+Dakota\b/i, 'North Dakota'], [/\bOhio\b/i, 'Ohio'], [/\bOklahoma\b/i, 'Oklahoma'],
  [/\bOregon\b/i, 'Oregon'], [/\bPennsylvania\b/i, 'Pennsylvania'], [/\bRhode\s+Island\b/i, 'Rhode Island'],
  [/\bSouth\s+Carolina\b/i, 'South Carolina'], [/\bSouth\s+Dakota\b/i, 'South Dakota'], [/\bTennessee\b/i, 'Tennessee'],
  [/\bTexas\b/i, 'Texas'], [/\bUtah\b/i, 'Utah'], [/\bVermont\b/i, 'Vermont'],
  [/\bVirginia\b(?!\s+Beach)/i, 'Virginia'], [/\bVirginia\s+Beach\b/i, 'Virginia Beach'],
  [/\bWashington\s+(?:State|D\.?C\.?)\b/i, 'Washington'], [/\bWest\s+Virginia\b/i, 'West Virginia'],
  [/\bWisconsin\b/i, 'Wisconsin'], [/\bWyoming\b/i, 'Wyoming'],
];

export function detectUsLocation(title: string, description: string): string | undefined {
  const text = `${title} ${description}`;
  for (const [regex, name] of US_LOCATIONS) {
    if (regex.test(text)) return name;
  }
  return undefined;
}

// ── Image extraction ─────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDescription(item: any): string {
  return item.contentSnippet ?? item.summary ?? item.description ?? '';
}

function extractImgSrcs(html: string | undefined): string[] {
  if (!html) return [];
  const regex = /<img[^>]+src="([^"]+)"/gi;
  const srcs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) srcs.push(m[1]);
  return srcs;
}

/** Drop tracking pixels / spacers / icons that shouldn't become a card image. */
function isUsableImage(u: string): boolean {
  if (!/^https?:\/\//i.test(u)) return false;
  if (/\.svg(\?|$)/i.test(u)) return false;
  if (/(pixel|spacer|blank|1x1|tracking|beacon|avatar|logo|icon)/i.test(u)) return false;
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractImages(item: any): { imageUrl?: string; imageUrls: string[] } {
  const urls: string[] = [];
  if (item.enclosure?.url) urls.push(item.enclosure.url);

  // media:content and media:thumbnail may each be a single node or an array.
  for (const key of ['media:content', 'media:thumbnail']) {
    const media = item[key];
    const nodes = Array.isArray(media) ? media : media ? [media] : [];
    for (const n of nodes) {
      const u = n?.$?.url ?? n?.url;
      if (u) urls.push(u);
    }
  }

  const htmlContent: string | undefined = item['content:encoded'] ?? item.content ?? undefined;
  urls.push(...extractImgSrcs(htmlContent));

  // Dedupe, keep order, drop non-images.
  const seen = new Set<string>();
  const imageUrls = urls.filter((u) => isUsableImage(u) && !seen.has(u) && seen.add(u));
  return { imageUrl: imageUrls[0], imageUrls };
}

// ── Fetchers ─────────────────────────────────────────────────────────────────
async function parseFeedWithRetry(url: string, retries = 2): Promise<Awaited<ReturnType<typeof parser.parseURL>>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await Promise.race([
        parser.parseURL(url),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Feed timeout')), 15000)),
      ]);
    } catch (err) {
      lastErr = err;
      // Don't retry client errors (4xx) — a 403/404 won't change on retry, and
      // hammering a hard-blocked feed 3× per cycle is pure waste.
      if (/Status code 4\d\d/.test(String(err))) break;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw lastErr;
}

async function fetchRssFeed(feed: FeedEntry, cutoffTime: Date): Promise<{ articles: Article[]; ok: boolean }> {
  try {
    const feedData = await parseFeedWithRetry(feed.url);
    const articles: Article[] = [];
    for (const item of feedData.items ?? []) {
      const title = (item.title ?? '').trim();
      if (!title) continue;
      // An item carrying no date at all is UNKNOWN, not ancient. The old epoch-0
      // fallback made every dateless item older than any cutoff, so feeds that omit
      // per-item dates were silently dropped whole: tagesschau's Atom feed parses 77
      // migration-heavy entries and had contributed zero articles. Undated → treat as
      // current and let exact-URL dedup stop it re-entering on later runs.
      const rawDate = item.pubDate ?? item.isoDate;
      if (rawDate && new Date(rawDate).getTime() < cutoffTime.getTime()) continue;
      const pubDateStr = rawDate ?? new Date().toISOString();
      const url = item.link ?? item.guid ?? '';
      if (!url) continue;
      const { imageUrl, imageUrls } = extractImages(item);
      const description = getDescription(item);
      const location = detectUsLocation(title, description);
      articles.push({
        title, url, pubDate: pubDateStr, source: feed.name, description,
        ...(imageUrl && { imageUrl }),
        ...(imageUrls.length > 0 && { imageUrls }),
        ...(location && { location }),
      });
    }
    // ok = the feed fetched + parsed. Zero articles here means "no items in the
    // window", NOT a failure — distinct from the catch below (403/timeout/parse).
    return { articles, ok: true };
  } catch (err) {
    console.error(`[crawl] RSS "${feed.name}" failed:`, err);
    return { articles: [], ok: false };
  }
}

// ── Article body extraction (firecrawl pattern, built with cheerio) ──────────
// Web-scraped listing entries reach the LLM with an empty description — a bare
// headline — so the silver/gold stages generate Vietnamese content from almost
// nothing. Fetch the article page and pull a clean main-content excerpt.
// "URL → clean text" is firecrawl's core idea; done locally with the cheerio
// dependency already in use, best-effort (returns '' on any failure).
export async function extractArticleBody(url: string): Promise<string> {
  // A Google News RSS link is a redirect stub, not the article: fetching one answers
  // 200 but stays on news.google.com and yields 0 paragraphs (measured 2026-08-01).
  // Decoding those links is its own brittle project — skip rather than burn a fetch.
  let host: string;
  try { host = new URL(url).hostname; } catch { return ''; }
  if (/(^|\.)news\.google\.com$/i.test(host)) return '';
  try {
    const res = await fetchWithRetry(url, { headers: BROWSER_HEADERS }, { retries: 0, timeoutMs: 8000 });
    if (!res.ok) return '';
    const $ = cheerio.load(await res.text());
    $('script, style, nav, header, footer, aside, form, noscript').remove();
    // Prefer a semantic article/main container; fall back to full-body paragraphs.
    const article = $('article').first();
    const main = $('main').first();
    const scope = article.length ? article : main.length ? main : $('body');
    return scope
      .find('p')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((t) => t.length > 40)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1200);
  } catch {
    return '';
  }
}

async function fetchWebScrape(feed: FeedEntry): Promise<{ articles: Article[]; ok: boolean }> {
  try {
    const res = await fetchWithRetry(feed.url, { headers: BROWSER_HEADERS }, { timeoutMs: 10000 });
    if (!res.ok) return { articles: [], ok: false };
    const html = await res.text();
    const $ = cheerio.load(html);
    const articles: Article[] = [];
    const baseUrl = new URL(feed.url).origin;
    const selector = feed.scrapeSelector || 'a[href*="/news"], a[href*="/media"], article a, .news-item a, .listing a, h2 a, h3 a';
    $(selector).each((_, el) => {
      const $el = $(el);
      let href = $el.attr('href');
      const title = $el.text().trim();
      if (!href || !title || title.length < 15) return;
      if (href.startsWith('/')) href = `${baseUrl}${href}`;
      if (href.includes('#') || href.includes('javascript:') || href.includes('mailto:')) return;
      const location = detectUsLocation(title, '');
      articles.push({
        title, url: href, pubDate: new Date().toISOString(), source: feed.name, description: '',
        ...(location && { location }),
      });
    });
    const seen = new Set<string>();
    const scraped = articles
      .filter((a) => (seen.has(a.url) ? false : (seen.add(a.url), true)))
      .slice(0, 20);
    // Enrich title-only entries with a body excerpt so downstream LLM stages have
    // real content to work from. Bounded concurrency; failures leave description ''.
    await mapLimit(scraped, 5, async (a) => {
      if (a.description) return;
      const body = await extractArticleBody(a.url);
      if (!body) return;
      a.description = body;
      if (!a.location) {
        const loc = detectUsLocation(a.title, body);
        if (loc) a.location = loc;
      }
    });
    return { articles: scraped, ok: true };
  } catch (err) {
    console.error(`[crawl] scrape "${feed.name}" failed:`, err);
    return { articles: [], ok: false };
  }
}

// ── Dedup ────────────────────────────────────────────────────────────────────
// Only cheap, deterministic EXACT-URL dedup happens here (two crawl results
// pointing at the literal same URL). Semantic / "same-event" dedup is delegated
// to the LLM at the silver-classification stage, not hardcoded heuristics.
function dedup(articles: Article[]): Article[] {
  const seenUrls = new Set<string>();
  return articles.filter((a) => (seenUrls.has(a.url) ? false : (seenUrls.add(a.url), true)));
}

/**
 * Crawl a set of feeds for articles published since `cutoff`, deduped.
 * Returns articles + per-feed status for auditing.
 */
export async function crawlFeeds(
  feeds: FeedEntry[],
  cutoff: Date,
): Promise<{ articles: Article[]; perFeed: { name: string; status: 'ok' | 'failed'; count: number }[] }> {
  const results = await Promise.allSettled(
    feeds.map((f) => (f.feedType === 'web_scrape' ? fetchWebScrape(f) : fetchRssFeed(f, cutoff))),
  );
  const perFeed: { name: string; status: 'ok' | 'failed'; count: number }[] = [];
  const all: Article[] = [];
  results.forEach((r, i) => {
    // r.value carries { articles, ok }. ok=false is a hard fetch/parse failure
    // (403/timeout/bad feed) — distinct from a healthy feed with 0 recent items.
    if (r.status === 'fulfilled' && r.value.ok) {
      perFeed.push({ name: feeds[i].name, status: 'ok', count: r.value.articles.length });
      all.push(...r.value.articles);
    } else {
      perFeed.push({ name: feeds[i].name, status: 'failed', count: 0 });
    }
  });
  return { articles: dedup(all), perFeed };
}
