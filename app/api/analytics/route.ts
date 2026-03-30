import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/app/lib/supabase';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const pageId = searchParams.get('pageId');
  if (!pageId) return NextResponse.json({ error: 'pageId required' }, { status: 400 });

  try {
    const supabase = getSupabaseServer();

    // Total counts by status
    const { data: allPosts } = await supabase
      .from('posts')
      .select('status, engagement, fetch_time')
      .eq('page_id', pageId);

    const posts = allPosts ?? [];
    const total = posts.length;
    const draft = posts.filter((p) => p.status === 'draft').length;
    const scheduled = posts.filter((p) => p.status === 'scheduled').length;
    const published = posts.filter((p) => p.status === 'published').length;
    const failed = posts.filter((p) => p.status === 'failed').length;

    // This week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const thisWeek = posts.filter((p) => {
      if (!p.fetch_time) return false;
      return new Date(p.fetch_time) >= weekAgo;
    }).length;

    // Aggregate engagement
    let likes = 0, comments = 0, shares = 0;
    for (const p of posts) {
      if (p.engagement && typeof p.engagement === 'object') {
        likes += (p.engagement as any).likes ?? 0;
        comments += (p.engagement as any).comments ?? 0;
        shares += (p.engagement as any).shares ?? 0;
      }
    }

    return NextResponse.json({
      stats: {
        total,
        draft,
        scheduled,
        published,
        failed,
        thisWeek,
        engagement: { likes, comments, shares },
      },
    });
  } catch (err) {
    console.error('Analytics error:', err);
    return NextResponse.json({ error: 'Analytics query failed' }, { status: 500 });
  }
}
