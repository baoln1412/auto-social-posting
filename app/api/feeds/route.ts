/**
 * /api/feeds — CRUD for RSS feed sources stored in Supabase.
 *
 * GET    → list all feeds (ordered by name)
 * POST   → add a new feed { name, url, crimeSpecific? }
 * DELETE → remove a feed by id (query param ?id=...)
 * PATCH  → toggle enabled/disabled by id (query param ?id=...)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/app/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// GET — list all feeds
export async function GET(): Promise<NextResponse> {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from('rss_feeds')
      .select('*')
      .order('name');

    if (error) throw error;
    return NextResponse.json({ feeds: data ?? [] });
  } catch (err) {
    console.error('[feeds] GET error:', err);
    return NextResponse.json({ feeds: [], error: 'Failed to load feeds' }, { status: 500 });
  }
}

// POST — add a new feed
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { name, url, crimeSpecific } = body;

    if (!name || !url) {
      return NextResponse.json({ error: 'name and url are required' }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from('rss_feeds')
      .insert({
        name: name.trim(),
        url: url.trim(),
        crime_specific: crimeSpecific ?? false,
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

// DELETE — remove a feed by id
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

// PATCH — toggle enabled status
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
