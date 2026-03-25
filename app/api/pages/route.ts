/**
 * /api/pages — CRUD for content pages.
 *
 * GET    → list all pages
 * POST   → create a new page { name, systemPrompt }
 * PATCH  → update page { id, name?, systemPrompt?, platformPrompts?, keywordConfig? }
 * DELETE → remove page by id (query param ?id=...)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/app/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from('content_pages')
      .select('*')
      .order('created_at');

    if (error) throw error;

    const pages = (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      systemPrompt: row.system_prompt,
      userPrompt: row.user_prompt ?? '',
      platformPrompts: row.platform_prompts ?? {},
      keywordConfig: row.keyword_config ?? { tier1: [], tier2: [], minScore: 1 },
      lastFetchTime: row.last_fetch_time,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json({ pages });
  } catch (err) {
    console.error('[pages] GET error:', err);
    return NextResponse.json({ pages: [], error: 'Failed to load pages' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { name, systemPrompt, userPrompt, platformPrompts, keywordConfig } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from('content_pages')
      .insert({
        name: name.trim(),
        system_prompt: systemPrompt ?? '',
        user_prompt: userPrompt ?? '',
        platform_prompts: platformPrompts ?? {},
        keyword_config: keywordConfig ?? { tier1: [], tier2: [], minScore: 1 },
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      page: {
        id: data.id,
        name: data.name,
        systemPrompt: data.system_prompt,
        userPrompt: data.user_prompt ?? '',
        platformPrompts: data.platform_prompts ?? {},
        keywordConfig: data.keyword_config ?? { tier1: [], tier2: [], minScore: 1 },
        lastFetchTime: data.last_fetch_time,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    }, { status: 201 });
  } catch (err) {
    console.error('[pages] POST error:', err);
    return NextResponse.json({ error: 'Failed to create page' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { id, name, systemPrompt, userPrompt, platformPrompts, keywordConfig, lastFetchTime } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name.trim();
    if (systemPrompt !== undefined) updates.system_prompt = systemPrompt;
    if (userPrompt !== undefined) updates.user_prompt = userPrompt;
    if (platformPrompts !== undefined) updates.platform_prompts = platformPrompts;
    if (keywordConfig !== undefined) updates.keyword_config = keywordConfig;
    if (lastFetchTime !== undefined) updates.last_fetch_time = lastFetchTime;

    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from('content_pages')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      page: {
        id: data.id,
        name: data.name,
        systemPrompt: data.system_prompt,
        userPrompt: data.user_prompt ?? '',
        platformPrompts: data.platform_prompts ?? {},
        keywordConfig: data.keyword_config ?? { tier1: [], tier2: [], minScore: 1 },
        lastFetchTime: data.last_fetch_time,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    });
  } catch (err) {
    console.error('[pages] PATCH error:', err);
    return NextResponse.json({ error: 'Failed to update page' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const supabase = getSupabaseServer();
    const { error } = await supabase.from('content_pages').delete().eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[pages] DELETE error:', err);
    return NextResponse.json({ error: 'Failed to delete page' }, { status: 500 });
  }
}
