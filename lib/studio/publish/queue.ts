/**
 * `studio_publish` — the row that says a thing was asked to go out, and what happened.
 *
 * A row, not a promise held in memory: the Next server restarts, and "Đăng lúc 18:00" has to
 * survive that or the button was a lie. v2's publish screen recorded the intent and nothing
 * acted on it; this is the half that acts.
 *
 * `tick` takes its sender, so the loop that runs every minute and the test that drives a fake
 * clock exercise exactly the same code.
 */
import { randomUUID } from 'node:crypto';
import { raise, telegram } from '../alerts';
import { studioDb } from '../db';
import { scheduleTimes } from '../pipeline/schedule';
import type { Where } from '../steps/publish';

export type PublishStatus = 'pending' | 'sent' | 'failed';

export interface PublishRow {
  id: string;
  runId: string;
  where: Where;
  /** ISO. When it should go out — now, or a slot in the future. */
  at: string;
  status: PublishStatus;
  remoteId: string | null;
  firstComment: string | null;
  error: string | null;
  createdAt: string;
}

type Raw = {
  id: string;
  run_id: string;
  where_to: string;
  at: string;
  status: string;
  remote_id: string | null;
  first_comment: string | null;
  error: string | null;
  created_at: string;
};

const toRow = (r: Raw): PublishRow => ({
  id: r.id,
  runId: r.run_id,
  where: r.where_to as Where,
  at: r.at,
  status: r.status as PublishStatus,
  remoteId: r.remote_id,
  firstComment: r.first_comment,
  error: r.error,
  createdAt: r.created_at,
});

export function enqueue(r: {
  runId: string;
  where: Where;
  at: string;
  firstComment?: string | null;
}): PublishRow {
  const row: PublishRow = {
    id: randomUUID(),
    runId: r.runId,
    where: r.where,
    at: r.at,
    status: 'pending',
    remoteId: null,
    firstComment: r.firstComment?.trim() || null,
    error: null,
    createdAt: new Date().toISOString(),
  };
  studioDb()
    .prepare(
      `INSERT INTO studio_publish (id, run_id, where_to, at, status, first_comment, created_at)
       VALUES (?,?,?,?,?,?,?)`,
    )
    .run(row.id, row.runId, row.where, row.at, row.status, row.firstComment, row.createdAt);
  return row;
}

export function rowsFor(runId: string): PublishRow[] {
  return (
    studioDb().prepare('SELECT * FROM studio_publish WHERE run_id=? ORDER BY at').all(runId) as Raw[]
  ).map(toRow);
}

/** Everything queued in a window, whatever its status — what the calendar draws. */
export function windowRows(from: string, to: string): PublishRow[] {
  return (
    studioDb()
      .prepare('SELECT * FROM studio_publish WHERE at >= ? AND at <= ? ORDER BY at')
      .all(from, to) as Raw[]
  ).map(toRow);
}

/** Pending rows whose time has come. */
export function due(now = new Date()): PublishRow[] {
  return (
    studioDb()
      .prepare(`SELECT * FROM studio_publish WHERE status='pending' AND at <= ? ORDER BY at`)
      .all(now.toISOString()) as Raw[]
  ).map(toRow);
}

export function markSent(id: string, remoteId: string | null): void {
  studioDb().prepare(`UPDATE studio_publish SET status='sent', remote_id=?, error=NULL WHERE id=?`).run(remoteId, id);
}

export function markFailed(id: string, error: string): void {
  studioDb().prepare(`UPDATE studio_publish SET status='failed', error=? WHERE id=?`).run(error, id);
}

export type Sender = (row: PublishRow) => Promise<{ remoteId: string | null }>;

/** Send everything that is due. One failure is one row's failure, never the loop's. */
export async function tick(send: Sender, now = new Date()): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const row of due(now)) {
    try {
      const out = await send(row);
      markSent(row.id, out.remoteId);
      sent++;
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      markFailed(row.id, why);
      // The publisher's own catch: a post that never went out is exactly the thing the 4am
      // silence used to swallow.
      await raise('publish', `Không gửi được tới ${row.where}. ${why}`, row.runId, telegram);
      failed++;
    }
  }
  return { sent, failed };
}

/**
 * The next time in the machine's own cadence that nothing is already going out at.
 *
 * Local time, deliberately: the cadence comes from a launchd plist that fires in local time,
 * and an owner reading "18:00" means their own evening.
 */
export function nextSlot(taken: string[], now = new Date(), times = scheduleTimes()): string | null {
  if (!times.length) return null;
  const busy = new Set(taken.map((t) => new Date(t).getTime()));
  for (let day = 0; day < 14; day++) {
    for (const hhmm of times) {
      const [h, m] = hhmm.split(':').map(Number);
      const d = new Date(now);
      d.setDate(d.getDate() + day);
      d.setHours(h, m, 0, 0);
      if (d.getTime() > now.getTime() && !busy.has(d.getTime())) return d.toISOString();
    }
  }
  return null;
}
