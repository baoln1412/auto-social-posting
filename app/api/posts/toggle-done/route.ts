/**
 * PATCH /api/posts/toggle-done — Toggle the done state of a gold content item.
 *
 * Body: { articleUrl: string, isDone: boolean }
 */

import { NextRequest, NextResponse } from 'next/server';
import { setGoldStatus } from '@/app/lib/lake';

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const { articleUrl, isDone } = await request.json();
    if (!articleUrl || typeof isDone !== 'boolean') {
      return NextResponse.json(
        { error: 'articleUrl (string) and isDone (boolean) are required' },
        { status: 400 },
      );
    }

    await setGoldStatus(articleUrl, isDone ? 'published' : 'draft', isDone);
    return NextResponse.json({ success: true, isDone });
  } catch (err) {
    console.error('[posts] toggle-done error:', err);
    return NextResponse.json({ error: 'Failed to update content' }, { status: 500 });
  }
}
