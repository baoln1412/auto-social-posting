import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { Article } from '@/app/types';
import { getSupabaseServer } from '@/app/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

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
  crimeSpecific: boolean; // true = every article is crime-related
}

// ── Hardcoded fallback feeds (used if Supabase query fails) ─────────────
const FALLBACK_FEEDS: FeedEntry[] = [
  { name: 'NBC Crime',       url: 'https://feeds.nbcnews.com/nbcnews/public/news',      crimeSpecific: false },
  { name: 'ABC News US',     url: 'https://abcnews.go.com/abcnews/usheadlines',           crimeSpecific: false },
  { name: 'CBS Crime',       url: 'https://www.cbsnews.com/latest/rss/us',                 crimeSpecific: false },
  { name: 'Law & Crime',     url: 'https://lawandcrime.com/feed/',                         crimeSpecific: true  },
  { name: 'Court TV',        url: 'https://www.courttv.com/feed/',                         crimeSpecific: true  },
  { name: 'Crime Online',    url: 'https://www.crimeonline.com/feed/',                     crimeSpecific: true  },
];

/** Load enabled feeds from Supabase, fall back to hardcoded list on error. */
async function loadFeeds(): Promise<FeedEntry[]> {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from('rss_feeds')
      .select('name, url, crime_specific')
      .eq('enabled', true)
      .order('name');

    if (error) throw error;
    if (!data || data.length === 0) return FALLBACK_FEEDS;

    return data.map((row) => ({
      name: row.name,
      url: row.url,
      crimeSpecific: row.crime_specific,
    }));
  } catch (err) {
    console.warn('[fetch-news] Failed to load feeds from Supabase, using fallback:', err);
    return FALLBACK_FEEDS;
  }
}

// ── Crime keyword filter ─────────────────────────────────────────────────
const CRIME_KEYWORDS: string[] = [
  'murder', 'kill', 'killed', 'killing', 'dead', 'death', 'homicide', 'manslaughter',
  'arrest', 'arrested', 'charged', 'suspect', 'shooting', 'shot', 'gunfire',
  'stabbing', 'stabbed', 'assault', 'robbery', 'kidnap', 'kidnapped', 'abduct',
  'missing', 'court', 'trial', 'verdict', 'sentenced', 'convicted', 'indicted',
  'arson', 'fentanyl', 'overdose', 'carjacking', 'burglary', 'rape',
  'crime', 'criminal', 'felony', 'felon', 'weapon', 'firearm', 'victim',
  'prosecutor', 'detective', 'investigation', 'homicide', 'manslaughter',
  'body found', 'crime scene', 'police', 'fatal',
];

// ── International / non-US exclusion filter ──────────────────────────────
const EXCLUDE_KEYWORDS: string[] = [
  'ukraine', 'russia', 'gaza', 'israel', 'hamas', 'palestine', 'nato',
  'syria', 'iran', 'iraq', 'afghanistan', 'china', 'north korea',
  'taiwan', 'myanmar', 'yemen', 'sudan', 'congo', 'ethiopia',
  'brexit', 'european union', 'g7', 'g20', 'united nations',
  'missile strike', 'airstrike', 'ceasefire', 'invasion', 'troops deployed',
];

// ── Political news exclusion filter ──────────────────────────────────────
const POLITICAL_KEYWORDS: string[] = [
  'election', 'elections', 'ballot', 'polling', 'voters', 'voting rights',
  'democrat', 'republican', 'gop', 'liberal', 'conservative',
  'congress', 'senate', 'senator', 'congressman', 'congresswoman',
  'house of representatives', 'speaker of the house',
  'white house', 'oval office', 'executive order',
  'president biden', 'president trump', 'vice president',
  'cabinet', 'secretary of state', 'attorney general',
  'legislation', 'bill passes', 'bill signed', 'filibuster',
  'immigration policy', 'border policy', 'immigration reform',
  'supreme court ruling', 'constitutional', 'amendment',
  'political', 'bipartisan', 'partisan', 'campaign',
  'gubernatorial', 'governor signs', 'governor vetoes',
  'lobby', 'lobbyist', 'pac', 'super pac', 'political action',
  'impeach', 'impeachment', 'censure',
  'state of the union', 'inaugural', 'inauguration',
  'tariff', 'trade war', 'sanctions',
  'federal budget', 'debt ceiling', 'government shutdown',
];

const CRIME_REGEX = new RegExp(
  CRIME_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i'
);

const EXCLUDE_REGEX = new RegExp(
  EXCLUDE_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i'
);

const POLITICAL_REGEX = new RegExp(
  POLITICAL_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i'
);

function isCrimeArticle(article: Article, isCrimeSpecificFeed: boolean): boolean {
  const text = `${article.title} ${article.description}`;
  if (EXCLUDE_REGEX.test(text)) return false;
  if (POLITICAL_REGEX.test(text)) return false;
  if (isCrimeSpecificFeed) return true;
  return CRIME_REGEX.test(text);
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
  // Build priority map: crime-specific feeds get higher priority
  for (const feed of feeds) {
    SOURCE_PRIORITY[feed.name] = feed.crimeSpecific ? 10 : 1;
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
async function fetchFeed(feed: FeedEntry, filterByDate: boolean = true): Promise<{ articles: Article[]; crimeSpecific: boolean }> {
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

  return { articles, crimeSpecific: feed.crimeSpecific };
}

export async function GET(): Promise<NextResponse> {
  // Load feeds from Supabase (falls back to hardcoded list)
  const feeds = await loadFeeds();

  // Fetch all feeds concurrently, tolerating individual failures
  const results = await Promise.allSettled(
    feeds.map((feed) =>
      fetchFeed(feed, true).catch((err) => {
        console.error(`[fetch-news] Failed to fetch feed "${feed.name}":`, err);
        return { articles: [] as Article[], crimeSpecific: feed.crimeSpecific };
      })
    )
  );

  let allArticles: Article[] = [];
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const { articles, crimeSpecific } = result.value;
    const filtered = articles.filter((a) => isCrimeArticle(a, crimeSpecific));
    allArticles.push(...filtered);
  }

  // If less than MIN_ARTICLES after 7-day filter, retry without date restriction
  if (allArticles.length < MIN_ARTICLES) {
    const unfilteredResults = await Promise.allSettled(
      feeds.map((feed) =>
        fetchFeed(feed, false).catch((err) => {
          console.error(`[fetch-news] Failed to fetch feed (unfiltered) "${feed.name}":`, err);
          return { articles: [] as Article[], crimeSpecific: feed.crimeSpecific };
        })
      )
    );
    allArticles = [];
    for (const result of unfilteredResults) {
      if (result.status !== 'fulfilled') continue;
      const { articles, crimeSpecific } = result.value;
      const filtered = articles.filter((a) => isCrimeArticle(a, crimeSpecific));
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

  // Fuzzy title dedup (removes same story from different sources)
  const deduped = fuzzyDedup(urlDeduped, feeds);

  // Sort by pubDate descending (newest first)
  deduped.sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  );

  // Return top MAX_ARTICLES
  const articles = deduped.slice(0, MAX_ARTICLES);

  console.log(
    `[fetch-news] ${urlDeduped.length} after URL dedup → ${deduped.length} after fuzzy dedup → returning ${articles.length} from ${feeds.length} feeds`
  );
  return NextResponse.json({ articles });
}
