/**
 * The bell's contents: every failure worth telling the owner about.
 *
 * The 4-hourly pipeline's real problem today is silence — a step dies at 4am and the only
 * trace is a log nobody reads. A row here is that trace, and it is written before anything is
 * sent, so a Telegram that is off, unconfigured or broken costs the record nothing.
 *
 * `notify` is a parameter rather than an import so the caller decides what "tell someone"
 * means, and so a test can watch it happen without a bot.
 */
import { randomUUID } from 'node:crypto';
import { studioDb } from './db';
import { deliveryOn, sendMessage } from './deliver';

export type AlertKind = 'render' | 'publish' | 'pipeline';

export interface Alert {
  id: string;
  runId: string | null;
  kind: AlertKind;
  message: string;
  seen: boolean;
  createdAt: string;
}

type Raw = {
  id: string;
  run_id: string | null;
  kind: string;
  message: string;
  seen: number;
  created_at: string;
};

const toAlert = (r: Raw): Alert => ({
  id: r.id,
  runId: r.run_id,
  kind: r.kind as AlertKind,
  message: r.message,
  seen: Boolean(r.seen),
  createdAt: r.created_at,
});

const LABEL: Record<AlertKind, string> = {
  render: 'Dựng video',
  publish: 'Đăng bài',
  pipeline: 'Nguồn tự động',
};

export async function raise(
  kind: AlertKind,
  message: string,
  runId?: string | null,
  notify?: (text: string) => Promise<void>,
): Promise<Alert> {
  const a: Alert = {
    id: randomUUID(),
    runId: runId ?? null,
    kind,
    message,
    seen: false,
    createdAt: new Date().toISOString(),
  };
  studioDb()
    .prepare('INSERT INTO studio_alerts (id, run_id, kind, message, seen, created_at) VALUES (?,?,?,?,0,?)')
    .run(a.id, a.runId, a.kind, a.message, a.createdAt);

  if (notify) {
    // The record is already on disk. A notifier that throws is a notifier that failed, and
    // nothing more than that.
    await notify(`❌ ${LABEL[kind]}: ${message}${a.runId ? `\n\nLượt chạy: ${a.runId}` : ''}`).catch(
      (e) => console.error('[studio] không gửi được cảnh báo:', e),
    );
  }
  return a;
}

export function recent(limit = 20): Alert[] {
  return (
    studioDb().prepare('SELECT * FROM studio_alerts ORDER BY created_at DESC, rowid DESC LIMIT ?').all(limit) as Raw[]
  ).map(toAlert);
}

export function unseenCount(): number {
  return (studioDb().prepare('SELECT COUNT(*) AS n FROM studio_alerts WHERE seen = 0').get() as { n: number }).n;
}

/** All of them, or the ones named. */
export function markSeen(ids?: string[]): number {
  const d = studioDb();
  if (!ids) return d.prepare('UPDATE studio_alerts SET seen = 1 WHERE seen = 0').run().changes;
  if (!ids.length) return 0;
  const holes = ids.map(() => '?').join(',');
  return d.prepare(`UPDATE studio_alerts SET seen = 1 WHERE id IN (${holes})`).run(ids).changes;
}

/**
 * The notifier every caller in the app passes. A no-op until the owner has connected a chat
 * and switched sending on, which is the only state a fresh install is in.
 */
export async function telegram(text: string): Promise<void> {
  if (!deliveryOn()) return;
  await sendMessage(text);
}
