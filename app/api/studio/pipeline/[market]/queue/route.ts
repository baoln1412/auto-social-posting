/**
 * GET /api/studio/pipeline/[market]/queue — the last crawl, in the order this setup puts it.
 *
 * The preview for step 2. Every row the crawl produced is here: the configuration moves rows
 * up and down and never removes one, and each row carries the arithmetic that placed it so
 * "why is this third" has an answer on screen.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSilver } from '@/app/lib/lake';
import { loadPipeline } from '@/lib/studio/pipeline/config';
import { orderQueue } from '@/lib/studio/pipeline/order';
import { can, tier } from '@/lib/studio/tier';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest, { params }: { params: { market: string } }) {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  if (!can(tier(), 'run')) return NextResponse.json({ error: 'Không được phép.' }, { status: 403 });

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 40) || 40, 200);
  // Overridable from the screen so the queue reorders live, before anything is saved.
  let order = loadPipeline(params.market).config.order;
  const raw = req.nextUrl.searchParams.get('order');
  if (raw) {
    try {
      order = { ...order, ...(JSON.parse(raw) as object) };
    } catch {
      /* a malformed override is the saved configuration, not a 400 */
    }
  }

  try {
    // 'all', not 'ungenerated': the owner is judging the ordering, and hiding the rows that
    // already became posts would hide exactly the ones the ordering picked last time.
    const rows = await getSilver(params.market, 'all', limit);
    const scored = orderQueue(rows, order);
    return NextResponse.json({
      total: scored.length,
      rows: scored.map((s) => ({
        id: s.row.id,
        title: s.row.title,
        source: s.row.source_name ?? null,
        category: s.row.category ?? null,
        generated: Boolean(s.row.generated),
        score: Number(s.score.toFixed(3)),
        parts: s.parts.map((p) => ({ label: p.label, value: Number(p.value.toFixed(3)) })),
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
