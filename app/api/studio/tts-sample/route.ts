/**
 * GET /api/studio/tts-sample?text&voice&rate — one sentence, as an mp3.
 *
 * A GET and not a POST so the <audio> element can simply point at it and the browser caches
 * by URL, the same bargain the frame route makes: the query names the sound exactly.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ttsSample } from '@/lib/studio/tts';
import { can, tier } from '@/lib/studio/tier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  if (!can(tier(), 'run')) return new NextResponse('Forbidden', { status: 403 });

  const q = req.nextUrl.searchParams;
  try {
    const mp3 = await ttsSample({
      text: q.get('text') ?? '',
      voice: q.get('voice') ?? undefined,
      rate: q.get('rate') ?? undefined,
    });
    return new NextResponse(new Uint8Array(mp3), {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
