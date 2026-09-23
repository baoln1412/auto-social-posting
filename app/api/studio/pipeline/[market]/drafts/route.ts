/**
 * POST /api/studio/pipeline/[market]/drafts — the top three of the queue, drafted now.
 *
 * The preview for step 3, and the only thing in this slice that spends. It is a real
 * generation with the real prompt: an output shape judged on a mock-up is an output shape
 * nobody can judge. Cached on the hash of (item, market context, shape), so re-opening the
 * screen or flipping back to a setting already seen costs nothing.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSilver } from '@/app/lib/lake';
import { query } from '@/app/lib/db';
import { cached } from '@/lib/studio/cache';
import { checkCompliance } from '@/lib/studio/gates/compliance';
import { draftAvailable, draftCost, generateDraft, type Draft } from '@/lib/studio/gold';
import { hashOf } from '@/lib/studio/hash';
import { outputPrompt } from '@/lib/studio/formats';
import { loadPipeline } from '@/lib/studio/pipeline/config';
import { orderQueue } from '@/lib/studio/pipeline/order';
import { can, tier } from '@/lib/studio/tier';
import type { SourceItem } from '@/lib/studio/steps/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const HOW_MANY = 3;

export async function POST(req: NextRequest, { params }: { params: { market: string } }) {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  const t = tier();
  if (!can(t, 'run')) return NextResponse.json({ error: 'Không được phép.' }, { status: 403 });

  const stored = loadPipeline(params.market).config;
  const body = (await req.json().catch(() => ({}))) as {
    output?: typeof stored.output;
    order?: typeof stored.order;
  };
  const output = { ...stored.output, ...(body.output ?? {}) };
  const order = { ...stored.order, ...(body.order ?? {}) };
  const shape = outputPrompt(output);

  const { data } = await query('content_pages')
    .select('writing_style,wording_rules,glossary')
    .eq('id', params.market)
    .single();
  const market = { ...((data ?? {}) as Record<string, string>), shape };

  let rows: Record<string, any>[];
  try {
    rows = orderQueue(await getSilver(params.market, 'all', 40), order).slice(0, HOW_MANY).map((s) => s.row);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'Chưa có bài nào trong hàng đợi — chạy thu thập trước.' },
      { status: 400 },
    );
  }

  const blocked = draftAvailable();
  const estimate = rows.reduce(
    (n, r) => n + draftCost(String(r.description ?? r.title ?? '').length).usd,
    0,
  );
  // The money guard lives here, not in the screen: a queue and a test reach this same path.
  if (!can(t, 'spend')) {
    return NextResponse.json(
      { error: 'Chế độ xem thử không sinh bài được.', cost: estimate },
      { status: 403 },
    );
  }
  if (blocked) return NextResponse.json({ error: blocked, cost: estimate }, { status: 400 });

  const drafts = [];
  for (const row of rows) {
    const item: SourceItem = {
      id: String(row.id),
      title: String(row.title ?? ''),
      text: String(row.description ?? ''),
      url: row.article_url ?? undefined,
      source: row.source_name ?? undefined,
      comments: [],
    };
    try {
      const draft = await cached<Draft>(
        hashOf('pipeline-draft', item.id, item.text, market, shape),
        () => generateDraft(item, market),
      );
      drafts.push({
        id: item.id,
        source: item.source ?? null,
        title: draft.title,
        text: draft.text,
        // Every previewed draft carries its compliance chip: an output shape whose three
        // previews fail the gate must not become a schedule.
        gate: await checkCompliance(draft),
      });
    } catch (e) {
      drafts.push({
        id: item.id,
        source: item.source ?? null,
        title: item.title,
        text: '',
        error: e instanceof Error ? e.message : String(e),
        gate: { checked: 0, findings: [] },
      });
    }
  }

  return NextResponse.json({ drafts, cost: Number(estimate.toFixed(4)), shape });
}
