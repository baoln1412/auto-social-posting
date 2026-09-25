/**
 * What happened to a post after it went out.
 *
 * One row per fetch, not one per post: views only mean something as a series, and overwriting
 * yesterday's number makes "is this growing" unanswerable. The table is small — one run posts
 * to one or two places and gets read once a day.
 *
 * A reel and a feed post are different endpoints with different metric names, which is why
 * `isReel` is a parameter and not a guess.
 */
import { randomUUID } from 'node:crypto';
import { studioDb } from './db';
import { GRAPH, type GraphIO } from './publish/facebook';

export interface Metric {
  runId: string;
  where: string;
  remoteId: string;
  views: number;
  reach: number;
  reactions: number;
  fetchedAt: string;
}

type Raw = {
  run_id: string;
  where_to: string;
  remote_id: string;
  views: number;
  reach: number;
  reactions: number;
  fetched_at: string;
};

const toMetric = (r: Raw): Metric => ({
  runId: r.run_id,
  where: r.where_to,
  remoteId: r.remote_id,
  views: r.views,
  reach: r.reach,
  reactions: r.reactions,
  fetchedAt: r.fetched_at,
});

const realIO: GraphIO = { fetch: (...a) => fetch(...a), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

async function json(io: GraphIO, url: string): Promise<any> {
  const res = await io.fetch(url);
  const body = await res.json().catch(() => ({ error: { message: `Graph trả về ${res.status}.` } }));
  if (body?.error) throw new Error(body.error.message ?? `Graph trả về ${res.status}.`);
  return body;
}

const pick = (body: any, name: string): number =>
  Number((body?.data ?? []).find((d: any) => d.name === name)?.values?.[0]?.value ?? 0);

export async function readInsights(
  remoteId: string,
  token: string,
  isReel: boolean,
  io: GraphIO = realIO,
): Promise<{ views: number; reach: number; reactions: number }> {
  const auth = `access_token=${encodeURIComponent(token)}`;
  const insights = isReel
    ? await json(io, `${GRAPH()}/${remoteId}/video_insights?metric=total_video_views,total_video_impressions_unique&${auth}`)
    : await json(io, `${GRAPH()}/${remoteId}/insights?metric=post_impressions,post_impressions_unique&${auth}`);

  const views = isReel ? pick(insights, 'total_video_views') : pick(insights, 'post_impressions');
  const reach = isReel
    ? pick(insights, 'total_video_impressions_unique')
    : pick(insights, 'post_impressions_unique');

  const r = await json(io, `${GRAPH()}/${remoteId}?fields=reactions.summary(true)&${auth}`);
  return { views, reach, reactions: Number(r?.reactions?.summary?.total_count ?? 0) };
}

export function record(m: Omit<Metric, 'fetchedAt'> & { fetchedAt?: string }): Metric {
  const row: Metric = { ...m, fetchedAt: m.fetchedAt ?? new Date().toISOString() };
  studioDb()
    .prepare(
      `INSERT INTO studio_metrics (id, run_id, where_to, remote_id, views, reach, reactions, fetched_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    )
    .run(randomUUID(), row.runId, row.where, row.remoteId, row.views, row.reach, row.reactions, row.fetchedAt);
  return row;
}

/** Every fetch for one run, oldest first — the series. */
export function seriesFor(runId: string): Metric[] {
  return (
    studioDb()
      .prepare('SELECT * FROM studio_metrics WHERE run_id=? ORDER BY fetched_at, rowid')
      .all(runId) as Raw[]
  ).map(toMetric);
}

/** The newest fetch per run, for a list of runs. */
export function latestFor(runIds: string[]): Record<string, Metric> {
  if (!runIds.length) return {};
  const holes = runIds.map(() => '?').join(',');
  const rows = studioDb()
    .prepare(`SELECT * FROM studio_metrics WHERE run_id IN (${holes}) ORDER BY fetched_at, rowid`)
    .all(runIds) as Raw[];
  const out: Record<string, Metric> = {};
  for (const r of rows) out[r.run_id] = toMetric(r);
  return out;
}

/**
 * One pass over everything Studio has posted to Facebook, at most once a day per post.
 *
 * A failure here is logged and counted, never raised as an alert: an install without the
 * insights permission would otherwise write the same alert every day for ever, and the post
 * itself went out fine. What the owner needs to see is on the analytics page — a run with no
 * numbers next to one that has them.
 */
export async function fetchAllMetrics(now = new Date(), io?: GraphIO): Promise<{ read: number; failed: number }> {
  const { connectedPages } = await import('./publish/pages');
  const { windowRows } = await import('./publish/queue');
  const { getRun } = await import('./runs');

  const pages = await connectedPages();
  if (!pages.length) return { read: 0, failed: 0 };

  const since = new Date(now.getTime() - 12 * 3_600_000).toISOString();
  const sent = windowRows(new Date(0).toISOString(), now.toISOString()).filter(
    (r) => r.status === 'sent' && r.remoteId && r.where.startsWith('facebook:'),
  );

  let read = 0;
  let failed = 0;
  for (const row of sent) {
    const last = latestFor([row.runId])[row.runId];
    if (last && last.fetchedAt > since) continue;
    const page = pages.find((p) => p.id === row.where.slice('facebook:'.length));
    if (!page) continue;
    try {
      const isReel = Boolean(getRun(row.runId)?.steps.reel?.output);
      const got = await readInsights(row.remoteId!, page.token, isReel, io);
      record({ runId: row.runId, where: row.where, remoteId: row.remoteId!, ...got });
      read++;
    } catch (e) {
      console.error(`[studio] không đọc được số liệu ${row.remoteId}:`, e);
      failed++;
    }
  }
  return { read, failed };
}
