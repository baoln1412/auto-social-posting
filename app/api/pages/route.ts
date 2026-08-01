/**
 * /api/pages — CRUD for markets (a "content page" IS a market in the
 * immigration tool: country code + official name + per-market generation
 * context: glossary, wording rules, writing style, language).
 *
 * GET    → list all markets
 * POST   → create a market { name, countryCode?, countryName?, language?, systemPrompt? }
 * PATCH  → update a market { id, name?, countryCode?, countryName?, language?,
 *                            systemPrompt?, userPrompt?, platformPrompts?, keywordConfig?,
 *                            glossary?, wordingRules?, writingStyle? }
 * DELETE → remove a market by id (query param ?id=...)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/app/lib/supabase';
import { DEFAULT_ENABLED_TOPICS, validTopics } from '@/app/lib/topics';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Map a DB row → the API/market shape used by the frontend. */
function mapPage(row: Record<string, any>) {
  return {
    id: row.id,
    name: row.name,
    countryCode: row.country_code ?? '',
    countryName: row.country_name ?? '',
    language: row.language ?? 'vi',
    systemPrompt: row.system_prompt ?? '',
    userPrompt: row.user_prompt ?? '',
    platformPrompts: row.platform_prompts ?? {},
    keywordConfig: row.keyword_config ?? { tier1: [], tier2: [], minScore: 1 },
    glossary: row.glossary ?? {},
    wordingRules: row.wording_rules ?? '',
    writingStyle: row.writing_style ?? '',
    // Stored '[]' (empty) means "no explicit selection" → treat as all topics enabled.
    enabledTopics:
      Array.isArray(row.enabled_topics) && row.enabled_topics.length > 0
        ? row.enabled_topics
        : DEFAULT_ENABLED_TOPICS,
    lastFetchTime: row.last_fetch_time,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from('content_pages')
      .select('*')
      .order('created_at');

    if (error) throw error;

    return NextResponse.json({ pages: (data ?? []).map(mapPage) });
  } catch (err) {
    console.error('[pages] GET error:', err);
    return NextResponse.json({ pages: [], error: 'Failed to load markets' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { name, countryCode, countryName, language, systemPrompt, userPrompt, platformPrompts, keywordConfig } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from('content_pages')
      .insert({
        name: name.trim(),
        country_code: (countryCode ?? '').trim(),
        country_name: (countryName ?? '').trim(),
        language: (language ?? 'vi').trim(),
        system_prompt: systemPrompt ?? '',
        user_prompt: userPrompt ?? '',
        platform_prompts: platformPrompts ?? {},
        keyword_config: keywordConfig ?? { tier1: [], tier2: [], minScore: 1 },
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ page: mapPage(data) }, { status: 201 });
  } catch (err) {
    console.error('[pages] POST error:', err);
    return NextResponse.json({ error: 'Failed to create market' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const {
      id, name, countryCode, countryName, language,
      systemPrompt, userPrompt, platformPrompts, keywordConfig,
      glossary, wordingRules, writingStyle, lastFetchTime, enabledTopics,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name.trim();
    if (countryCode !== undefined) updates.country_code = countryCode.trim();
    if (countryName !== undefined) updates.country_name = countryName.trim();
    if (language !== undefined) updates.language = language.trim();
    if (systemPrompt !== undefined) updates.system_prompt = systemPrompt;
    if (userPrompt !== undefined) updates.user_prompt = userPrompt;
    if (platformPrompts !== undefined) updates.platform_prompts = platformPrompts;
    if (keywordConfig !== undefined) updates.keyword_config = keywordConfig;
    if (glossary !== undefined) updates.glossary = glossary;
    if (wordingRules !== undefined) updates.wording_rules = wordingRules;
    if (writingStyle !== undefined) updates.writing_style = writingStyle;
    if (enabledTopics !== undefined) updates.enabled_topics = validTopics(enabledTopics);
    if (lastFetchTime !== undefined) updates.last_fetch_time = lastFetchTime;

    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from('content_pages')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ page: mapPage(data) });
  } catch (err) {
    console.error('[pages] PATCH error:', err);
    return NextResponse.json({ error: 'Failed to update market' }, { status: 500 });
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
    return NextResponse.json({ error: 'Failed to delete market' }, { status: 500 });
  }
}
