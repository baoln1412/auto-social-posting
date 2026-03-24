import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/app/lib/supabase';

/**
 * GET /api/facebook/post — get a specific page channel's token
 * POST /api/facebook/post — post to Facebook page(s) via page_channels
 */

import { NextRequest } from 'next/server';
import sharp from 'sharp';

async function getChannelToken(channelId: string): Promise<{ token: string; pageId: string } | null> {
  const supabase = getSupabaseServer();
  const { data } = await supabase
    .from('page_channels')
    .select('platform_page_id, access_token')
    .eq('id', channelId)
    .single();

  if (!data) return null;
  return { token: data.access_token, pageId: data.platform_page_id };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { channelId, emojiTitle, facebookText, imageUrl, scheduledTime } = body;

    if (!facebookText) {
      return NextResponse.json({ error: 'facebookText is required' }, { status: 400 });
    }

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }

    // Get token from page_channels
    const channel = await getChannelToken(channelId);
    if (!channel) {
      return NextResponse.json({ error: 'Channel not found or disconnected' }, { status: 404 });
    }

    const { token: pageToken, pageId: PAGE_ID } = channel;

    // Validate scheduled time
    let scheduledTimestamp: number | undefined;
    if (scheduledTime) {
      scheduledTimestamp = Math.floor(new Date(scheduledTime).getTime() / 1000);
      const now = Math.floor(Date.now() / 1000);
      if (scheduledTimestamp - now < 600) {
        return NextResponse.json({ error: 'Scheduled time must be at least 10 minutes in the future' }, { status: 400 });
      }
      if (scheduledTimestamp - now > 30 * 24 * 3600) {
        return NextResponse.json({ error: 'Scheduled time must be within 30 days' }, { status: 400 });
      }
    }

    const titleLine = emojiTitle ? `${emojiTitle}\n\n` : '';
    const message = `${titleLine}${facebookText}`;

    if (imageUrl) {
      const imgRes = await fetch(imageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AutoSocialBot/1.0)' },
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
        return NextResponse.json({ error: fbData.error?.message || 'Facebook API error', details: fbData }, { status: fbRes.status });
      }

      return NextResponse.json({ success: true, postId: fbData.id || fbData.post_id, scheduled: !!scheduledTimestamp });
    } else {
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
        return NextResponse.json({ error: fbData.error?.message || 'Facebook API error', details: fbData }, { status: fbRes.status });
      }

      return NextResponse.json({ success: true, postId: fbData.id, scheduled: !!scheduledTimestamp });
    }
  } catch (error) {
    console.error('[facebook] Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
