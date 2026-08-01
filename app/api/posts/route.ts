/**
 * GET /api/posts — Load generated content (gold layer) for a market.
 *
 * Reads from the DuckDB gold_content layer and maps rows to the PostDraft shape
 * the dashboard already renders. (Markets are content_pages; pageId === marketId.)
 *
 * Query params: pageId (required), source, from, to, done, keyword, limit, offset.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGold, deleteGold, moveGold, setGoldImages } from '@/app/lib/lake';
import { PostDraft } from '@/app/types';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const pageId = searchParams.get('pageId');
    if (!pageId) {
      return NextResponse.json({ posts: [], totalCount: 0, error: 'pageId is required' }, { status: 400 });
    }

    const limit = Math.min(parseInt(searchParams.get('limit') ?? '30', 10), 200);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);
    const doneParam = searchParams.get('done');

    const { rows, total, sources } = await getGold({
      marketId: pageId,
      source: searchParams.get('source') ?? undefined,
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
      keyword: searchParams.get('keyword') ?? undefined,
      topic: searchParams.get('topic') ?? undefined,
      done: doneParam === 'done' ? 'done' : doneParam === 'not_done' ? 'not_done' : undefined,
      limit,
      offset,
    });

    const posts: PostDraft[] = rows.map((row) => {
      let platformDrafts: Record<string, string> = {};
      try { platformDrafts = JSON.parse(row.platform_drafts ?? '{}'); } catch { /* ignore */ }
      return {
        id: row.id,
        article: {
          title: row.article_title ?? row.emoji_title ?? '',
          url: row.article_url ?? '',
          pubDate: row.pub_date,
          source: row.source_name ?? '',
          description: row.summary ?? '',
          imageUrl: row.image_url ?? undefined,
          imageUrls: JSON.parse(row.image_urls ?? '[]'),
          summary: row.summary ?? '',
          location: row.location ?? undefined,
        },
        emojiTitle: row.emoji_title,
        facebookText: row.body_text,
        hashtags: row.hashtags ?? undefined,
        hook: row.hook ?? undefined,
        comment1: row.comment_1 ?? undefined,
        comment2: row.comment_2 ?? undefined,
        imagePrompt: row.image_prompt ?? undefined,
        topics: (() => { try { return JSON.parse(row.topics ?? '[]'); } catch { return []; } })(),
        platformDrafts,
        fetchTime: row.generated_at,
        isDone: row.is_done ?? false,
        status: row.status ?? 'draft',
        pageId: row.market_id,
      };
    });

    return NextResponse.json({
      posts,
      totalCount: total,
      limit,
      offset,
      filters: { sources },
    });
  } catch (err) {
    console.error('[posts] Error:', err);
    return NextResponse.json({ posts: [], totalCount: 0, error: 'Failed to load content' }, { status: 500 });
  }
}

/**
 * PATCH /api/posts —
 *   • Save card images:  { id, imageUrl, insetUrl }  (persist hand-picked images)
 *   • Move to a market:  { ids: string[], marketId }
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({}));

    if (body.id && (body.imageUrl !== undefined || body.insetUrl !== undefined)) {
      await setGoldImages(body.id, body.imageUrl ?? '', body.insetUrl ?? '');
      return NextResponse.json({ ok: true, saved: true });
    }

    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
    const marketId: string = body.marketId ?? '';
    if (ids.length === 0 || !marketId) {
      return NextResponse.json({ error: 'ids[] and marketId are required' }, { status: 400 });
    }
    const moved = await moveGold(ids, marketId);
    return NextResponse.json({ ok: true, moved });
  } catch (err) {
    console.error('[posts][PATCH]', err);
    return NextResponse.json({ error: 'Failed to update posts' }, { status: 500 });
  }
}

/** DELETE /api/posts — remove gold posts by id. Body: { ids: string[] } or ?id= */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const single = searchParams.get('id');
    let ids: string[] = single ? [single] : [];
    if (!single) {
      const body = await request.json().catch(() => ({}));
      ids = Array.isArray(body.ids) ? body.ids : [];
    }
    if (ids.length === 0) {
      return NextResponse.json({ error: 'id or ids[] is required' }, { status: 400 });
    }
    const deleted = await deleteGold(ids);
    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    console.error('[posts][DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete posts' }, { status: 500 });
  }
}
