/**
 * POST /api/pipeline/dedupe-gold
 *
 * Body: { marketId?: string }  (omit marketId to dedupe every market)
 *
 * Removes duplicate gold posts, keeping the earliest row per (market_id, article_url)
 * and per (market_id, emoji_title). One-off cleanup; new inserts are now idempotent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { dedupeGold } from '@/app/lib/lake';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({}));
    const marketId: string | undefined = body.marketId ?? undefined;
    const deleted = await dedupeGold(marketId);
    return NextResponse.json({ ok: true, deleted, marketId: marketId ?? 'all' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[dedupe-gold]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
