/**
 * Silver layer — immigration classification results (produced by the LLM).
 *
 * GET  /api/pipeline/silver?marketId=&status=ungenerated&limit=
 *        → silver rows awaiting content generation.
 * GET  /api/pipeline/silver?ids=<id,id,...>&withBody=1
 *        → those rows with `content`: the real article text, fetched on demand and
 *          cached in bronze_news.content. Ask for it AFTER picking the top 15, never
 *          for the whole page — one fetch per row is the entire cost of this endpoint.
 * POST /api/pipeline/silver
 *        body: { items: [{ bronze_id, is_immigration, category?, relevance_score?, duplicate_of? }] }
 *        → marks every bronze_id classified; for immigration (and non-duplicate)
 *          items, copies the bronze row into silver_immigration.
 *
 * Filtering + same-event dedup are decided by the LLM (the `is_immigration` and
 * `duplicate_of` flags), not by hardcoded keyword heuristics.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getSilver, getSilverByIds, getBronzeByIds, markBronzeClassified, insertSilver,
  countPending, getBronzeContent, setBronzeContent, type SilverInput,
} from '@/app/lib/lake';
import { extractArticleBody, mapLimit } from '@/app/lib/crawl';
import { validTopics } from '@/app/lib/topics';
import { parseJsonBody } from '@/app/lib/jsonBody';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Can this row's article body ever be fetched? Known before any network call, because
 * a Google News link is a redirect stub that yields nothing. Matters at SELECTION
 * time: the top-15 cap was spent on relevance alone, so ungroundable rows took slots
 * and were then correctly refused as unwritable — Australia generated 9 of 15 with 6
 * stubs sitting in the picked set. `true` is "worth trying", not a guarantee: a
 * paywall or a failed fetch still lands on an empty body.
 */
function groundable(row: Record<string, any>): boolean {
  return !String(row.article_url ?? '').includes('news.google.com');
}

/** Attach the real article text to each row, fetching only what isn't cached yet. */
async function attachBodies(rows: Record<string, any>[]): Promise<Record<string, any>[]> {
  const cached = await getBronzeContent(rows.map((r) => String(r.bronze_id)));
  await mapLimit(rows, 4, async (r) => {
    let body = cached.get(String(r.bronze_id)) ?? '';
    if (!body && r.article_url) {
      // article_url lives on the silver row, so extraction still works after bronze's
      // 7-day retention has dropped the source row — only the cache write is lost
      // (UPDATE matches nothing). A >7-day-old row therefore refetches each time,
      // which is correct, just not cached. Rare: rows are normally written the same
      // cycle they are crawled.
      body = await extractArticleBody(String(r.article_url));
      if (body) await setBronzeContent(String(r.bronze_id), body);
    }
    // '' means no body could be had (Google News stub, paywall, fetch failure). The
    // generation step must then stay on the headline rather than invent the middle.
    r.content = body;
  });
  return rows;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);

    // By-id form: the generation step's picked rows, optionally with article bodies.
    const ids = (searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length > 0) {
      const picked = await getSilverByIds(ids.slice(0, 50));
      const items = searchParams.get('withBody') === '1' ? await attachBodies(picked) : picked;
      items.forEach((r) => { r.groundable = groundable(r); });
      return NextResponse.json({ items, count: items.length });
    }

    const marketId = searchParams.get('marketId');
    if (!marketId) return NextResponse.json({ error: 'marketId or ids is required' }, { status: 400 });

    const status = (searchParams.get('status') as 'ungenerated' | 'all') ?? 'ungenerated';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 500);

    const rows = await getSilver(marketId, status, limit);
    rows.forEach((r) => { r.groundable = groundable(r); });
    // `count` is this page; `pending` is the real ungenerated backlog.
    const pending = await countPending('silver', marketId);
    return NextResponse.json({ items: rows, count: rows.length, pending });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[silver][GET]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

interface ClassifyItem {
  bronze_id: string;
  /** Legacy binary flag; still honored. Superseded by `topics` (keep if ≥1 topic). */
  is_immigration?: boolean;
  category?: string;
  /** Multi-label topics from the 12-topic taxonomy (subset of TOPIC_IDS). */
  topics?: string[];
  relevance_score?: number;
  /** LLM may flag this as a duplicate of another (same-event) article → skip */
  duplicate_of?: string | null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const body = parsed.data;
    const items: ClassifyItem[] = body.items ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items[] is required' }, { status: 400 });
    }

    // Every classified bronze row is marked done so it isn't re-processed.
    const allIds = items.map((i) => i.bronze_id);
    await markBronzeClassified(allIds);

    // Keep relevant, non-duplicate items → silver. An item is relevant if it carries
    // ≥1 valid topic (new taxonomy) or the legacy is_immigration flag is set.
    const relevant = (i: ClassifyItem) =>
      !i.duplicate_of && (validTopics(i.topics).length > 0 || i.is_immigration === true);
    const keep = items.filter(relevant);
    const bronzeRows = await getBronzeByIds(keep.map((i) => i.bronze_id));
    const byId = new Map(bronzeRows.map((r) => [r.id, r]));

    const silverRows: SilverInput[] = keep
      .map((i) => {
        const b = byId.get(i.bronze_id);
        if (!b) return null;
        // Normalize topics; fall back to ['immigration'] for legacy is_immigration items.
        let topics = validTopics(i.topics);
        if (topics.length === 0 && i.is_immigration) topics = ['immigration'];
        return {
          bronze_id: b.id,
          market_id: b.market_id,
          article_url: b.article_url,
          title: b.title,
          description: b.description ?? '',
          source_name: b.source_name ?? '',
          location: b.location ?? undefined,
          image_url: b.image_url ?? undefined,
          image_urls: JSON.parse(b.image_urls ?? '[]'),
          category: topics[0] ?? i.category ?? 'immigration',
          topics,
          relevance_score: i.relevance_score,
        } as SilverInput;
      })
      .filter((r): r is SilverInput => r !== null);

    const inserted = await insertSilver(silverRows);

    return NextResponse.json({ ok: true, classified: allIds.length, silverInserted: inserted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[silver][POST]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
