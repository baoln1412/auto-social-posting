/**
 * GET /api/pipeline/bronze?marketId=&status=unclassified&limit=
 *
 * Returns raw bronze articles for a market. Used by the scheduled pipeline's
 * classification step (Claude reads these, judges immigration relevance, then
 * POSTs results to /api/pipeline/silver).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBronze } from '@/app/lib/lake';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const marketId = searchParams.get('marketId');
    if (!marketId) return NextResponse.json({ error: 'marketId is required' }, { status: 400 });

    const status = (searchParams.get('status') as 'unclassified' | 'all') ?? 'unclassified';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 500);

    const rows = await getBronze(marketId, status, limit);
    return NextResponse.json({ articles: rows, count: rows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[bronze]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
