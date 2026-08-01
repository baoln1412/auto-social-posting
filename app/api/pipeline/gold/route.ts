/**
 * POST /api/pipeline/gold
 *
 * Gold layer — LLM-generated content (what the site displays). The scheduled
 * pipeline generates content from silver rows (using the market's context +
 * post-writer skill) and POSTs the results here.
 *
 * body: { items: [{ silver_id, emoji_title, body_text, summary?, hook?, hashtags?,
 *                    image_prompt?, platform_drafts?, language? }] }
 *
 * Copies market_id / article_url / source / location from the silver row, inserts
 * into gold_content, and marks the silver row generated.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSilverByIds, insertGold, markSilverGenerated, getRecentGoldTexts, type GoldInput } from '@/app/lib/lake';
import { parseJsonBody } from '@/app/lib/jsonBody';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function stripDiacritics(s: string): string {
  // combining diacritical marks (U+0300–U+036F) left behind by NFKD decomposition
  return Array.from(s)
    .filter((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      return !(c >= 0x0300 && c <= 0x036f);
    })
    .join('');
}

function foldTokens(s: string): string[] {
  return stripDiacritics((s || '').normalize('NFKD'))
    .toLowerCase()
    .match(/[a-z0-9]{4,}/g) ?? [];
}

/** Document frequency of tokens across this market's recent posts — lets us tell
 * generic genre boilerplate ("chính phủ", "cộng đồng", the market's own country
 * name — appears in nearly every post) apart from topic-distinctive words
 * ("Manston", "leptospirosis", "deepfake" — appears in almost none). */
async function buildDf(marketId: string): Promise<{ df: Map<string, number>; n: number }> {
  const rows = await getRecentGoldTexts(marketId);
  const df = new Map<string, number>();
  for (const r of rows) {
    const toks = new Set(foldTokens(`${r.emoji_title ?? ''} ${r.summary ?? ''} ${r.body_text ?? ''}`));
    for (const t of toks) df.set(t, (df.get(t) ?? 0) + 1);
  }
  return { df, n: rows.length };
}

function distinctiveTokens(text: string, df: Map<string, number>, n: number, maxDfRatio = 0.12): Set<string> {
  const toks = foldTokens(text);
  if (n < 20) return new Set(toks); // too little history to learn boilerplate — fall back to raw tokens
  return new Set(toks.filter((t) => (df.get(t) ?? 0) / n <= maxDfRatio));
}

/** True when body_text shares zero distinctive vocabulary with this item's own
 * emoji_title/summary — the actual failure mode seen in production: the LLM
 * generates a correct title+summary for one article but pastes an unrelated
 * article's body text into the same item. */
function bodyMismatched(item: GoldItem, df: Map<string, number>, n: number): boolean {
  const ref = new Set([
    ...distinctiveTokens(item.emoji_title, df, n),
    ...distinctiveTokens(item.summary ?? '', df, n),
  ]);
  if (ref.size < 3) return false; // not enough signal to judge either way
  const body = distinctiveTokens(item.body_text, df, n);
  for (const t of ref) if (body.has(t)) return false;
  return true;
}

interface GoldItem {
  silver_id: string;
  emoji_title: string;
  body_text: string;
  summary?: string;
  hook?: string;
  hashtags?: string;
  comment_1?: string;
  comment_2?: string;
  image_prompt?: string;
  platform_drafts?: Record<string, string>;
  language?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const body = parsed.data;
    const items: GoldItem[] = body.items ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items[] is required' }, { status: 400 });
    }

    const silverRows = await getSilverByIds(items.map((i) => i.silver_id));
    const byId = new Map(silverRows.map((r) => [r.id, r]));

    const dfCache = new Map<string, { df: Map<string, number>; n: number }>();
    const rejected: { silver_id: string; reason: string }[] = [];
    const goldRows: GoldInput[] = [];

    for (const i of items) {
      const s = byId.get(i.silver_id);
      if (!s) continue;

      if (!dfCache.has(s.market_id)) dfCache.set(s.market_id, await buildDf(s.market_id));
      const { df, n } = dfCache.get(s.market_id)!;
      if (bodyMismatched(i, df, n)) {
        rejected.push({
          silver_id: i.silver_id,
          reason: 'body_text shares no distinctive vocabulary with this item\'s own emoji_title/summary — ' +
            'looks like content from a different article. Re-check the silver_id pairing and resend.',
        });
        continue;
      }

      goldRows.push({
        silver_id: s.id,
        market_id: s.market_id,
        article_url: s.article_url ?? undefined,
        article_title: s.title ?? undefined,
        source_name: s.source_name ?? '',
        location: s.location ?? undefined,
        image_url: s.image_url ?? undefined,
        image_urls: JSON.parse(s.image_urls ?? '[]'),
        topics: JSON.parse(s.topics ?? '[]'),
        emoji_title: i.emoji_title,
        body_text: i.body_text,
        summary: i.summary,
        hook: i.hook,
        hashtags: i.hashtags,
        comment_1: i.comment_1,
        comment_2: i.comment_2,
        image_prompt: i.image_prompt,
        platform_drafts: i.platform_drafts,
        language: i.language,
      } as GoldInput);
    }

    const inserted = await insertGold(goldRows);
    await markSilverGenerated(goldRows.map((g) => g.silver_id));

    return NextResponse.json({ ok: true, goldInserted: inserted, rejected });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[gold][POST]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
