/**
 * PATCH /api/posts — Toggle the `is_done` status of a crime post.
 *
 * Body: { articleUrl: string, isDone: boolean }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/app/lib/supabase';

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const { articleUrl, isDone } = await request.json();

    if (!articleUrl || typeof isDone !== 'boolean') {
      return NextResponse.json(
        { error: 'articleUrl (string) and isDone (boolean) are required' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseServer();
    const { error } = await supabase
      .from('posts')
      .update({ is_done: isDone })
      .eq('article_url', articleUrl);

    if (error) {
      console.error('[posts] Toggle done error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, isDone });
  } catch (err) {
    console.error('[posts] PATCH error:', err);
    return NextResponse.json({ error: 'Failed to update post' }, { status: 500 });
  }
}
