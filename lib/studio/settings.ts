/**
 * A two-column key/value table for the handful of things Studio remembers that are not a
 * channel, a kit or a run. Its own table rather than a column somewhere: a Telegram chat id
 * belongs to the installation, not to any one channel.
 */
import { studioDb } from './db';

export function getSetting<T extends string | null>(key: string, fallback: T): string | T {
  const row = studioDb().prepare('SELECT value FROM studio_settings WHERE key=?').get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : fallback;
}

export function setSetting(key: string, value: string | null): void {
  const d = studioDb();
  if (value === null) {
    d.prepare('DELETE FROM studio_settings WHERE key=?').run(key);
    return;
  }
  d.prepare(
    `INSERT INTO studio_settings (key, value) VALUES (?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value,
       updated_at=(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
  ).run(key, value);
}
