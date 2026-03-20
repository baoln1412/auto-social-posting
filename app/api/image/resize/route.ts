import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

export const maxDuration = 30;

const FB_WIDTH = 1200;
const FB_HEIGHT = 630;

/**
 * Fetches a remote image, resizes/crops it to Facebook post dimensions (1200×630),
 * and returns the result as JPEG.
 *
 * Usage: GET /api/image/resize?url=https://example.com/image.jpg
 */
export async function GET(request: NextRequest) {
  const imageUrl = request.nextUrl.searchParams.get('url');

  if (!imageUrl) {
    return NextResponse.json({ error: 'Missing ?url= parameter' }, { status: 400 });
  }

  try {
    // Fetch the remote image
    const res = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SportsCommunityBot/1.0)',
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch image: ${res.status}` },
        { status: 502 },
      );
    }

    const buffer = Buffer.from(await res.arrayBuffer());

    // Resize and crop to Facebook post size
    const processed = await sharp(buffer)
      .resize(FB_WIDTH, FB_HEIGHT, {
        fit: 'cover',
        position: 'center',
      })
      .jpeg({ quality: 90 })
      .toBuffer();

    return new Response(new Uint8Array(processed), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': 'attachment; filename="fb-post-image.jpg"',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err) {
    console.error('[image/resize] Error:', err);
    return NextResponse.json(
      { error: 'Image processing failed', details: String(err) },
      { status: 500 },
    );
  }
}
