/**
 * POST /api/pipeline/crawl
 *
 * Bronze ingestion: crawl every enabled feed of every market for the last 24h,
 * dedup, and write raw articles into the DuckDB `bronze_news` layer. Also
 * deletes bronze rows older than 7 days (retention) and writes audit rows.
 *
 * Triggered by the scheduled Claude Code pipeline (step 1) or manually.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/app/lib/supabase';
import { crawlFeeds, type FeedEntry } from '@/app/lib/crawl';
import {
  insertBronze, deleteOldBronze, insertAudit, countConsecutiveFailures, type BronzeInput,
} from '@/app/lib/lake';
import { passesKeywordFilter } from '@/app/lib/keywordFilter';
import { discoverFeeds } from '@/app/lib/discover';
import type { KeywordConfig } from '@/app/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Consecutive failed runs a feed must log before self-heal rewrites its URL.
 *  3 runs at the 4-hourly cadence ≈ half a day of genuine breakage. */
const MIN_FAILURES_BEFORE_SELF_HEAL = 3;

/** Same feed, written differently. Discovery re-probes the origin and hands back the
 *  canonical form, which for a trailing slash is the SAME endpoint — so a plain `!==`
 *  read it as a fix and rewrote the row. Euronews oscillated /rss → /rss/ → /rss across
 *  three consecutive runs, burning a discovery call each time and never healing. */
function sameFeedTarget(a: string, b: string): boolean {
  const norm = (u: string) => u.trim().replace(/\/+$/, '').replace(/^http:/, 'https:');
  return norm(a) === norm(b);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = getSupabaseServer();

    // Look-back window: default 24h (the scheduled cadence). `?hours=` widens it
    // for first-run backfill or testing.
    const hoursParam = parseInt(new URL(request.url).searchParams.get('hours') ?? '24', 10);
    const hours = Number.isFinite(hoursParam) && hoursParam > 0 ? hoursParam : 24;

    // Retention first (per plan: delete >7d at the crawl step).
    const deletedOld = await deleteOldBronze(7);

    // All markets.
    const { data: markets } = await supabase.from('content_pages').select('id, name, keyword_config');
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    const summary: {
      marketId: string;
      market: string;
      feeds: number;
      crawled: number;
      keywordFiltered: number;
      inserted: number;
    }[] = [];

    for (const market of markets ?? []) {
      // Enabled feeds for this market.
      const { data: feedRows } = await supabase
        .from('rss_feeds')
        .select('id, name, url, feed_type, scrape_selector')
        .eq('page_id', market.id)
        .eq('enabled', true);

      const feeds: FeedEntry[] = (feedRows ?? []).map((f) => ({
        name: f.name,
        url: f.url,
        feedType: f.feed_type,
        scrapeSelector: f.scrape_selector ?? undefined,
      }));

      if (feeds.length === 0) {
        summary.push({ marketId: market.id, market: market.name, feeds: 0, crawled: 0, keywordFiltered: 0, inserted: 0 });
        continue;
      }

      const { articles, perFeed } = await crawlFeeds(feeds, cutoff);

      // Self-heal: a stored feed that hard-failed (403 bot-wall, moved path, dead
      // feed) is silently broken forever otherwise. Re-run the discovery cascade
      // on its origin and, if it resolves to a different working feed (e.g. the
      // Tier-4 Google News fallback), update the stored URL so the NEXT crawl uses
      // it. perFeed is index-aligned with feeds/feedRows (crawlFeeds preserves order).
      //
      // Only after MIN_FAILURES CONSECUTIVE failed runs. Repointing on a single bad
      // run is a one-way door: the fallback is a Google News wrapper, wrappers never
      // fail, so the original is never retried — and wrappers are the worst inputs
      // this pipeline has (thinnest blurbs, redirect stubs no body can be read from).
      // Publishers rate-limit intermittently: Euronews logged four 406s while serving
      // 50 items perfectly to a direct fetch. A blip must not cost a good feed.
      for (let i = 0; i < perFeed.length; i++) {
        if (perFeed[i].status !== 'failed') continue;
        const row = (feedRows ?? [])[i];
        if (!row) continue;
        // +1 for this run, whose audit row is written further below.
        const failures = (await countConsecutiveFailures(market.id, perFeed[i].name)) + 1;
        if (failures < MIN_FAILURES_BEFORE_SELF_HEAL) {
          console.warn(
            `[crawl] "${row.name}" failed (${failures}/${MIN_FAILURES_BEFORE_SELF_HEAL} consecutive) — ` +
            'leaving the URL alone; could be a transient block.',
          );
          continue;
        }
        try {
          const origin = new URL(row.url).origin;
          // Exclude the failing URL so an advertised-but-bot-walled feed cascades
          // past itself to the Google News fallback instead of being re-suggested.
          const [best] = await discoverFeeds(origin, { exclude: [row.url] });
          if (best && !sameFeedTarget(best.url, row.url)) {
            await supabase
              .from('rss_feeds')
              .update({ url: best.url, feed_type: best.feedType })
              .eq('id', row.id);
            console.warn(`[crawl] 🔧 self-heal "${row.name}": ${row.url} → ${best.url} (${best.method})`);
          } else {
            console.warn(`[crawl] "${row.name}" failed; self-heal found no working alternative for ${row.url}`);
          }
        } catch (e) {
          console.warn(`[crawl] self-heal error for "${row.name}":`, e instanceof Error ? e.message : e);
        }
      }

      // Deterministic keyword pre-filter (per-market keywordConfig) before bronze.
      const kc = (market.keyword_config ?? null) as KeywordConfig | null;
      const kept = articles.filter((a) => passesKeywordFilter(a.title, a.description ?? '', kc));
      const keywordFiltered = articles.length - kept.length;

      // Safeguard: a positive keyword gate written in the wrong language
      // silently drops every article. Surface it instead of hiding it.
      if (articles.length > 0 && kept.length === 0) {
        console.warn(
          `[crawl] ⚠️ keywordConfig dropped ALL ${articles.length} articles for market "${market.name}". ` +
          `Likely a language mismatch — check the market's keyword filter matches its source language.`,
        );
      }

      const bronzeRows: BronzeInput[] = kept.map((a) => ({
        market_id: market.id,
        source_name: a.source,
        article_url: a.url,
        title: a.title,
        description: a.description ?? '',
        image_url: a.imageUrl,
        image_urls: a.imageUrls,
        pub_date: a.pubDate,
        location: a.location,
      }));

      const inserted = await insertBronze(bronzeRows);

      // One audit row per feed (fetched count) + a market summary row.
      await insertAudit([
        // Record WHY a feed returned nothing. Without this a hard fetch failure and a
        // healthy-but-quiet feed both persist as bronze_in 0 / errors null, and a feed
        // that dies stays invisible — the UK market looks identical to a broken one at
        // 0.25 articles per cycle.
        ...perFeed.map((pf) => ({
          market_id: market.id,
          source_name: pf.name,
          bronze_in: pf.count,
          bronze_kept: 0,
          errors: pf.status === 'failed' ? 'fetch/parse failed' : null,
        })),
        {
          market_id: market.id,
          source_name: '(market total)',
          bronze_in: articles.length,
          bronze_kept: inserted,
        },
      ]);

      summary.push({
        marketId: market.id,
        market: market.name,
        feeds: feeds.length,
        crawled: articles.length,
        keywordFiltered,
        inserted,
      });
    }

    return NextResponse.json({ ok: true, deletedOld, markets: summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[crawl]', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
