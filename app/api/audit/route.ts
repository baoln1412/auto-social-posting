/**
 * GET /api/audit?marketId=
 *
 * Medallion audit for a market: live layer counts (bronze/silver/gold),
 * per-source bronze counts, per-source immigration (silver) counts, and recent
 * run rows.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuditSummary } from '@/app/lib/lake';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const marketId = new URL(request.url).searchParams.get('marketId');
    if (!marketId) return NextResponse.json({ error: 'marketId is required' }, { status: 400 });

    const summary = await getAuditSummary(marketId);
    return NextResponse.json(summary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[audit]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
