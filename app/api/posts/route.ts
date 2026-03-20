/**
 * GET /api/posts — Load saved crime posts from Supabase.
 *
 * Supports filters via query params:
 * - state: filter by US state (e.g. ?state=Texas)
 * - source: filter by source name (e.g. ?source=Law %26 Crime)
 * - days: filter by recency (e.g. ?days=3 or ?days=7), default: 7
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/app/lib/supabase';
import { PostDraft } from '@/app/types';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = getSupabaseServer();
    const { searchParams } = new URL(request.url);

    const stateFilter = searchParams.get('state');
    const sourceFilter = searchParams.get('source');
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');
    const doneFilter = searchParams.get('done');

    // Build query
    let query = supabase
      .from('crime_posts')
      .select('*')
      .order('fetch_time', { ascending: false });

    // Date range filter — boundaries in UTC+7 (Asia/Bangkok)
    if (fromDate) {
      query = query.gte('fetch_time', `${fromDate}T00:00:00+07:00`);
    }
    if (toDate) {
      query = query.lte('fetch_time', `${toDate}T23:59:59+07:00`);
    }

    if (stateFilter && stateFilter !== 'All') {
      query = query.eq('state', stateFilter);
    }

    if (sourceFilter && sourceFilter !== 'All') {
      query = query.eq('source', sourceFilter);
    }

    if (doneFilter === 'done') {
      query = query.eq('is_done', true);
    } else if (doneFilter === 'not_done') {
      query = query.eq('is_done', false);
    }

    const { data, error } = await query.limit(100);

    if (error) {
      console.error('[posts] Supabase query error:', error);
      return NextResponse.json({ posts: [], error: error.message }, { status: 500 });
    }

    // Transform DB rows → PostDraft shape
    const posts: PostDraft[] = (data ?? []).map((row) => ({
      article: {
        title: row.article_title,
        url: row.article_url,
        pubDate: row.pub_date,
        source: row.source,
        description: row.description ?? '',
        imageUrl: row.image_url ?? undefined,
        portraitUrl: row.portrait_url ?? undefined,
        summary: row.summary ?? row.description ?? '',
      },
      emojiTitle: row.emoji_title,
      emojiTitleVi: row.emoji_title_vi ?? '',
      facebookText: row.facebook_text,
      commentBait: row.comment_bait,
      nb2Prompt: row.nb2_prompt,
      state: row.state,
      fetchTime: row.fetch_time,
      isDone: row.is_done ?? false,
    }));

    // Also return distinct filters for the UI
    const { data: states } = await supabase
      .from('crime_posts')
      .select('state')
      .order('state');

    const { data: sources } = await supabase
      .from('crime_posts')
      .select('source')
      .order('source');

    const distinctStates = [...new Set((states ?? []).map((r) => r.state).filter(Boolean))];
    const distinctSources = [...new Set((sources ?? []).map((r) => r.source).filter(Boolean))];

    return NextResponse.json({
      posts,
      filters: {
        states: distinctStates,
        sources: distinctSources,
      },
    });
  } catch (err) {
    console.error('[posts] Error:', err);
    return NextResponse.json({ posts: [], error: 'Failed to load posts' }, { status: 500 });
  }
}
