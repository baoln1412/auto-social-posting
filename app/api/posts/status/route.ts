import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { articleUrl, status, scheduledAt } = body;

    if (!articleUrl || !status) {
      return NextResponse.json({ error: 'articleUrl and status required' }, { status: 400 });
    }

    const validStatuses = ['draft', 'scheduled', 'published', 'failed'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { status };

    if (status === 'scheduled' && scheduledAt) {
      updateData.scheduled_at = scheduledAt;
    }

    if (status === 'published') {
      updateData.published_at = new Date().toISOString();
      updateData.is_done = true;
    }

    if (status === 'draft') {
      updateData.scheduled_at = null;
      updateData.is_done = false;
    }

    const { error } = await supabase
      .from('posts')
      .update(updateData)
      .eq('article_url', articleUrl);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Status update error:', err);
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
  }
}
