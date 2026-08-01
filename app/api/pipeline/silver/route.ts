/**
 * Silver layer — immigration classification results (produced by the LLM).
 *
 * GET  /api/pipeline/silver?marketId=&status=ungenerated&limit=
 *        → silver rows awaiting content generation.
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
  getSilver, getBronzeByIds, markBronzeClassified, insertSilver, countPending,
  type SilverInput,
} from '@/app/lib/lake';
import { validTopics } from '@/app/lib/topics';
import { parseJsonBody } from '@/app/lib/jsonBody';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const marketId = searchParams.get('marketId');
    if (!marketId) return NextResponse.json({ error: 'marketId is required' }, { status: 400 });

    const status = (searchParams.get('status') as 'ungenerated' | 'all') ?? 'ungenerated';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 500);

    const rows = await getSilver(marketId, status, limit);
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
