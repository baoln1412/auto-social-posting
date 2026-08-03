/**
 * Feed discovery cascade (shared by /api/feeds/discover and the crawl's
 * self-heal). Resolves the best available ingestion method for a URL:
 *   1. The URL itself is already a feed                → direct
 *   2. <link rel="alternate" rss|atom> in the page     → html-link
 *   3. Probe standard + non-standard feed paths        → probe
 *        (Arc /arc/outboundfeeds/rss, Ippen /rssfeed.rdf, etc.)
 *   4. Google News sitemap (direct URLs, real titles)  → news-sitemap
 *   5. No native feed → Google News RSS scoped to site → google-news
 *        (bypasses sites whose own feed is bot-walled, e.g. Akamai)
 *   6. Page renders article links server-side          → scrape (web_scrape)
 */

import { BROWSER_HEADERS, fetchViaPublicDns } from '@/app/lib/crawl';

export type DiscoverMethod = 'direct' | 'html-link' | 'probe' | 'news-sitemap' | 'google-news' | 'scrape';

export interface DiscoveredFeed {
  url: string;
  title?: string;
  type: DiscoverMethod;
  method: string;
  feedType: 'rss' | 'web_scrape' | 'news_sitemap';
}

// Standard + real-world non-standard feed paths, probed concurrently.
const COMMON_FEED_PATHS = [
  '/feed/', '/feed', '/rss/', '/rss', '/feed.xml', '/rss.xml', '/atom.xml',
  '/index.xml', '/feeds/posts/default', '/?feed=rss2', '/?feed=atom',
  '/rssfeed.rdf',                             // Ippen Digital (24hamburg, merkur, fr.de)
  '/rss.rdf', '/feed.rss', '/feeds/rss', '/news/rss',
  '/arc/outboundfeeds/rss/?outputType=xml',  // Arc Publishing (rnd.de, WaPo-platform papers)
  '/arc/outboundfeeds/rss/',
];

// Locale hints for the Google News fallback, keyed by the host's TLD.
const TLD_LOCALE: Record<string, { hl: string; gl: string; ceid: string }> = {
  de: { hl: 'de', gl: 'DE', ceid: 'DE:de' },
  au: { hl: 'en-AU', gl: 'AU', ceid: 'AU:en' },
  vn: { hl: 'vi', gl: 'VN', ceid: 'VN:vi' },
  in: { hl: 'en-IN', gl: 'IN', ceid: 'IN:en' },
  uk: { hl: 'en-GB', gl: 'GB', ceid: 'GB:en' },
  fr: { hl: 'fr', gl: 'FR', ceid: 'FR:fr' },
  cz: { hl: 'cs', gl: 'CZ', ceid: 'CZ:cs' },
};

async function fetchDoc(url: string, timeoutMs: number): Promise<{ ok: boolean; text: string }> {
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { ok: false, text: '' };
    return { ok: true, text: await res.text() };
  } catch {
    // Discovery has to survive a sinkholed host for the same reason the crawl does —
    // and here it matters more. A host the local resolver lies about looks to this
    // cascade like a site with no feed at all, so step 4 repoints it at a Google News
    // wrapper: thin blurbs, unfetchable redirect stubs, and the original never retried.
    // That ratchet is where this market's Google News feeds came from. Retry over
    // public DNS so a site's own feed is found before we give up on it.
    try {
      const res = await fetchViaPublicDns(url, BROWSER_HEADERS, timeoutMs);
      if (!res.ok) return { ok: false, text: '' };
      return { ok: true, text: await res.text() };
    } catch {
      return { ok: false, text: '' };
    }
  }
}

// A real feed root marker — guards against HTML error pages served with an
// xml-ish content-type by a bot wall.
function looksLikeFeed(text: string): boolean {
  return (
    /<rss[\s>]/i.test(text) ||
    /<feed[\s>]/i.test(text) ||
    /<rdf:RDF[\s>]/i.test(text) ||
    (/<channel[\s>]/i.test(text) && /<item[\s>]/i.test(text))
  );
}

function feedItemCount(text: string): number {
  return (text.match(/<item[\s>]/gi)?.length ?? 0) + (text.match(/<entry[\s>]/gi)?.length ?? 0);
}

function extractFeedLinks(html: string, baseUrl: string): DiscoveredFeed[] {
  const feeds: DiscoveredFeed[] = [];
  const linkRegex = /<link[^>]*type=["'](application\/(?:rss|atom)\+xml)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null) {
    const tag = match[0];
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    let href = hrefMatch[1];
    if (href.startsWith('/')) {
      const u = new URL(baseUrl);
      href = `${u.protocol}//${u.host}${href}`;
    } else if (!href.startsWith('http')) {
      href = `${baseUrl.replace(/\/$/, '')}/${href}`;
    }
    const titleMatch = tag.match(/title=["']([^"']+)["']/i);
    feeds.push({ url: href, title: titleMatch?.[1], type: 'html-link', method: '<link> tag in page', feedType: 'rss' });
  }
  return feeds;
}

function countArticleLinks(html: string): number {
  const re = /href=["'](?:https?:\/\/[^"'/]+)?\/[a-z0-9-]+\/[^"']*?(?:-\d{6,}|\/\d{4}\/\d{2}\/)[^"']*["']/gi;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) seen.add(m[0]);
  return seen.size;
}

/**
 * Find a sitemap that actually carries news entries. robots.txt is the reliable
 * index — guessing /news-sitemap.xml misses the ones served off an assets host.
 * Verified by requiring a real <news:title>, so a plain URL-only sitemap (no titles,
 * so nothing to generate from) is rejected rather than configured and left empty.
 */
async function discoverNewsSitemap(origin: string): Promise<string | null> {
  const robots = await fetchDoc(`${origin}/robots.txt`, 8000);
  if (!robots.ok) return null;
  const listed = [...robots.text.matchAll(/^\s*Sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  // News-looking sitemaps first: a publisher's main sitemap is usually a huge archive
  // index, while the news one is the recent window Google polls.
  const ranked = [
    ...listed.filter((u) => /news/i.test(u)),
    ...listed.filter((u) => !/news/i.test(u)),
  ].slice(0, 3);

  for (const url of ranked) {
    const doc = await fetchDoc(url, 12000);
    if (!doc.ok) continue;
    if (/<news:title>/i.test(doc.text)) return url;
    // An index lists child sitemaps — check the most recent child before rejecting.
    if (/<sitemapindex[\s>]/i.test(doc.text)) {
      const child = [...doc.text.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/g)]
        .map((m) => ({
          loc: m[1].match(/<loc>([\s\S]*?)<\/loc>/)?.[1]?.trim() ?? '',
          mod: new Date(m[1].match(/<lastmod>([\s\S]*?)<\/lastmod>/)?.[1] ?? 0).getTime() || 0,
        }))
        .filter((c) => c.loc)
        .sort((a, b) => b.mod - a.mod)[0];
      if (child) {
        const inner = await fetchDoc(child.loc, 12000);
        if (inner.ok && /<news:title>/i.test(inner.text)) return url;
      }
    }
  }
  return null;
}

function googleNewsFeed(host: string): string {
  const tld = host.split('.').pop() ?? '';
  const loc = TLD_LOCALE[tld] ?? { hl: 'en', gl: 'US', ceid: 'US:en' };
  const q = encodeURIComponent(`site:${host} when:7d`);
  return `https://news.google.com/rss/search?q=${q}&hl=${loc.hl}&gl=${loc.gl}&ceid=${loc.ceid}`;
}

/**
 * Run the 6-tier cascade. Returns the best feed(s), best method first (empty if
 * none). `opts.exclude` lists URLs that must NOT be returned — used by the crawl's
 * self-heal to skip the very feed URL that just failed, so a site that advertises
 * a bot-walled feed (Newsweek) cascades past it to a later tier instead of
 * re-suggesting the same broken URL.
 */
export async function discoverFeeds(
  rawUrl: string,
  opts: { exclude?: string[] } = {},
): Promise<DiscoveredFeed[]> {
  const excluded = new Set(opts.exclude ?? []);
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  let origin: string, host: string;
  try {
    const parsed = new URL(url);
    origin = `${parsed.protocol}//${parsed.host}`;
    host = parsed.host;
  } catch {
    return [];
  }

  const found: DiscoveredFeed[] = [];
  const add = (f: DiscoveredFeed) => {
    if (excluded.has(f.url)) return;
    if (!found.some((x) => x.url === f.url)) found.push(f);
  };

  // Tier 1 — the given URL is itself a feed (unless it's the excluded/failing one)
  const page = await fetchDoc(url, 8000);
  if (page.ok && looksLikeFeed(page.text) && !excluded.has(url)) {
    return [{ url, title: 'Direct feed', type: 'direct', method: 'URL is already a feed', feedType: 'rss' }];
  }

  // Tier 2 — <link rel="alternate"> advertised in the page HTML
  if (page.ok) for (const f of extractFeedLinks(page.text, url)) add(f);

  // Tier 3 — probe standard + non-standard feed paths.
  // Probed under the given URL's own section as well as the origin: a newsroom's feed
  // routinely sits beside its section rather than at the root (SBS publishes at
  // /news/feed, nothing at /feed), so an origin-only probe declares "no native feed"
  // and hands the site to the Google News fallback while its real feed sits one
  // directory down. Section first — it is the more specific answer when both exist.
  // Probe under the URL's *directory*: /news/ → /news, but /rss.xml → the root, so a
  // feed URL handed in by hand doesn't spend 19 requests on /rss.xml/feed and friends.
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  if (segments.length && segments[segments.length - 1].includes('.')) segments.pop();
  const section = segments.length ? `${origin}/${segments.join('/')}` : origin;
  const bases = section !== origin ? [section, origin] : [origin];
  const probes = await Promise.allSettled(
    bases.flatMap((base) =>
      COMMON_FEED_PATHS.map(async (path) => {
        const feedUrl = `${base}${path}`;
        if (found.some((d) => d.url === feedUrl)) return null;
        // 12s, not 6s: probes run concurrently so a longer budget costs no extra
        // wall-clock, and at 6s a slow-but-working feed is indistinguishable from no
        // feed at all. CIC News answers /feed in 5.9s — it tripped the old limit about
        // half the time, and the penalty is permanent (Tier 4 ratchets the site to a
        // Google News wrapper and the real URL is never retried).
        const doc = await fetchDoc(feedUrl, 12000);
        return doc.ok && looksLikeFeed(doc.text) ? feedUrl : null;
      }),
    ),
  );
  for (const p of probes) {
    if (p.status === 'fulfilled' && p.value) {
      add({ url: p.value, type: 'probe', method: 'Probed feed path', feedType: 'rss' });
    }
  }

  // Tier 4 — a Google News sitemap, which most newsrooms publish for indexing even
  // when they retired their RSS. It carries the same three fields an item needs —
  // direct URL, title, publication date — so it beats the Google News wrapper below
  // on the thing that matters: the URL is the publisher's, so the body is fetchable.
  if (found.length === 0) {
    const sm = await discoverNewsSitemap(origin);
    if (sm) {
      add({
        url: sm,
        title: 'News sitemap',
        type: 'news-sitemap',
        method: 'Google News sitemap (no RSS, but direct article URLs)',
        feedType: 'news_sitemap',
      });
    }
  }

  // Tier 5 — no native feed → Google News scoped to the site (bot-wall bypass)
  if (found.length === 0) {
    const gn = googleNewsFeed(host);
    const doc = await fetchDoc(gn, 8000);
    if (doc.ok && feedItemCount(doc.text) > 0) {
      add({
        url: gn,
        title: `Google News · ${host}`,
        type: 'google-news',
        method: "Google News fallback (site's own feed is unavailable/bot-walled)",
        feedType: 'rss',
      });
    }
  }

  // Tier 6 — last resort → scrape the page HTML for article links
  if (found.length === 0 && page.ok && countArticleLinks(page.text) >= 3) {
    add({
      url,
      title: `Scrape · ${host}`,
      type: 'scrape',
      method: 'No feed found — scrape the page HTML for articles',
      feedType: 'web_scrape',
    });
  }

  return found;
}
