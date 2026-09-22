/**
 * POST /api/studio/runs — start a run. New route tree; nothing under app/api/* is touched.
 */
import { NextRequest, NextResponse } from 'next/server';
import { studioDb } from '@/lib/studio/db';
import { createRun } from '@/lib/studio/runs';
import { can, mayUseChannel, tier } from '@/lib/studio/tier';
import { TEMPLATES, type Mode } from '@/lib/studio/steps/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  const t = tier();
  if (!can(t, 'run')) return NextResponse.json({ error: 'Không được phép chạy.' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    channelId?: string;
    mode?: Mode;
    itemRef?: string;
    overrides?: Record<string, unknown>;
  };

  if (!body.channelId || !body.mode || !TEMPLATES[body.mode]) {
    return NextResponse.json({ error: 'Thiếu kênh hoặc chế độ.' }, { status: 400 });
  }

  const channel = studioDb()
    .prepare('SELECT tier_min FROM studio_channels WHERE id=?')
    .get(body.channelId) as { tier_min: string } | undefined;
  if (!channel) return NextResponse.json({ error: 'Không có kênh này.' }, { status: 404 });
  if (!mayUseChannel(t, channel.tier_min)) {
    return NextResponse.json({ error: 'Kênh này ngoài quyền của bạn.' }, { status: 403 });
  }

  const id = createRun({
    channelId: body.channelId,
    mode: body.mode,
    itemRef: body.itemRef,
    overrides: body.overrides ?? {},
  });
  return NextResponse.json({ id });
}
