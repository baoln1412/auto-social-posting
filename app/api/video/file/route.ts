import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { outputPath } from '../../../lib/videoJobs';

export const runtime = 'nodejs';

const NAME_RE = /^[a-f0-9-]+\.mp4$/; // uuid.mp4 only — blocks path traversal

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('f') ?? '';
  if (!NAME_RE.test(name)) {
    return NextResponse.json({ error: 'bad name' }, { status: 400 });
  }
  try {
    const buf = await readFile(outputPath(name));
    return new NextResponse(buf, {
      headers: { 'Content-Type': 'video/mp4', 'Cache-Control': 'public, max-age=86400' },
    });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
