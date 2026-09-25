/**
 * GET  /api/studio/publish?run=<id>   — what is queued for a run, and what happened to it.
 * GET  /api/studio/publish?from=&to=  — every row in a window, for the calendar overlay.
 * POST /api/studio/publish            — queue a run for one or more destinations.
 *
 * The step does the same thing through `publishStep.run`; this route exists for the screens
 * that queue without walking the step — the calendar, and `Tự đăng khi render xong`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { lintCaption } from '@/lib/studio/publish/limits';
import { enqueue, nextSlot, rowsFor, tick, windowRows } from '@/lib/studio/publish/queue';
import { startPublishLoop } from '@/lib/studio/publish/loop';
import { sendRow } from '@/lib/studio/publish/send';
import { getRun } from '@/lib/studio/runs';
import { can, tier } from '@/lib/studio/tier';
import type { Where } from '@/lib/studio/steps/publish';
import type { Draft } from '@/lib/studio/gold';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  startPublishLoop();
  const run = req.nextUrl.searchParams.get('run');
  if (run) return NextResponse.json({ rows: rowsFor(run) });

  const from = req.nextUrl.searchParams.get('from') ?? new Date(0).toISOString();
  const to = req.nextUrl.searchParams.get('to') ?? new Date(Date.now() + 365 * 86_400_000).toISOString();
  return NextResponse.json({ rows: windowRows(from, to) });
}

export async function POST(req: NextRequest) {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  if (!can(tier(), 'spend')) return NextResponse.json({ error: 'Chế độ này không đăng được.' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    runId?: string;
    where?: Where[];
    at?: string;
    firstComment?: string;
  };
  if (!body.runId || !body.where?.length) {
    return NextResponse.json({ error: 'Thiếu lượt chạy hoặc nơi đăng.' }, { status: 400 });
  }
  const rec = getRun(body.runId);
  if (!rec) return NextResponse.json({ error: 'Không có lượt chạy này.' }, { status: 404 });

  // The linter is a gate, not a hint: a post over the limit is refused by Meta anyway, and
  // being told here beats being told by a 400 an hour after it was scheduled.
  const draft = rec.steps.draft?.output as Draft | undefined;
  const gate = lintCaption(
    {
      title: draft?.title ?? '',
      text: draft?.text ?? '',
      firstComment: body.firstComment ?? '',
      sourceUrl: (rec.steps.fetch?.output as { url?: string } | undefined)?.url,
      hasReel: Boolean(rec.steps.reel?.output),
    },
    body.where,
  );
  if (gate.findings.length) return NextResponse.json({ error: gate.findings[0], gate }, { status: 400 });

  const at = body.at?.trim() || new Date().toISOString();
  const already = new Set(rowsFor(body.runId).filter((r) => r.status !== 'failed').map((r) => r.where));
  for (const w of body.where) {
    if (!already.has(w)) enqueue({ runId: body.runId, where: w, at, firstComment: body.firstComment });
  }
  await tick(sendRow);
  return NextResponse.json({ rows: rowsFor(body.runId), gate });
}

/** The next free slot in the machine's cadence — asked for by the Đăng screen. */
export async function PUT(req: NextRequest) {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  const to = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const taken = windowRows(new Date().toISOString(), to)
    .filter((r) => r.status === 'pending')
    .map((r) => r.at);
  void req;
  return NextResponse.json({ at: nextSlot(taken) });
}
