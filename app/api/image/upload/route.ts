/**
 * Local card images — upload + serve. (public/ is snapshotted at build time, so
 * runtime-written files there aren't served; we keep uploads in data/uploads and
 * stream them back through this route instead.)
 *
 * POST /api/image/upload  (multipart/form-data, field `file`)
 *   → { url: "/api/image/upload?f=<name>" }
 * GET  /api/image/upload?f=<name>
 *   → the raw image bytes (fetched server-side by /api/image/card as bg= / inset=).
 *
 * ponytail: no cleanup of old uploads — add a TTL sweep only if disk fills up.
 */

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DIR = join(process.cwd(), 'data', 'uploads');
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
};
const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4' };
const NAME_RE = /^[a-f0-9-]+\.(jpg|png|webp|mp4)$/; // uuid.ext only — blocks path traversal
const MAX_SIZE: Record<string, number> = { jpg: 8e6, png: 8e6, webp: 8e6, mp4: 80e6 };

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    const ext = EXT[file.type];
    if (!ext) {
      return NextResponse.json({ error: `unsupported type: ${file.type}` }, { status: 400 });
    }
    if (file.size > MAX_SIZE[ext]) {
      return NextResponse.json({ error: `file too large (max ${MAX_SIZE[ext] / 1e6}MB)` }, { status: 400 });
    }
    await mkdir(DIR, { recursive: true });
    const name = `${randomUUID()}.${ext}`;
    await writeFile(join(DIR, name), Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ url: `/api/image/upload?f=${name}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[image/upload][POST]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const name = req.nextUrl.searchParams.get('f') ?? '';
  if (!NAME_RE.test(name)) {
    return NextResponse.json({ error: 'bad name' }, { status: 400 });
  }
  try {
    const buf = await readFile(join(DIR, name));
    const ext = name.split('.').pop() as string;
    return new NextResponse(buf, {
      headers: { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' },
    });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
