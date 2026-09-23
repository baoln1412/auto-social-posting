/**
 * GET /api/studio/frame?text&style&plate&sticker — one composed reel frame as a PNG.
 *
 * Every input is in the query, so the URL is the cache key twice over: the browser will not
 * re-fetch a frame it already has, and the server will not re-render one it already drew.
 * That is what makes a control change redraw in a few hundred milliseconds instead of
 * re-running ffmpeg over a whole reel.
 */
import { NextRequest, NextResponse } from 'next/server';
import { renderFrame } from '@/lib/studio/frame';
import { plateAllowed } from '@/lib/studio/frame-url';
import { can, tier } from '@/lib/studio/tier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  // Drawing a frame is local and free, but it does read a path off the query, so it stays
  // behind the same gate as the rest of Studio.
  if (!can(tier(), 'run')) return new NextResponse('Forbidden', { status: 403 });

  const q = req.nextUrl.searchParams;
  let style: Record<string, unknown> = {};
  try {
    style = JSON.parse(q.get('style') ?? '{}') as Record<string, unknown>;
  } catch {
    /* a malformed style is the classic preset, not a 500 */
  }

  const root = process.cwd();
  const keep = (p: string | null) => (p && plateAllowed(p, root) ? p : null);

  try {
    const png = await renderFrame({
      text: q.get('text') ?? '',
      style,
      // A plate outside Studio's own trees is dropped, not refused: the frame still draws,
      // with the neutral plate, and the caption is what the owner was looking at anyway.
      plate: keep(q.get('plate')),
      sticker: keep(q.get('sticker')),
    });
    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        // The query names the pixels exactly, so a cached copy can never be wrong.
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
