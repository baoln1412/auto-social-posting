/**
 * POST /api/studio/runs — start a run. New route tree; nothing under app/api/* is touched.
 * GET  /api/studio/runs?items=gold:a,gold:b — the latest run per item, for the library.
 */
import { NextRequest, NextResponse } from 'next/server';
import { studioDb } from '@/lib/studio/db';
import { createRun } from '@/lib/studio/runs';
import { can, mayUseChannel, tier } from '@/lib/studio/tier';
import { detectSource } from '@/lib/studio/sources/detect';
import { saveRunText, textToItem } from '@/lib/studio/sources/text';
import { runsForItems } from '@/lib/studio/lake';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const items = (req.nextUrl.searchParams.get('items') ?? '').split(',').filter(Boolean).slice(0, 200);
  return NextResponse.json({ runs: await runsForItems(items, tier()) });
}

export async function POST(req: NextRequest) {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  const t = tier();
  if (!can(t, 'run')) return NextResponse.json({ error: 'Không được phép chạy.' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    channelId?: string;
    itemRef?: string;
    overrides?: Record<string, unknown>;
  };

  if (!body.channelId) {
    return NextResponse.json({ error: 'Thiếu kênh.' }, { status: 400 });
  }

  const channel = studioDb()
    .prepare('SELECT tier_min FROM studio_channels WHERE id=?')
    .get(body.channelId) as { tier_min: string } | undefined;
  if (!channel) return NextResponse.json({ error: 'Không có kênh này.' }, { status: 404 });
  if (!mayUseChannel(t, channel.tier_min)) {
    return NextResponse.json({ error: 'Kênh này ngoài quyền của bạn.' }, { status: 403 });
  }

  // A whole pasted article would otherwise become the item_ref itself. The ref stays a
  // short text:<sha> and the words go in their own row — which is what saveRunText was
  // written for in slice 1 and never wired to.
  const pasted = body.itemRef?.trim() ?? '';
  const detected = detectSource(pasted);
  const isOwnText = detected?.kind === 'text' && Boolean(detected.cfg.text);
  const itemRef = isOwnText ? textToItem(pasted).id : pasted || undefined;

  const id = createRun({
    channelId: body.channelId,
    itemRef,
    overrides: body.overrides ?? {},
  });
  if (isOwnText) saveRunText(id, pasted);
  return NextResponse.json({ id });
}
