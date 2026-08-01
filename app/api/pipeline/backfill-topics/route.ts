/**
 * POST /api/pipeline/backfill-topics
 *
 * Body: { marketId?: string }  (omit marketId to backfill every market)
 *
 * One-off: tags already-generated gold posts that predate the 12-topic taxonomy
 * with ['immigration'] (the whole legacy corpus was immigration-filtered). Only
 * touches gold_content rows whose topics are empty/NULL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { backfillGoldTopics } from '@/app/lib/lake';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({}));
    const marketId: string | undefined = body.marketId ?? undefined;
    const updated = await backfillGoldTopics(marketId);
    return NextResponse.json({ ok: true, updated, marketId: marketId ?? 'all' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[backfill-topics]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
