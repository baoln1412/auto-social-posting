/**
 * POST /api/pipeline/reset — clear gold + flip silver back to ungenerated so the
 * next pipeline run regenerates content (used after a voice/SOP change).
 *
 * body: { marketId?: string }  — scope to one market, or omit for ALL markets.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resetForRegeneration } from '@/app/lib/lake';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({}));
    const marketId: string | undefined = body.marketId || undefined;
    const result = await resetForRegeneration(marketId);
    return NextResponse.json({ ok: true, scope: marketId ?? 'all', ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[pipeline/reset]', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
