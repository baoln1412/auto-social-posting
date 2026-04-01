import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/app/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const pageId = searchParams.get('pageId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!pageId) {
      return NextResponse.json({ error: 'pageId is required' }, { status: 400 });
    }
    if (!from || !to) {
      return NextResponse.json({ error: 'from and to dates are required' }, { status: 400 });
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date formats' }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    const { error, count } = await supabase
      .from('posts')
      .delete({ count: 'exact' })
      .eq('page_id', pageId)
      .gte('pub_date', fromDate.toISOString())
      .lte('pub_date', toDate.toISOString());

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, deletedCount: count });
  } catch (err) {
    console.error('[posts/bulk] DELETE error:', err);
    return NextResponse.json({ error: 'Failed to bulk delete posts' }, { status: 500 });
  }
}
