import { studioDb } from './db';
import { getRun, previewStep } from './runs';
import { visibleChannelIds } from './visible';
import type { Tier } from './tier';
import { ALL_STEPS, type StepName } from './steps/types';

/**
 * What the lake cannot know about a post: its latest Studio run. One query for a page of
 * posts, keyed by item_ref (`gold:<post.id>`), so the library draws progress dots, the reel
 * and the right action on each PostCard without a request per card.
 */
export interface RunSummary {
  id: string;
  status: string;
  /** Steps finished, in rail order. */
  done: StepName[];
  /** The reel's MP4 when the Video step is done. */
  reel: string | null;
  /** The composed first frame, when the Video step can draw one. */
  frame: string | null;
}

function parse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function runsForItems(items: string[], t: Tier): Promise<Record<string, RunSummary>> {
  const refs = [...new Set(items.filter(Boolean))];
  if (refs.length === 0) return {};
  const visible = visibleChannelIds(t);
  const d = studioDb();
  const rows = d
    .prepare(
      `SELECT id, item_ref, status, channel_id FROM studio_runs
       WHERE item_ref IN (${refs.map(() => '?').join(',')}) ORDER BY created_at DESC`,
    )
    .all(...refs) as { id: string; item_ref: string; status: string; channel_id: string }[];

  const out: Record<string, RunSummary> = {};
  for (const r of rows) {
    if (out[r.item_ref] || !visible.has(r.channel_id)) continue; // newest wins
    const rec = getRun(r.id);
    if (!rec) continue;
    const done = ALL_STEPS.filter((s) => rec.steps[s]?.status === 'ok');
    const mp4 = d
      .prepare(`SELECT meta_json FROM studio_assets WHERE run_id=? AND kind='mp4' ORDER BY created_at DESC LIMIT 1`)
      .get(r.id) as { meta_json: string } | undefined;
    let frame: string | null = null;
    if (done.includes('draft')) {
      const p = await previewStep(rec, 'reel').catch(() => null);
      const data = p?.data as { firstFrameUrl?: string } | null;
      frame = p?.kind === 'scenes' && data?.firstFrameUrl ? data.firstFrameUrl : null;
    }
    out[r.item_ref] = {
      id: r.id,
      status: r.status,
      done,
      reel: mp4 ? (parse<{ url?: string }>(mp4.meta_json, {}).url ?? null) : null,
      frame,
    };
  }
  return out;
}
