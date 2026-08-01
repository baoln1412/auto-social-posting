/**
 * GET /api/audit?marketId=
 *
 * Medallion audit for a market: live layer counts (bronze/silver/gold),
 * per-source bronze counts, per-source immigration (silver) counts, and recent
 * run rows.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuditSummary } from '@/app/lib/lake';
import { getSupabaseServer } from '@/app/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const marketId = new URL(request.url).searchParams.get('marketId');
    if (!marketId) return NextResponse.json({ error: 'marketId is required' }, { status: 400 });

    const summary = await getAuditSummary(marketId);

    // Feed health is derived from audit_runs (DuckDB) but "should this feed be
    // producing?" lives with the feed config (Supabase), so the join happens here.
    // Without it a deliberately disabled feed reads as a dead one — Dân trí is off on
    // purpose and would otherwise sit in the warning list forever — and feeds deleted
    // long ago would haunt it from their historical rows.
    try {
      const { data } = await getSupabaseServer()
        .from('rss_feeds').select('name, enabled').eq('page_id', marketId);
      const configured = new Map((data ?? []).map((f: any) => [f.name, f.enabled !== false]));
      summary.feedHealth = (summary.feedHealth ?? [])
        .filter((f: any) => configured.has(f.source))
        .map((f: any) => ({ ...f, enabled: configured.get(f.source), stale: f.stale && configured.get(f.source) }));
    } catch {
      // Feed config unavailable — leave the raw health list rather than hiding it.
    }

    return NextResponse.json(summary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[audit]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
