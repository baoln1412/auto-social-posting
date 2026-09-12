/**
 * POST /api/pipeline/reset — clear gold + flip silver back to ungenerated so the
 * next pipeline run regenerates content (used after a voice/SOP change).
 *
 * body: { marketId: string }  — REQUIRED. Omitting it used to mean "all markets" and
 * cost 9,029 posts on 2026-09-12; an unscoped call is now a 400.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resetForRegeneration } from '@/app/lib/lake';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({}));
    const marketId: string | undefined = body.marketId || undefined;
    if (!marketId) {
      return NextResponse.json(
        { ok: false, error: 'marketId is required - an unscoped reset would delete every market' },
        { status: 400 },
      );
    }
    const result = await resetForRegeneration(marketId);
    return NextResponse.json({ ok: true, scope: marketId, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[pipeline/reset]', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
