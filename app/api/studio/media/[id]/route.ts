/** GET serves one uploaded file; DELETE removes it. Files live outside public/ on purpose. */
import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { MEDIA_DIR, deleteMedia, mediaById } from '@/lib/studio/assets';
import { can, tier } from '@/lib/studio/tier';

export const dynamic = 'force-dynamic';

const TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
};

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  const row = mediaById(params.id);
  // The stored path came from our own writer, but serving a file by id is exactly where a
  // traversal would land, so the resolved path is checked against the directory anyway.
  if (!row || !path.resolve(row.path).startsWith(path.resolve(MEDIA_DIR) + path.sep)) {
    return new NextResponse('Not found', { status: 404 });
  }
  try {
    return new NextResponse(fs.readFileSync(row.path), {
      headers: {
        'Content-Type': TYPES[path.extname(row.path).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  if (!can(tier(), 'edit_kit')) return NextResponse.json({ error: 'Không được phép.' }, { status: 403 });
  return deleteMedia(params.id)
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: 'Không có tệp này.' }, { status: 404 });
}
