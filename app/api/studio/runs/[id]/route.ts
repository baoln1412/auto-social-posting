/**
 * PATCH /api/studio/runs/[id] — save this run's settings without running anything.
 *
 * `advance` also accepts overrides, but it accepts them on the way to executing a step. The
 * kit editor opened from a run needs to answer "this run only" and hand the owner straight
 * back — saving is not a reason to spend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { studioDb } from '@/lib/studio/db';
import { getRun } from '@/lib/studio/runs';
import { can, mayUseChannel, tier } from '@/lib/studio/tier';
import type { Overrides, Selection } from '@/lib/studio/steps/types';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  const t = tier();
  if (!can(t, 'run')) return NextResponse.json({ error: 'Không được phép.' }, { status: 403 });

  const rec = getRun(params.id);
  if (!rec) return NextResponse.json({ error: 'Không tìm thấy lượt chạy.' }, { status: 404 });
  if (!mayUseChannel(t, rec.channel.tier_min)) {
    return NextResponse.json({ error: 'Kênh này ngoài quyền của bạn.' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    overrides?: Overrides;
    selection?: Selection;
  };
  const d = studioDb();
  if (body.overrides) {
    // Merged, not replaced: the kit editor sends one tab and must not wipe the drawer.
    d.prepare('UPDATE studio_runs SET overrides_json=? WHERE id=?').run(
      JSON.stringify({ ...rec.run.overrides, ...body.overrides }),
      params.id,
    );
  }
  if (body.selection) {
    d.prepare('UPDATE studio_runs SET selection_json=? WHERE id=?').run(
      JSON.stringify(body.selection),
      params.id,
    );
  }
  return NextResponse.json({ ok: true, overrides: getRun(params.id)!.run.overrides });
}
