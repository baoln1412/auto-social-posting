/** POST /api/studio/kits — make a new Bộ nhận diện by copying one that already works. */
import { NextRequest, NextResponse } from 'next/server';
import { createKit } from '@/lib/studio/kits/create';
import { can, tier } from '@/lib/studio/tier';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  if (!can(tier(), 'edit_kit')) {
    return NextResponse.json({ error: 'Chế độ xem thử không tạo được bộ nhận diện.' }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { name?: string; from?: string };
  if (!body.from) return NextResponse.json({ error: 'Thiếu bộ nhận diện để chép.' }, { status: 400 });
  try {
    return NextResponse.json({ kit: createKit({ name: body.name ?? '', from: body.from }) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
