/**
 * /api/feeds — CRUD for RSS feed sources stored in Supabase.
 *
 * GET    → list feeds for a page (query param ?pageId=...)
 * POST   → add a new feed { pageId, name, url, feedType?, scrapeSelector? }
 * DELETE → remove a feed by id (query param ?id=...)
 * PATCH  → toggle enabled/disabled by id { id, enabled }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/app/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const pageId = searchParams.get('pageId');

    const supabase = getSupabaseServer();
    let query = supabase.from('rss_feeds').select('*').order('name');

    if (pageId) {
      query = query.eq('page_id', pageId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const feeds = (data ?? []).map((row) => ({
      id: row.id,
      pageId: row.page_id,
      name: row.name,
      url: row.url,
      feedType: row.feed_type,
      scrapeSelector: row.scrape_selector,
      enabled: row.enabled,
    }));

    return NextResponse.json({ feeds });
  } catch (err) {
    console.error('[feeds] GET error:', err);
    return NextResponse.json({ feeds: [], error: 'Failed to load feeds' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { pageId, name, url, feedType, scrapeSelector } = body;

    if (!pageId || !name || !url) {
      return NextResponse.json({ error: 'pageId, name, and url are required' }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from('rss_feeds')
      .insert({
        page_id: pageId,
        name: name.trim(),
        url: url.trim(),
        feed_type: feedType ?? 'rss',
        scrape_selector: scrapeSelector ?? null,
        enabled: true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'This URL already exists' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ feed: data }, { status: 201 });
  } catch (err) {
    console.error('[feeds] POST error:', err);
    return NextResponse.json({ error: 'Failed to add feed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const supabase = getSupabaseServer();
    const { error } = await supabase.from('rss_feeds').delete().eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[feeds] DELETE error:', err);
    return NextResponse.json({ error: 'Failed to delete feed' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { id, enabled } = body;

    if (!id || typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'id and enabled (boolean) are required' }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from('rss_feeds')
      .update({ enabled })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ feed: data });
  } catch (err) {
    console.error('[feeds] PATCH error:', err);
    return NextResponse.json({ error: 'Failed to update feed' }, { status: 500 });
  }
}
