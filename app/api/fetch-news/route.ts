import { NextRequest, NextResponse } from 'next/server';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { Article } from '@/app/types';
import { getSupabaseServer } from '@/app/lib/supabase';
import { generateContent } from '@/app/api/pipeline/gemini-client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const maxDuration = 300;

const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'media:content', { keepArray: true }],
      ['media:thumbnail', 'media:thumbnail'],
      ['content:encoded', 'content:encoded'],
    ],
  },
});

interface FeedEntry {
  name: string;
  url: string;
  feedType: string;
  scrapeSelector?: string;
}

// ── Load feeds for a specific page ──────────────────────────────────────
async function loadFeeds(pageId: string): Promise<FeedEntry[]> {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from('rss_feeds')
      .select('name, url, feed_type, scrape_selector')
      .eq('page_id', pageId)
      .eq('enabled', true)
      .order('name');

    if (error) throw error;
    if (!data || data.length === 0) return [];

    return data.map((row) => ({
      name: row.name,
      url: row.url,
      feedType: row.feed_type,
      scrapeSelector: row.scrape_selector,
    }));
  } catch (err) {
    console.warn('[fetch-news] Failed to load feeds:', err);
    return [];
  }
}

// ── Get last fetch time for a page ──────────────────────────────────────
async function getLastFetchTime(pageId: string): Promise<Date | null> {
  try {
    const supabase = getSupabaseServer();
    const { data } = await supabase
      .from('content_pages')
      .select('last_fetch_time')
      .eq('id', pageId)
      .single();

    if (data?.last_fetch_time) {
      return new Date(data.last_fetch_time);
    }
  } catch (err) {
    console.warn('[fetch-news] Failed to get last fetch time:', err);
  }
  return null;
}

// ── Fuzzy title deduplication ────────────────────────────────────────────

function normalizeTitle(title: string): string {
  const STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'has', 'have', 'had', 'it', 'its', 'that', 'this', 'as', 'not', 'no',
    'he', 'she', 'his', 'her', 'they', 'their', 'who', 'what', 'when',
    'where', 'how', 'after', 'before', 'into', 'over', 'about', 'up',
  ]);
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    .join(' ');
}

function trigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i <= s.length - 3; i++) {
    set.add(s.slice(i, i + 3));
  }
  return set;
}

function trigramSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  return (2 * intersection) / (a.size + b.size);
}

const SIMILARITY_THRESHOLD = 0.55;

function fuzzyDedup(articles: Article[]): Article[] {
  const kept: Article[] = [];
  const keptNorms: { norm: string; tri: Set<string>; index: number }[] = [];

  for (const article of articles) {
    const norm = normalizeTitle(article.title);
    const tri = trigrams(norm);

    let isDuplicate = false;
    for (const existing of keptNorms) {
      const sim = trigramSimilarity(tri, existing.tri);
      if (sim >= SIMILARITY_THRESHOLD) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      keptNorms.push({ norm, tri, index: kept.length });
      kept.push(article);
    }
  }

  return kept;
}

// ── LLM Semantic deduplication ───────────────────────────────────────────
async function llmSemanticDedup(articles: Article[]): Promise<Article[]> {
  if (articles.length === 0) return [];

  const batch = articles.slice(0, 40);
  const payloadStr = JSON.stringify(batch.map((a, idx) => ({
    id: idx,
    title: a.title,
    description: a.description
  })));

  const systemPrompt = `You are a news deduplicator. I will provide a list of JSON objects representing news articles with 'id', 'title', and 'description'.
Your job is to identify articles reporting on the EXACT SAME EVENT.
For each group of duplicates, pick exactly ONE article ID to keep (prefer the one with the most detailed title/description).
If an article is unique, keep its ID.
Return strictly a JSON object: { "uniqueIds": [0, 2, 5] }`;

  try {
    const rawResponse = await generateContent(systemPrompt, payloadStr);
    const jsonStr = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(jsonStr);

    if (result.uniqueIds && Array.isArray(result.uniqueIds)) {
      const uniqueIds = new Set(result.uniqueIds);
      const kept = batch.filter((_, idx) => uniqueIds.has(idx));
      console.log(`[fetch-news] LLM Dedup: In=${batch.length}, Out=${kept.length}`);
      const remaining = articles.slice(40);
      return [...kept, ...remaining];
    }
  } catch (err) {
    console.error('[fetch-news] LLM dedup failed, using input list:', err);
  }

  return articles;
}

// ── Constants ─────────────────────────────────────────────────────────────
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const MAX_ARTICLES = 30;
const IMG_SRC_REGEX_PATTERN = '<img[^>]+src="([^"]+)"';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDescription(item: any): string {
  return item.contentSnippet ?? item.summary ?? item.description ?? '';
}

function extractImgSrcs(html: string | undefined): string[] {
  if (!html) return [];
  const regex = new RegExp(IMG_SRC_REGEX_PATTERN, 'gi');
  const srcs: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    srcs.push(match[1]);
  }
  return srcs;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractImages(item: any): { imageUrl?: string; portraitUrl?: string } {
  const enclosureUrl: string | undefined = item.enclosure?.url;

  let mediaContentUrl: string | undefined;
  const mediaContent = item['media:content'];
  if (Array.isArray(mediaContent) && mediaContent.length > 0) {
    mediaContentUrl = mediaContent[0]?.$.url ?? mediaContent[0]?.url;
  } else if (mediaContent) {
    mediaContentUrl = mediaContent?.$.url ?? mediaContent?.url;
  }

  const htmlContent: string | undefined =
    item['content:encoded'] ?? item.content ?? undefined;
  const imgSrcs = extractImgSrcs(htmlContent);

  const imageUrl: string | undefined =
    enclosureUrl ?? mediaContentUrl ?? imgSrcs[0] ?? undefined;

  let portraitUrl: string | undefined;
  for (const src of imgSrcs) {
    if (src !== imageUrl) {
      portraitUrl = src;
      break;
    }
  }

  return { imageUrl, portraitUrl };
}

// ── Fetch RSS/Atom feed ──────────────────────────────────────────────────
async function fetchRssFeed(feed: FeedEntry, cutoffTime: Date): Promise<Article[]> {
  try {
    const feedData = await Promise.race([
      parser.parseURL(feed.url),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Feed timeout')), 8000)),
    ]);

    const articles: Article[] = [];

    for (const item of feedData.items ?? []) {
      const title = (item.title ?? '').trim();
      if (!title) continue;

      const pubDateStr = item.pubDate ?? item.isoDate ?? new Date(0).toISOString();
      const pubDateMs = new Date(pubDateStr).getTime();

      // Only get articles published AFTER the cutoff time
      if (pubDateMs < cutoffTime.getTime()) continue;

      const url = item.link ?? item.guid ?? '';
      if (!url) continue;

      const { imageUrl, portraitUrl } = extractImages(item);

      articles.push({
        title,
        url,
        pubDate: pubDateStr,
        source: feed.name,
        description: getDescription(item),
        ...(imageUrl && { imageUrl }),
        ...(portraitUrl && { portraitUrl }),
      });
    }

    return articles;
  } catch (err) {
    console.error(`[fetch-news] Failed to fetch RSS "${feed.name}":`, err);
    return [];
  }
}

// ── Web scrape fallback ──────────────────────────────────────────────────
async function fetchWebScrape(feed: FeedEntry): Promise<Article[]> {
  try {
    const res = await Promise.race([
      fetch(feed.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AutoSocialBot/1.0)' },
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Scrape timeout')), 10000)),
    ]);

    if (!res.ok) {
      console.warn(`[fetch-news] Scrape "${feed.name}" returned ${res.status}`);
      return [];
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const articles: Article[] = [];
    const baseUrl = new URL(feed.url).origin;

    // Use custom selector or auto-detect common patterns
    const selector = feed.scrapeSelector || 'a[href*="/news"], a[href*="/media"], article a, .news-item a, .listing a, h2 a, h3 a';

    $(selector).each((_, el) => {
      const $el = $(el);
      let href = $el.attr('href');
      const title = $el.text().trim();

      if (!href || !title || title.length < 15) return;

      // Resolve relative URLs
      if (href.startsWith('/')) href = `${baseUrl}${href}`;

      // Skip non-article links
      if (href.includes('#') || href.includes('javascript:') || href.includes('mailto:')) return;

      articles.push({
        title,
        url: href,
        pubDate: new Date().toISOString(),
        source: feed.name,
        description: '',
      });
    });

    // Dedup by URL within this source
    const seen = new Set<string>();
    const unique = articles.filter((a) => {
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    });

    console.log(`[fetch-news] Scraped ${unique.length} articles from "${feed.name}"`);
    return unique.slice(0, 20); // Cap per source
  } catch (err) {
    console.error(`[fetch-news] Failed to scrape "${feed.name}":`, err);
    return [];
  }
}

// ── Main route ───────────────────────────────────────────────────────────
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const pageId = searchParams.get('pageId');
  const forceRefresh = searchParams.get('force') === 'true';

  if (!pageId) {
    return NextResponse.json({ articles: [], error: 'pageId is required' }, { status: 400 });
  }

  const feeds = await loadFeeds(pageId);

  if (feeds.length === 0) {
    return NextResponse.json({ articles: [], message: 'No feeds configured for this page' });
  }

  // Determine cutoff time: use last_fetch_time if available (incremental), else 24h ago
  let cutoffTime: Date;
  if (!forceRefresh) {
    const lastFetch = await getLastFetchTime(pageId);
    if (lastFetch) {
      cutoffTime = lastFetch;
      console.log(`[fetch-news] Incremental fetch: articles after ${lastFetch.toISOString()}`);
    } else {
      cutoffTime = new Date(Date.now() - TWENTY_FOUR_HOURS_MS);
      console.log(`[fetch-news] First fetch: articles from last 24 hours`);
    }
  } else {
    cutoffTime = new Date(Date.now() - TWENTY_FOUR_HOURS_MS);
    console.log(`[fetch-news] Force refresh: articles from last 24 hours`);
  }

  // Fetch all feeds concurrently
  const results = await Promise.allSettled(
    feeds.map((feed) => {
      if (feed.feedType === 'web_scrape') {
        return fetchWebScrape(feed);
      }
      return fetchRssFeed(feed, cutoffTime);
    })
  );

  let allArticles: Article[] = [];
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    allArticles.push(...result.value);
  }

  // Deduplicate by exact URL
  const seenUrls = new Set<string>();
  const urlDeduped = allArticles.filter((article) => {
    if (seenUrls.has(article.url)) return false;
    seenUrls.add(article.url);
    return true;
  });

  // Fuzzy title dedup
  let deduped = fuzzyDedup(urlDeduped);

  // Semantic LLM dedup
  deduped = await llmSemanticDedup(deduped);

  // Sort by pubDate descending
  deduped.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  const articles = deduped.slice(0, MAX_ARTICLES);

  console.log(`[fetch-news] ${urlDeduped.length} after URL dedup → ${articles.length} returned`);
  return NextResponse.json({ articles });
}
