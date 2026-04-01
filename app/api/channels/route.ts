/**
 * /api/channels — per-channel prompt and keyword config
 *
 * PATCH → update channel { id, systemPrompt?, userPrompt?, keywordConfig? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/app/lib/supabase';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { id, systemPrompt, userPrompt, keywordConfig } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (systemPrompt !== undefined) updates.system_prompt = systemPrompt || null;
    if (userPrompt !== undefined) updates.user_prompt = userPrompt || null;
    if (keywordConfig !== undefined) updates.keyword_config = keywordConfig || null;

    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from('page_channels')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      channel: {
        id: data.id,
        systemPrompt: data.system_prompt ?? null,
        userPrompt: data.user_prompt ?? null,
        keywordConfig: data.keyword_config ?? null,
      },
    });
  } catch (err) {
    console.error('[channels] PATCH error:', err);
    return NextResponse.json({ error: 'Failed to update channel' }, { status: 500 });
  }
}
