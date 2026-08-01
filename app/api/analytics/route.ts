/**
 * GET /api/analytics?pageId= — content stats for a market (gold layer).
 */

import { NextResponse } from 'next/server';
import { getGoldStats } from '@/app/lib/lake';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const pageId = searchParams.get('pageId');
  if (!pageId) return NextResponse.json({ error: 'pageId required' }, { status: 400 });

  try {
    const s = await getGoldStats(pageId);
    return NextResponse.json({
      stats: {
        total: s.total,
        draft: s.draft,
        scheduled: s.scheduled,
        published: s.published,
        failed: s.failed,
        thisWeek: s.thisWeek,
        // Engagement isn't tracked in this display-only tool.
        engagement: { likes: 0, comments: 0, shares: 0 },
      },
    });
  } catch (err) {
    console.error('Analytics error:', err);
    return NextResponse.json({ error: 'Analytics query failed' }, { status: 500 });
  }
}
