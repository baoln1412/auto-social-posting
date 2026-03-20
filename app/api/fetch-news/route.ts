import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
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

// ── Feed registry type ──────────────────────────────────────────────────
interface FeedEntry {
  name: string;
  url: string;
}

// ── Hardcoded fallback feeds (used if Supabase query fails) ─────────────
const FALLBACK_FEEDS: FeedEntry[] = [
  { name: 'VNExpress', url: 'https://vnexpress.net/rss/the-thao.rss' },
  { name: 'The Thao 247', url: 'https://thethao247.vn/trang-chu.rss' },
  { name: 'Vietnamnet', url: 'https://vietnamnet.vn/rss/the-thao.rss' },
  { name: 'Znews', url: 'https://znews.vn/the-thao.rss' },
  { name: 'Thanh Nien', url: 'https://thanhnien.vn/rss/the-thao.rss' },
  { name: 'The Thao Van Hoa', url: 'https://thethaovanhoa.vn/the-thao.rss' }
];

/** Load enabled feeds from Supabase, fall back to hardcoded list on error. */
async function loadFeeds(): Promise<FeedEntry[]> {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from('rss_feeds')
      .select('name, url')
      .eq('enabled', true)
      .order('name');

    if (error) throw error;
    if (!data || data.length === 0) return FALLBACK_FEEDS;

    return data.map((row) => ({
      name: row.name,
      url: row.url
    }));
  } catch (err) {
    console.warn('[fetch-news] Failed to load feeds from Supabase, using fallback:', err);
    return FALLBACK_FEEDS;
  }
}

// ── Sports keyword filter ─────────────────────────────────────────────────
const SPORTS_KEYWORDS: string[] = [
  'bóng đá', 'football', 'soccer', 'ngoại hạng', 'v-league', 'vleague', 'đội tuyển',
  'huấn luyện viên', 'cầu thủ', 'chuyển nhượng', 'bàn thắng', 'trận đấu', 'giải đấu',
  'fifa', 'uefa', 'champions league', 'cúp c1', 'world cup', 'euro', 'copa',
  'm.u', 'man utd', 'real madrid', 'barcelona', 'arsenal', 'chelsea', 'liverpool',
  'thắng', 'hòa', 'thua', 'vô địch', 'đá chính', 'dự bị'
];

// ── Exclude filter ──────────────────────────────
const EXCLUDE_KEYWORDS: string[] = [
  'chứng khoán', 'bất động sản', 'pháp luật', 'hình sự', 'chính trị', 'tai nạn',
  'án mạng', 'khởi tố', 'tham nhũng', 'thị trường', 'kinh tế'
];

// ── Not needed for sports generally, but keeping structure ──────────────────────────────────────
const POLITICAL_KEYWORDS: string[] = [
  'bầu cử', 'quốc hội', 'đảng', 'chính phủ', 'thủ tướng', 'chủ tịch', 'bộ trưởng'
];

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SPORTS_REGEX = new RegExp(SPORTS_KEYWORDS.map(escapeRegExp).join('|'), 'i');
const EXCLUDE_REGEX = new RegExp(EXCLUDE_KEYWORDS.map(escapeRegExp).join('|'), 'i');
const POLITICAL_REGEX = new RegExp(POLITICAL_KEYWORDS.map(escapeRegExp).join('|'), 'i');

function isSportsArticle(article: Article): boolean {
  const text = `${article.title} ${article.description}`;
  if (EXCLUDE_REGEX.test(text)) return false;
  if (POLITICAL_REGEX.test(text)) return false;

  // STRICTLY require soccer/football keywords
  if (!SPORTS_REGEX.test(text)) return false;

  return true;
}

// ── Fuzzy title deduplication ────────────────────────────────────────────

/** Normalize a title for comparison: lowercase, strip punctuation, remove stop words. */
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

/** Generate trigram set from a string. */
function trigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i <= s.length - 3; i++) {
    set.add(s.slice(i, i + 3));
  }
  return set;
}

/** Dice coefficient similarity between two trigram sets. Returns 0-1. */
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

// Crime-specific sources are preferred (higher priority kept in dedup)
const SOURCE_PRIORITY: Record<string, number> = {};

/** Fuzzy-dedup articles by title similarity. Keeps the higher-priority source. */
function fuzzyDedup(articles: Article[], feeds: FeedEntry[]): Article[] {
  // Priority is mostly the same now, just pick any
  for (const feed of feeds) {
    SOURCE_PRIORITY[feed.name] = 1;
  }

  const kept: Article[] = [];
  const keptNorms: { norm: string; tri: Set<string>; index: number }[] = [];

  for (const article of articles) {
    const norm = normalizeTitle(article.title);
    const tri = trigrams(norm);

    let isDuplicate = false;
    for (const existing of keptNorms) {
      const sim = trigramSimilarity(tri, existing.tri);
      if (sim >= SIMILARITY_THRESHOLD) {
        // Keep the one from the higher-priority source
        const existingPriority = SOURCE_PRIORITY[kept[existing.index].source] ?? 1;
        const newPriority = SOURCE_PRIORITY[article.source] ?? 1;
        if (newPriority > existingPriority) {
          // Replace existing with new (higher-priority source)
          kept[existing.index] = article;
          existing.norm = norm;
          existing.tri = tri;
        }
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

  // To avoid exceeding context or processing time, process max 40 articles at once
  const batch = articles.slice(0, 40);

  const payloadStr = JSON.stringify(batch.map((a, idx) => ({
    id: idx,
    title: a.title,
    description: a.description
  })));

  const systemPrompt = `You are an expert sports news deduplicator. I will provide a list of JSON objects representing news articles with 'id', 'title', and 'description'.
Your job is to identify articles that are reporting on the EXACT SAME MATCH OR EVENT.
To do this effectively, compare:
1. The participating teams in the match
2. The match time, date, or round
3. The prominent players or managers mentioned

If multiple articles cover the same event (e.g. two articles talking about the same "Man Utd vs Liverpool" match that just happened), they are duplicates.
For each group of duplicates, pick exactly ONE article ID to keep (prefer the one with the most detailed title/description).
If an article is completely unique (no other article covers the same event), keep its ID.

Return strictly a JSON object containing a 'uniqueIds' array of integers (the IDs of the articles we should keep). Do not output any markdown formatting, just raw JSON.
Example format:
{ "uniqueIds": [0, 2, 5] }`;

  try {
    const rawResponse = await generateContent(systemPrompt, payloadStr);

    // Clean up potential markdown formatting before parsing
    const jsonStr = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(jsonStr);

    if (result.uniqueIds && Array.isArray(result.uniqueIds)) {
      const uniqueIds = new Set(result.uniqueIds);
      const kept = batch.filter((_, idx) => uniqueIds.has(idx)).map(a => a);
      console.log(`[fetch-news] LLM Dedup: In= ${batch.length}, Out= ${kept.length}`);

      const remaining = articles.slice(40);
      return [...kept, ...remaining];
    }
  } catch (err) {
    console.error('[fetch-news] LLM dedup failed. Falling back to input list.', err);
  }

  return articles;
}

// ── Constants ─────────────────────────────────────────────────────────────
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_ARTICLES = 20;
const MAX_ARTICLES = 30;
const IMG_SRC_REGEX_PATTERN = '<img[^>]+src="([^"]+)"';

/** Extract description from item, falling back through multiple fields. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDescription(item: any): string {
  return item.contentSnippet ?? item.summary ?? item.description ?? '';
}

/** Extract all <img src="..."> values from an HTML string. */
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchFeed(feed: FeedEntry, filterByDate: boolean = true): Promise<{ articles: Article[] }> {
  const feedData = await Promise.race([
    parser.parseURL(feed.url),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Feed timeout')), 8000)),
  ]);
  const now = Date.now();
  const articles: Article[] = [];

  for (const item of feedData.items ?? []) {
    const title = (item.title ?? '').trim();
    if (!title) continue;

    const pubDateStr: string =
      item.pubDate ?? item.isoDate ?? new Date(0).toISOString();
    const pubDateMs = new Date(pubDateStr).getTime();

    if (filterByDate) {
      const isRecent = now - pubDateMs <= SEVEN_DAYS_MS;
      if (!isRecent) continue;
    }

    const url: string = item.link ?? item.guid ?? '';
    if (!url) continue;

    const { imageUrl, portraitUrl } = extractImages(item);

    articles.push({
      title,
      url,
      pubDate: pubDateStr,
      source: feed.name,
      description: getDescription(item),
      ...(imageUrl !== undefined && { imageUrl }),
      ...(portraitUrl !== undefined && { portraitUrl }),
    });
  }

  return { articles };
}

export async function GET(): Promise<NextResponse> {
  // Load feeds from Supabase (falls back to hardcoded list)
  const feeds = await loadFeeds();

  // Fetch all feeds concurrently, tolerating individual failures
  const results = await Promise.allSettled(
    feeds.map((feed) =>
      fetchFeed(feed, true).catch((err) => {
        console.error(`[fetch-news] Failed to fetch feed "${feed.name}":`, err);
        return { articles: [] as Article[] };
      })
    )
  );

  let allArticles: Article[] = [];
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const { articles } = result.value;
    const filtered = articles.filter((a) => isSportsArticle(a));
    allArticles.push(...filtered);
  }

  // If less than MIN_ARTICLES after 7-day filter, retry without date restriction
  if (allArticles.length < MIN_ARTICLES) {
    const unfilteredResults = await Promise.allSettled(
      feeds.map((feed) =>
        fetchFeed(feed, false).catch((err) => {
          console.error(`[fetch-news] Failed to fetch feed (unfiltered) "${feed.name}":`, err);
          return { articles: [] as Article[] };
        })
      )
    );
    allArticles = [];
    for (const result of unfilteredResults) {
      if (result.status !== 'fulfilled') continue;
      const { articles } = result.value;
      const filtered = articles.filter((a) => isSportsArticle(a));
      allArticles.push(...filtered);
    }
  }

  // Deduplicate by exact URL
  const seenUrls = new Set<string>();
  const urlDeduped = allArticles.filter((article) => {
    if (seenUrls.has(article.url)) return false;
    seenUrls.add(article.url);
    return true;
  });

  // Fuzzy title dedup (removes exact same story from different sources)
  let deduped = fuzzyDedup(urlDeduped, feeds);

  // Semantic LLM dedup (removes articles about the same match)
  deduped = await llmSemanticDedup(deduped);

  // Sort by pubDate descending (newest first)
  deduped.sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  );

  // Return top MAX_ARTICLES
  const articles = deduped.slice(0, MAX_ARTICLES);

  console.log(
    `[fetch-news] ${urlDeduped.length} after URL dedup → returned ${articles.length} after all dedup`
  );
  return NextResponse.json({ articles });
}
