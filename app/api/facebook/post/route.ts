import { NextResponse } from 'next/server';
import sharp from 'sharp';

/**
 * Get a working Page Access Token.
 * Strategy: Try using the env token directly first (it may already be a Page Token).
 * If that fails, attempt exchange via /me/accounts.
 */
let cachedPageToken: string | null = null;

async function getPageAccessToken(): Promise<string> {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const pageId = process.env.FACEBOOK_PAGE_ID;

  if (!token || !pageId) {
    throw new Error('FACEBOOK_PAGE_ACCESS_TOKEN or FACEBOOK_PAGE_ID not configured');
  }

  if (cachedPageToken) return cachedPageToken;

  // First, verify if the token works directly as a Page Token
  const verifyRes = await fetch(
    `https://graph.facebook.com/v20.0/${pageId}?fields=name,access_token&access_token=${token}`,
  );
  const verifyData = await verifyRes.json();

  // If the response includes an access_token field, use that (it's the page token)
  if (verifyData.access_token) {
    cachedPageToken = verifyData.access_token;
    console.log(`[facebook] Got Page Token from page query for "${verifyData.name}"`);
    return cachedPageToken!;
  }

  // If the page query returned name but no access_token, the token itself is likely a page token
  if (verifyData.name && !verifyData.error) {
    cachedPageToken = token;
    console.log(`[facebook] Using token directly for page "${verifyData.name}"`);
    return cachedPageToken;
  }

  // Fallback: try /me/accounts exchange
  const res = await fetch(
    `https://graph.facebook.com/v20.0/me/accounts?access_token=${token}`,
  );
  const data = await res.json();

  if (data.data?.length > 0) {
    const page = data.data.find((p: any) => p.id === pageId);
    if (page) {
      cachedPageToken = page.access_token;
      console.log(`[facebook] Got Page Token via /me/accounts for "${page.name}"`);
      return cachedPageToken!;
    }
  }

  // Last resort: use the token as-is
  console.warn('[facebook] Could not exchange token, using it directly');
  cachedPageToken = token;
  return cachedPageToken;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { emojiTitleVi, facebookText, imageUrl, scheduledTime } = body;

    // If scheduling, convert ISO string to UNIX timestamp
    // Per FB docs: must be 10 min to 30 days in the future
    let scheduledTimestamp: number | undefined;
    if (scheduledTime) {
      scheduledTimestamp = Math.floor(new Date(scheduledTime).getTime() / 1000);
      const now = Math.floor(Date.now() / 1000);
      if (scheduledTimestamp - now < 600) {
        return NextResponse.json(
          { error: 'Scheduled time must be at least 10 minutes in the future' },
          { status: 400 },
        );
      }
      if (scheduledTimestamp - now > 30 * 24 * 3600) {
        return NextResponse.json(
          { error: 'Scheduled time must be within 30 days' },
          { status: 400 },
        );
      }
    }

    if (!facebookText) {
      return NextResponse.json({ error: 'facebookText is required' }, { status: 400 });
    }

    // Get the real Page Access Token (exchanged from user token)
    let pageToken: string;
    try {
      pageToken = await getPageAccessToken();
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Token exchange failed' },
        { status: 500 },
      );
    }

    const PAGE_ID = process.env.FACEBOOK_PAGE_ID!;

    // Build the post message: Vietnamese title + draft content
    const titleLine = emojiTitleVi ? `${emojiTitleVi}\n\n` : '';
    const message = `${titleLine}${facebookText}`;

    if (imageUrl) {
      // ── Post with photo ──────────────────────────────────────────────
      const imgRes = await fetch(imageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SportsCommunityBot/1.0)' },
      });

      if (!imgRes.ok) {
        return NextResponse.json({ error: `Failed to fetch image: ${imgRes.status}` }, { status: 502 });
      }

      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
      const croppedBuffer = await sharp(imgBuffer)
        .resize(1200, 630, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 90 })
        .toBuffer();

      const formData = new FormData();
      formData.append('source', new Blob([new Uint8Array(croppedBuffer)], { type: 'image/jpeg' }), 'fb-post.jpg');
      formData.append('message', message);
      formData.append('access_token', pageToken);
      if (scheduledTimestamp) {
        formData.append('published', 'false');
        formData.append('scheduled_publish_time', String(scheduledTimestamp));
      }

      const fbRes = await fetch(`https://graph.facebook.com/v20.0/${PAGE_ID}/photos`, {
        method: 'POST',
        body: formData,
      });

      const fbData = await fbRes.json();

      if (!fbRes.ok) {
        console.error('[facebook] Photo post error:', fbData);
        return NextResponse.json(
          { error: fbData.error?.message || 'Facebook API error', details: fbData },
          { status: fbRes.status },
        );
      }

      const action = scheduledTimestamp ? 'scheduled' : 'posted';
      console.log(`[facebook] Photo ${action} successfully:`, fbData.id || fbData.post_id);
      return NextResponse.json({ success: true, postId: fbData.id || fbData.post_id, scheduled: !!scheduledTimestamp });
    } else {
      // ── Text-only post ───────────────────────────────────────────────
      const payload: any = { message, access_token: pageToken };
      if (scheduledTimestamp) {
        payload.published = false;
        payload.scheduled_publish_time = scheduledTimestamp;
      }

      const fbRes = await fetch(`https://graph.facebook.com/v20.0/${PAGE_ID}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const fbData = await fbRes.json();

      if (!fbRes.ok) {
        console.error('[facebook] Text post error:', fbData);
        return NextResponse.json(
          { error: fbData.error?.message || 'Facebook API error', details: fbData },
          { status: fbRes.status },
        );
      }

      const action = scheduledTimestamp ? 'scheduled' : 'posted';
      console.log(`[facebook] Text ${action} successfully:`, fbData.id);
      return NextResponse.json({ success: true, postId: fbData.id, scheduled: !!scheduledTimestamp });
    }
  } catch (error) {
    console.error('[facebook] Error posting to Facebook:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
