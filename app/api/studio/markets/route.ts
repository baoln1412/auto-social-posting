/** GET /api/studio/markets — the market list the gold source needs. Read-only. */
import { NextResponse } from 'next/server';
import { query } from '@/app/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  const { data } = await query('content_pages').select('id,name,country_code').order('name');
  return NextResponse.json({ markets: data ?? [] });
}
