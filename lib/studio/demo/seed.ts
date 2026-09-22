/**
 * The demo channel — one row, one kit, no spend. Seeded on first load of /studio so the
 * shell is never empty on a fresh machine. INSERT OR IGNORE, so an owner who renames or
 * repoints it keeps their edit forever.
 */
import { studioDb } from '../db';

export const DEMO_CHANNEL_ID = 'demo';
export const DEMO_KIT_ID = 'demo';

export function seedDemo(): void {
  const d = studioDb();
  d.prepare(
    'INSERT OR IGNORE INTO studio_kits (id, name, schema_version, json) VALUES (?,?,?,?)',
  ).run(DEMO_KIT_ID, 'Demo', 1, JSON.stringify({ identity: { name: 'Demo' } }));
  d.prepare(
    `INSERT OR IGNORE INTO studio_channels (id, name, market_id, kit_id, sources_json, tier_min)
     VALUES (?,?,?,?,?,?)`,
  ).run(DEMO_CHANNEL_ID, 'Kênh thử', null, DEMO_KIT_ID, JSON.stringify([{ type: 'demo' }]), 'demo');
}
