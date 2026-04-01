import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/app/lib/supabase';

/**
 * GET /api/facebook/status?pageId=xxx
 * Returns connected channels for a content page.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const pageId = searchParams.get('pageId');

    let query = supabase.from('page_channels').select('*').eq('platform', 'facebook');
    if (pageId) {
      query = query.eq('page_id', pageId);
    }

    const { data: channels, error } = await query.order('connected_at', { ascending: false });

    if (error) {
      return NextResponse.json({ channels: [], error: 'Database error' }, { status: 500 });
    }

    if (!channels || channels.length === 0) {
      return NextResponse.json({ channels: [], connected: false });
    }

    // Verify first channel's token
    const primaryChannel = channels[0];
    let tokenValid = false;
    try {
      const verifyRes = await fetch(
        `https://graph.facebook.com/v20.0/${primaryChannel.platform_page_id}?fields=name&access_token=${primaryChannel.access_token}`,
      );
      const verifyData = await verifyRes.json();
      tokenValid = !verifyData.error && !!verifyData.name;
    } catch {
      tokenValid = false;
    }

    return NextResponse.json({
      connected: tokenValid,
      channels: channels.map((c: any) => ({
        id: c.id,
        pageId: c.page_id,
        platform: c.platform,
        platformPageId: c.platform_page_id,
        platformPageName: c.platform_page_name,
        connectedAt: c.connected_at,
        systemPrompt: c.system_prompt ?? null,
        userPrompt: c.user_prompt ?? null,
        keywordConfig: c.keyword_config ?? null,
      })),
      tokenValid,
    });

  } catch (err) {
    console.error('[facebook-status] Error:', err);
    return NextResponse.json({ channels: [], connected: false, error: 'Failed' }, { status: 500 });
  }
}

/**
 * DELETE /api/facebook/status?channelId=xxx
 * Disconnects a specific channel.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');

    const supabase = getSupabaseServer();

    if (channelId) {
      await supabase.from('page_channels').delete().eq('id', channelId);
    } else {
      const pageId = searchParams.get('pageId');
      if (pageId) {
        await supabase.from('page_channels').delete().eq('page_id', pageId).eq('platform', 'facebook');
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[facebook-status] Delete error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
