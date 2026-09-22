/**
 * POST /api/studio/runs/[id]/advance — run the current step.
 *
 * Continue, Re-run and resume are all this one call; the drawer and the scene picks ride
 * along in the body so neither needs a route of its own.
 */
import { NextRequest, NextResponse } from 'next/server';
import { advance, getRun } from '@/lib/studio/runs';
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
