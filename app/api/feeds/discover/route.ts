/**
 * /api/feeds/discover — Resolve the best available ingestion method for a URL.
 *
 * POST { url: "https://example.com" }
 * Returns { feeds: [{ url, title?, type, method, feedType }] }
 *   feedType is what to store in rss_feeds: 'rss' (parseable feed) | 'web_scrape'.
 *
 * The 5-tier cascade lives in app/lib/discover.ts (shared with the crawl's
 * self-heal, which re-discovers a feed's URL when it starts failing).
 */

import { NextRequest, NextResponse } from 'next/server';
import { discoverFeeds } from '@/app/lib/discover';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const url = body?.url;
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }
    const feeds = await discoverFeeds(url);
    return NextResponse.json({ feeds });
  } catch (err) {
    console.error('[discover] Error:', err);
    return NextResponse.json({ error: 'Failed to discover feeds' }, { status: 500 });
  }
}
