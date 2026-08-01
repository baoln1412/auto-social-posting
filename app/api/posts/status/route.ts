/**
 * PATCH /api/posts/status — update the status of a gold content item.
 *
 * Body: { articleUrl, status: 'draft'|'scheduled'|'published'|'failed' }
 * (Publishing is disabled in this tool; status is used only to mark items
 * reviewed/done in the display-only dashboard.)
 */

import { NextResponse } from 'next/server';
import { setGoldStatus } from '@/app/lib/lake';

export async function PATCH(req: Request) {
  try {
    const { articleUrl, status } = await req.json();

    if (!articleUrl || !status) {
      return NextResponse.json({ error: 'articleUrl and status required' }, { status: 400 });
    }

    const validStatuses = ['draft', 'scheduled', 'published', 'failed'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
    }

    await setGoldStatus(articleUrl, status, status === 'published');
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Status update error:', err);
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
  }
}
