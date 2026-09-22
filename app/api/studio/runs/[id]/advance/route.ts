/**
 * POST /api/studio/runs/[id]/advance — run the current step.
 *
 * Continue, Re-run and resume are all this one call; the drawer and the scene picks ride
 * along in the body so neither needs a route of its own.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/app/lib/videoJobs';
import { advance, getRun } from '@/lib/studio/runs';
import { runJob } from '@/lib/studio/progress';
import { can, mayUseChannel, tier } from '@/lib/studio/tier';
import type { Overrides, Selection, StepName } from '@/lib/studio/steps/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  const t = tier();
  if (!can(t, 'run')) return NextResponse.json({ error: 'Không được phép chạy.' }, { status: 403 });

  const rec = getRun(params.id);
  if (!rec) return NextResponse.json({ error: 'Không tìm thấy lượt chạy.' }, { status: 404 });
  if (!mayUseChannel(t, rec.channel.tier_min)) {
    return NextResponse.json({ error: 'Kênh này ngoài quyền của bạn.' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    step?: StepName;
    selection?: Selection;
    overrides?: Overrides;
    editDraft?: string;
  };

  try {
    const out = await advance(params.id, { ...body, allowSpend: can(t, 'spend') });
    return NextResponse.json({ status: out.run.status, current_step: out.run.current_step });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}

/**
 * GET — the render stage this run is on, while a reel is rendering.
 *
 * Deliberately in THIS file rather than its own route. Next gives each route its own module
 * graph, so a sibling route importing lib/studio/progress got a different Map: measured on a
 * three-minute render that reported `null` from first frame to last. Sharing a file shares
 * the instance — which is why app/api/video/render puts its POST and GET together too.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  const jobId = runJob(params.id);
  const job = jobId ? getJob(jobId) : undefined;
  return NextResponse.json(
    job ? { status: job.status, step: job.step, pct: job.pct, done: job.done ?? [] } : { status: null },
  );
}
