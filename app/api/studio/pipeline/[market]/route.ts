/**
 * GET / PUT /api/studio/pipeline/[market] — this market's pipeline setup.
 *
 * Only Studio's own half: ordering, output shape, which kit draws the picture. The feeds go
 * through /api/feeds and the market's prompt through /api/pages, both untouched, so the old
 * Settings panel and this screen are editing the same rows.
 */
import { NextRequest, NextResponse } from 'next/server';
import { loadPipeline, savePipeline, type PipelineConfig } from '@/lib/studio/pipeline/config';
import { can, tier } from '@/lib/studio/tier';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { market: string } }) {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  if (!can(tier(), 'run')) return NextResponse.json({ error: 'Không được phép.' }, { status: 403 });
  return NextResponse.json(loadPipeline(params.market));
}

export async function PUT(req: NextRequest, { params }: { params: { market: string } }) {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  // Editing a market's pipeline is editing the channel's standing configuration, not one
  // video — the same permission the kit editor needs.
  if (!can(tier(), 'edit_kit')) {
    return NextResponse.json({ error: 'Chế độ xem thử không sửa được thiết lập.' }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { config?: PipelineConfig };
  if (!body.config) return NextResponse.json({ error: 'Thiếu thiết lập.' }, { status: 400 });
  return NextResponse.json(savePipeline(params.market, body.config));
}
