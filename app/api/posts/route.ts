/**
 * GET /api/posts — Load posts from Supabase with pagination.
 *
 * Query params:
 * - pageId: filter by content page (required)
 * - source: filter by source name
 * - from/to: date range (UTC+7)
 * - done: 'done' | 'not_done'
 * - keyword: full-text keyword search across title, facebook text, summary
 * - limit: items per page (default 30)
 * - offset: pagination offset (default 0)
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

    const pageId = searchParams.get('pageId');
    const sourceFilter = searchParams.get('source');
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');
    const doneFilter = searchParams.get('done');
    const keyword = searchParams.get('keyword');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '30', 10), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);

    // Build query
    let query = supabase
      .from('posts')
      .select('*', { count: 'exact' })
      .order('fetch_time', { ascending: false });

    if (pageId) {
      query = query.eq('page_id', pageId);
    }

    if (fromDate) {
      query = query.gte('fetch_time', `${fromDate}T00:00:00+07:00`);
    }
    if (toDate) {
      query = query.lte('fetch_time', `${toDate}T23:59:59+07:00`);
    }

    if (sourceFilter && sourceFilter !== 'All') {
      query = query.eq('source', sourceFilter);
    }

    if (doneFilter === 'done') {
      query = query.eq('is_done', true);
    } else if (doneFilter === 'not_done') {
      query = query.eq('is_done', false);
    }

    if (keyword && keyword.trim()) {
      const q = `%${keyword.trim()}%`;
      query = query.or(
        `article_title.ilike.${q},facebook_text.ilike.${q},summary.ilike.${q},emoji_title.ilike.${q},description.ilike.${q}`
      );
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[posts] Supabase query error:', error);
      return NextResponse.json({ posts: [], totalCount: 0, error: error.message }, { status: 500 });
    }

    // Transform DB rows → PostDraft shape
    const posts: PostDraft[] = (data ?? []).map((row) => ({
      id: row.id,
      article: {
        title: row.article_title,
        url: row.article_url,
        pubDate: row.pub_date,
        source: row.source,
        description: row.description ?? '',
        imageUrl: row.image_url ?? undefined,
        summary: row.summary ?? '',
        location: row.article_location ?? undefined,
      },
      emojiTitle: row.emoji_title,
      facebookText: row.facebook_text,
      generatedImageUrl: row.generated_image_url ?? undefined,
      platformDrafts: row.platform_drafts ?? {},
      fetchTime: row.fetch_time,
      isDone: row.is_done ?? false,
      status: row.status ?? 'draft',
      scheduledAt: row.scheduled_at ?? undefined,
      publishedAt: row.published_at ?? undefined,
      pageId: row.page_id,
    }));

    // Get distinct sources for filter
    let sourcesQuery = supabase.from('posts').select('source').order('source');
    if (pageId) {
      sourcesQuery = sourcesQuery.eq('page_id', pageId);
    }
    const { data: sources } = await sourcesQuery;
    const distinctSources = [...new Set((sources ?? []).map((r) => r.source).filter(Boolean))];

    return NextResponse.json({
      posts,
      totalCount: count ?? 0,
      limit,
      offset,
      filters: {
        sources: distinctSources,
      },
    });
  } catch (err) {
    console.error('[posts] Error:', err);
    return NextResponse.json({ posts: [], totalCount: 0, error: 'Failed to load posts' }, { status: 500 });
  }
}
