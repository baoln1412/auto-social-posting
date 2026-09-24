/**
 * The lake as a source: a market's own generated posts.
 *
 * Reads through `app/lib/lake.ts` and never opens data/lake.duckdb itself — DuckDB is
 * single-writer and the Next server is the one process allowed to hold it open.
 */
import { getGold } from '@/app/lib/lake';
import type { Comment, SourceItem } from '../steps/types';

/** A gold row → the common item shape. Pure, so it is tested without the lake. */
export function goldRowToItem(row: Record<string, any>): SourceItem {
  const comments: Comment[] = [row.comment_1, row.comment_2, row.comment_3]
    .map((t, i) => ({ id: `c${i + 1}`, text: String(t ?? '').trim(), score: null, depth: 0 }))
    .filter((c) => c.text.length > 0);

  return {
    id: `gold:${row.id}`,
    title: row.emoji_title ?? row.article_title ?? '(không tiêu đề)',
    text: row.body_text ?? '',
    url: row.article_url ?? undefined,
    source: row.source_name ?? undefined,
    comments,
    // The article's own pictures, for the Ảnh step to choose between. A JSON array in the
    // lake, a bare column, or nothing — all three shapes exist in rows already written.
    images: (() => {
      const many = (() => {
        try {
          const v = JSON.parse(String(row.image_urls ?? '[]'));
          return Array.isArray(v) ? v.map(String) : [];
        } catch {
          return String(row.image_urls ?? '')
            .split(/[\n,]/)
            .map((x) => x.trim());
        }
      })();
      return [...new Set([row.image_url, ...many].filter((u): u is string => typeof u === 'string' && /^https?:/.test(u)))];
    })(),
  };
}

export async function listGold(marketId: string, limit: number): Promise<SourceItem[]> {
  const { rows } = await getGold({ marketId, limit });
  return rows.map(goldRowToItem);
}

export async function getGoldItem(ref: string, marketId: string): Promise<SourceItem | null> {
  const want = ref.replace(/^gold:/, '');
  // ponytail: scans the newest 200 instead of a by-id read — lake.ts has no gold-by-id
  // export and the picker only ever offers recent rows. Add one there if that stops holding.
  const { rows } = await getGold({ marketId, limit: 200 });
  const row = rows.find((r) => String(r.id) === want);
  return row ? goldRowToItem(row) : null;
}
