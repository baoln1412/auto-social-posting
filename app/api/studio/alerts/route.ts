/**
 * GET  /api/studio/alerts        — the bell's contents.
 * POST /api/studio/alerts        — { ids?: string[] } marks them read; no ids means all.
 */
import { NextRequest, NextResponse } from 'next/server';
import { markSeen, recent, unseenCount } from '@/lib/studio/alerts';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  return NextResponse.json({ alerts: recent(50), unseen: unseenCount() });
}

export async function POST(req: NextRequest) {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
  return NextResponse.json({ marked: markSeen(body.ids), unseen: unseenCount() });
}
