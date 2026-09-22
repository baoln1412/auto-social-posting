/**
 * The demo channel — one row, one kit, no spend. Seeded on first load of /studio so the
 * shell is never empty on a fresh machine. INSERT OR IGNORE, so an owner who renames or
 * repoints it keeps their edit forever.
 */
import { studioDb } from '../db';
import { listKitFiles, loadKitFile, validateKit } from '../kits/schema';

export const DEMO_CHANNEL_ID = 'demo';
export const DEMO_KIT_ID = 'demo';

/**
 * Seed the shipped kits from deploy/assets/kits, then the demo channel.
 *
 * INSERT OR IGNORE: the files are the shipped DEFAULT, the row is the live kit. An owner who
 * edits a kit in the editor keeps that edit forever; re-shipping a file never silently
 * overwrites their work.
 */
export function seedDemo(): void {
  const d = studioDb();

  for (const file of listKitFiles()) {
    const kit = loadKitFile(file) as { id?: string; name?: string; schemaVersion?: number };
    // A kit that does not validate is a bug in the pack, not something to store and render.
    const err = validateKit(kit);
    if (err || !kit.id) continue;
    const existing = d.prepare('SELECT json FROM studio_kits WHERE id=?').get(kit.id) as
      | { json: string }
      | undefined;

    // An existing row that does NOT validate was never an owner's edit — it is a leftover
    // stub (slice 0 seeded `demo` as {identity:{name}} before the schema existed). Preserving
    // it silently left two kits rendering the same card. A row that validates is left alone.
    let stale = false;
    if (existing) {
      try {
        stale = validateKit(JSON.parse(existing.json)) !== null;
      } catch {
        stale = true;
      }
    }

    if (!existing || stale) {
      d.prepare(
        `INSERT INTO studio_kits (id, name, schema_version, json) VALUES (?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, json=excluded.json,
           updated_at=(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
      ).run(kit.id, kit.name ?? kit.id, kit.schemaVersion ?? 1, JSON.stringify(kit));
    }
  }

  d.prepare(
    `INSERT OR IGNORE INTO studio_channels (id, name, market_id, kit_id, sources_json, tier_min)
     VALUES (?,?,?,?,?,?)`,
  ).run(DEMO_CHANNEL_ID, 'Kênh thử', null, DEMO_KIT_ID, JSON.stringify([{ type: 'demo' }]), 'demo');
}
