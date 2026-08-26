/**
 * Crime-series write path.
 *
 * Deliberately NOT /api/pipeline/gold. That route resolves every item through
 * `getSilverByIds` and does `if (!s) continue` — an item whose silver_id does not
 * resolve is dropped with no error — and it runs `bodyMismatched`, which compares
 * the body against the source article's title/description. A crime series has no
 * silver row (cases are researched, not crawled), so posting there would silently
 * vanish, and the mismatch guard would false-positive on every part.
 *
 * POST /api/crime/series
 *   body: { marketId, seriesTitle, parts: [{ part_no, emoji_title, body_text, ... }] }
 *   → writes one gold row per part, sharing series_id, ordered by part_no.
 *
 * GET  /api/crime/series?marketId=…
 *   → the market's parts grouped into series, newest first.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { insertGold, getGold, type GoldInput } from '@/app/lib/lake';
import { parseJsonBody } from '@/app/lib/jsonBody';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface PartInput {
  part_no: number;
  emoji_title: string;
  body_text: string;
  hashtags?: string;
  comment_1?: string;
  comment_2?: string;
  comment_3?: string;
  summary?: string;
  image_prompt?: string;
  source_name?: string;
  article_url?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { marketId, seriesTitle, parts } = (parsed.data ?? {}) as {
      marketId?: string;
      seriesTitle?: string;
      parts?: PartInput[];
    };
    if (!marketId) return NextResponse.json({ error: 'marketId is required' }, { status: 400 });
    if (!seriesTitle?.trim()) return NextResponse.json({ error: 'seriesTitle is required' }, { status: 400 });
    if (!Array.isArray(parts) || parts.length === 0) {
      return NextResponse.json({ error: 'parts[] is required' }, { status: 400 });
    }

    const bad = parts.find((p) => !p.emoji_title?.trim() || !p.body_text?.trim() || !p.part_no);
    if (bad) {
      return NextResponse.json(
        { error: 'every part needs part_no, emoji_title and body_text' },
        { status: 400 },
      );
    }

    const seriesId = randomUUID();
    const rows: GoldInput[] = parts
      .slice()
      .sort((a, b) => a.part_no - b.part_no)
      .map((p) => ({
        // Synthetic and unique: keeps insertGold's silver_id dedup meaningful for a
        // record that never passed through the silver layer.
        silver_id: `crime:${seriesId}:${p.part_no}`,
        market_id: marketId,
        series_id: seriesId,
        part_no: p.part_no,
        series_title: seriesTitle.trim(),
        emoji_title: p.emoji_title.trim(),
        body_text: p.body_text.trim(),
        hashtags: p.hashtags ?? '',
        comment_1: p.comment_1 ?? '',
        comment_2: p.comment_2 ?? '',
        comment_3: p.comment_3 ?? '',
        summary: p.summary ?? '',
        image_prompt: p.image_prompt ?? '',
        source_name: p.source_name ?? 'Hồ sơ vụ án',
        // Two jobs, both needing uniqueness per part: insertGold dedups on
        // (market_id, article_url), and setGoldStatus updates WHERE article_url = ?.
        // An empty or shared value means one kỳ's status flips its siblings too.
        // A source link gets a #ky-N fragment (still clickable); with no source we
        // synthesise a unique key rather than leave it blank.
        article_url: p.article_url
          ? `${p.article_url}#ky-${p.part_no}`
          : `crime://${seriesId}/ky-${p.part_no}`,
        article_title: seriesTitle.trim(),
        language: 'vi',
        topics: ['justice'],
      }));

    const inserted = await insertGold(rows);
    return NextResponse.json({ ok: true, seriesId, parts: rows.length, inserted });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save series' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const marketId = new URL(request.url).searchParams.get('marketId');
    if (!marketId) return NextResponse.json({ error: 'marketId is required' }, { status: 400 });

    // getGold has no series filter; the crime market is small enough to group here.
    const { rows } = await getGold({ marketId, limit: 500, offset: 0 });

    type OutPart = { id: string; articleUrl: string; partNo: number; emojiTitle: string; bodyText: string; hashtags: string; comment1: string; comment2: string; comment3: string; imagePrompt: string; status: string; words: number };
    type OutSeries = { seriesId: string; seriesTitle: string; generatedAt: string; parts: OutPart[] };
    const bySeries = new Map<string, OutSeries>();
    for (const r of rows) {
      if (!r.series_id) continue;
      const g: OutSeries = bySeries.get(r.series_id) ?? {
        seriesId: r.series_id,
        seriesTitle: r.series_title ?? r.emoji_title ?? '',
        generatedAt: r.generated_at ?? '',
        parts: [],
      };
      g.parts.push({
        id: r.id,
        articleUrl: r.article_url ?? '',
        partNo: r.part_no ?? 0,
        emojiTitle: r.emoji_title,
        bodyText: r.body_text,
        hashtags: r.hashtags,
        comment1: r.comment_1,
        comment2: r.comment_2,
        comment3: r.comment_3,
        imagePrompt: r.image_prompt,
        status: r.status,
        words: String(r.body_text ?? '').split(/\s+/).filter(Boolean).length,
      });
      bySeries.set(r.series_id, g);
    }

    const series = [...bySeries.values()]
      .map((s) => ({ ...s, parts: s.parts.sort((a, b) => a.partNo - b.partNo) }))
      .sort((a, b) => (b.generatedAt ?? '').localeCompare(a.generatedAt ?? ''));

    return NextResponse.json({ series, count: series.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load series' },
      { status: 500 },
    );
  }
}
