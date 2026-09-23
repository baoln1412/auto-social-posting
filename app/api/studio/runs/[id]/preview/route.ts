/**
 * POST /api/studio/runs/[id]/preview — what this step would produce with these controls.
 *
 * The C fix: v1 previewed once per page load, so a drawer change or a ticked comment updated
 * nothing until the next advance. The screen calls this debounced on every control, and the
 * options it sends are stored, so `advance` runs the step on exactly what was on screen.
 *
 * Never spends and never runs the step — `preview()` is the cheap half of the contract, and
 * a step that broke that rule would be charging for a slider.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getRun, previewStep, saveOptions } from '@/lib/studio/runs';
import { can, mayUseChannel, tier } from '@/lib/studio/tier';
import type { StepName, StepOptions } from '@/lib/studio/steps/types';

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

  const body = (await req.json().catch(() => ({}))) as { step?: StepName; opts?: StepOptions };
  const step = body.step ?? rec.run.current_step;
  if (!rec.template.includes(step)) {
    return NextResponse.json({ error: `"${step}" không có trong lượt chạy này.` }, { status: 400 });
  }

  const opts = body.opts ?? {};
  saveOptions(params.id, step, opts);

  const out = await previewStep(rec, step, opts);
  return NextResponse.json({ ...out, step, stale: false });
}
