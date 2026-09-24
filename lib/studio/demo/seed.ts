/**
 * The demo channel — one row, one kit, no spend. Seeded on first load of /studio so the
 * shell is never empty on a fresh machine. INSERT OR IGNORE, so an owner who renames or
 * repoints it keeps their edit forever.
 */
import { join } from 'node:path';
import { studioDb } from '../db';
import { listKitFiles, loadKitFile, validateKit } from '../kits/schema';
import { DEMO_CARD_URL, DEMO_ITEM, DEMO_MP4_URL } from './steps';

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

    // Two reasons to replace a row that is already there.
    //
    // 1. It does not validate: it was never an owner's edit, it is a leftover stub (slice 0
    //    seeded `demo` as {identity:{name}} before the schema existed), and preserving it
    //    silently left two kits rendering the same card.
    // 2. The shipped kit has a higher `revision`: without this, a change to the pack reaches
    //    a fresh install and nowhere else. A bump replaces the stored copy, so an owner who
    //    has customised a shipped kit should duplicate it under a new id first.
    let stale = false;
    if (existing) {
      try {
        const stored = JSON.parse(existing.json) as { revision?: number };
        stale =
          validateKit(stored) !== null ||
          ((kit as { revision?: number }).revision ?? 1) > (stored.revision ?? 1);
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

  seedDemoRun();
}

/**
 * One finished demo run, so the first visit — and the tour — sees a walk that ends in a
 * video instead of five screens saying nothing has happened yet.
 *
 * The rows are written from the same fixtures the demo steps return, not by running them:
 * seeding must not spend a render. The image step is the exception in the other direction —
 * the shipped card.png IS a composed card, and the Ảnh screen re-renders live previews
 * through the real (free) step the moment a control moves.
 */
export const DEMO_RUN_ID = 'demo-run-0001';

export function seedDemoRun(): void {
  const d = studioDb();
  const have = d.prepare('SELECT id FROM studio_runs WHERE id=?').get(DEMO_RUN_ID);
  if (have) return;

  d.prepare(
    `INSERT INTO studio_runs (id, channel_id, item_ref, status, current_step, overrides_json, selection_json)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(
    DEMO_RUN_ID,
    DEMO_CHANNEL_ID,
    'demo:1',
    'done',
    'publish',
    '{}',
    JSON.stringify({ commentIds: ['c1', 'c2', 'c4'], hideUnselected: false }),
  );

  const step = (name: string, output: unknown, gate: unknown = null, note = 'dữ liệu mẫu') =>
    d.prepare(
      `INSERT OR REPLACE INTO studio_steps
         (id, run_id, name, status, input_ref, output_ref, cost_usd, gate_json, error, started_at, finished_at)
       VALUES (?,?,?,?,?,?,?,?,?,(strftime('%Y-%m-%dT%H:%M:%fZ','now')),(strftime('%Y-%m-%dT%H:%M:%fZ','now')))`,
    ).run(
      `${DEMO_RUN_ID}:${name}`,
      DEMO_RUN_ID,
      name,
      'ok',
      JSON.stringify({ note }),
      JSON.stringify(output),
      0,
      gate ? JSON.stringify(gate) : null,
      null,
    );

  step('fetch', DEMO_ITEM);
  step('draft', {
    title: DEMO_ITEM.title,
    text: DEMO_ITEM.text,
    hashtags: ['#dinhcuuc', '#duhocuc', '#visa'],
    sourceUrl: DEMO_ITEM.url,
  }, { checked: 3, findings: [] });
  step('image', { url: DEMO_CARD_URL, kind: 'png' });
  step('reel', {
    url: DEMO_MP4_URL,
    path: join(process.cwd(), 'public', 'studio-demo', 'demo.mp4'),
    kind: 'mp4',
    durationSec: 6,
  });
  step('publish', { library: true, telegram: 'off', at: new Date().toISOString() });

  d.prepare(
    `INSERT OR IGNORE INTO studio_assets (id, run_id, kind, path, bytes, meta_json)
     VALUES (?,?,?,?,?,?)`,
  ).run(
    `${DEMO_RUN_ID}-mp4`,
    DEMO_RUN_ID,
    'mp4',
    join(process.cwd(), 'public', 'studio-demo', 'demo.mp4'),
    0,
    JSON.stringify({ url: DEMO_MP4_URL }),
  );
}
