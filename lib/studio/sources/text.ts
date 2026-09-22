/**
 * The owner's own words. No fetch, no pool — the text IS the item.
 *
 * The ref is a hash of the text so the same paste always names the same item, and the text
 * itself is kept as a `source-text` row in studio_assets rather than stuffed into the ref.
 */
import { createHash } from 'node:crypto';
import { studioDb } from '../db';
import type { SourceItem } from '../steps/types';

export function textToItem(text: string): SourceItem {
  const clean = text.trim();
  const sha = createHash('sha256').update(clean).digest('hex').slice(0, 12);
  const first = clean.split(/(?<=[.!?…])\s/u)[0] ?? clean;
  return {
    id: `text:${sha}`,
    title: first.slice(0, 120) || '(không tiêu đề)',
    text: clean,
    comments: [],
  };
}

/** Keep the pasted text with the run, so the ref stays short and the Library can show it. */
export function saveRunText(runId: string, text: string): void {
  studioDb()
    .prepare(
      'INSERT OR REPLACE INTO studio_assets (id, run_id, kind, path, meta_json) VALUES (?,?,?,?,?)',
    )
    .run(`${runId}:source-text`, runId, 'source-text', null, JSON.stringify({ text }));
}

export function loadRunText(runId: string): string | null {
  const row = studioDb()
    .prepare('SELECT meta_json FROM studio_assets WHERE id=?')
    .get(`${runId}:source-text`) as { meta_json: string } | undefined;
  if (!row) return null;
  try {
    return (JSON.parse(row.meta_json) as { text?: string }).text ?? null;
  } catch {
    return null;
  }
}
