/** POST /api/studio/media — upload one background, sticker or music file. */
import { NextRequest, NextResponse } from 'next/server';
import { listMedia, quotaOf, saveUpload, type MediaKind } from '@/lib/studio/assets';
import { can, tier } from '@/lib/studio/tier';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const KINDS: MediaKind[] = ['bg', 'sticker', 'music'];

export async function GET() {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  const media = listMedia();
  return NextResponse.json({ media, quota: quotaOf(media.map((m) => ({ bytes: m.bytes }))) });
}

export async function POST(req: NextRequest) {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  if (!can(tier(), 'edit_kit')) {
    return NextResponse.json({ error: 'Chế độ xem thử không tải tệp lên được.' }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const kind = String(form?.get('kind') ?? '') as MediaKind;
  if (!(file instanceof File)) return NextResponse.json({ error: 'Thiếu tệp.' }, { status: 400 });
  if (!KINDS.includes(kind)) return NextResponse.json({ error: 'Loại không hợp lệ.' }, { status: 400 });

  try {
    const row = saveUpload(kind, file.name, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ media: row });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
