import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { Article } from '@/app/types';

export const dynamic = 'force-dynamic';

const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'media:content', { keepArray: true }],
      ['media:thumbnail', 'media:thumbnail'],
      ['content:encoded', 'content:encoded'],
    ],
  },
});

// ── Feed registry (6 approved US crime sources) ─────────────────────────
interface FeedEntry {
  name: string;
  url: string;
  crimeSpecific: boolean; // true = every article is crime-related
}

const FEEDS: FeedEntry[] = [
  // ── Mainstream US outlets (crime-specific endpoints) ──
  { name: 'NBC Crime',       url: 'https://feeds.nbcnews.com/nbcnews/public/news',      crimeSpecific: false },
  { name: 'ABC News US',     url: 'https://abcnews.go.com/abcnews/usheadlines',           crimeSpecific: false },
  { name: 'CBS Crime',       url: 'https://www.cbsnews.com/latest/rss/us',                 crimeSpecific: false },

  // ── Specialist crime & court outlets ──
  { name: 'Law & Crime',     url: 'https://lawandcrime.com/feed/',                         crimeSpecific: true  },
  { name: 'Court TV',        url: 'https://www.courttv.com/feed/',                         crimeSpecific: true  },
  { name: 'Crime Online',    url: 'https://www.crimeonline.com/feed/',                     crimeSpecific: true  },
];

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
// Filter out political stories — we only want individual/organized crime
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
  // Exclude international conflicts
  if (EXCLUDE_REGEX.test(text)) return false;
  // Exclude political news (even from crime-specific feeds)
  if (POLITICAL_REGEX.test(text)) return false;
  // For crime-specific feeds, accept all remaining (already filtered by feed)
  if (isCrimeSpecificFeed) return true;
  // For general feeds, require crime keywords
  return CRIME_REGEX.test(text);
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
    mediaContentUrl = mediaContent[0]?.$?.url ?? mediaContent[0]?.url;
  } else if (mediaContent) {
    mediaContentUrl = mediaContent?.$?.url ?? mediaContent?.url;
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
  // Fetch all feeds concurrently, tolerating individual failures
  const results = await Promise.allSettled(
    FEEDS.map((feed) =>
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
    // Apply crime keyword filter for non-crime-specific feeds
    const filtered = articles.filter((a) => isCrimeArticle(a, crimeSpecific));
    allArticles.push(...filtered);
  }

  // If less than MIN_ARTICLES after 7-day filter, retry without date restriction
  if (allArticles.length < MIN_ARTICLES) {
    const unfilteredResults = await Promise.allSettled(
      FEEDS.map((feed) =>
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

  // Deduplicate by URL
  const seen = new Set<string>();
  const deduplicated = allArticles.filter((article) => {
    if (seen.has(article.url)) return false;
    seen.add(article.url);
    return true;
  });

  // Sort by pubDate descending (newest first)
  deduplicated.sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  );

  // Return top MAX_ARTICLES
  const articles = deduplicated.slice(0, MAX_ARTICLES);

  console.log(`[fetch-news] Returning ${articles.length} crime articles from ${FEEDS.length} feeds`);
  return NextResponse.json({ articles });
}
