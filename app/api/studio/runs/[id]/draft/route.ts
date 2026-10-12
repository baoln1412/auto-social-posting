/**
 * POST /api/studio/runs/[id]/draft — the overlay choreography, as a 540p clip.
 *
 * Deliberately not part of `preview`: that route is called debounced on every slider and
 * is bound by its own contract to never spend and never encode. This one encodes, so it
 * only runs when the owner asks for it.
 *
 * It is still free — one ffmpeg pass over a still, no TTS, no whisper, no model call.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getRun, optionsFor, runCtx } from '@/lib/studio/runs';
import { motionDraft } from '@/lib/studio/steps/reel';
import { can, mayUseChannel, tier } from '@/lib/studio/tier';
import type { Draft } from '@/lib/studio/gold';
import type { StepOptions } from '@/lib/studio/steps/types';

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

  const draft = rec.steps.draft?.status === 'ok' ? (rec.steps.draft.output as Draft) : null;
  if (!draft?.text) {
    return NextResponse.json({ error: 'Chưa có lời đọc để dựng thử.' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { opts?: StepOptions };
  const ctx = runCtx(rec, optionsFor(rec, 'reel', body.opts));
  const out = await motionDraft(draft, ctx);
  if (!out) return NextResponse.json({ error: 'Không dựng được bản thử.' }, { status: 500 });
  return NextResponse.json(out);
}
