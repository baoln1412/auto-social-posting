import Database from 'better-sqlite3';
import fs from 'node:fs';

/**
 * Sweep the rows the suite itself left behind.
 *
 * Every run creates channels named `<something> <Date.now()>` so two runs cannot collide, and
 * nothing ever deleted them: by 2026-09-24 the test database held 249 channels and 766 runs,
 * the nav's Thư viện count read 766, and the Kênh screenshot was a wall of junk. Left alone it
 * grows for the life of the project and slows every screen that lists a channel.
 *
 * Channels are matched by name — a 13-digit epoch on the end is this suite's own convention —
 * so the demo channel survives. Runs are swept wholesale except the demo one: this file is the
 * test database, every run in it was made by a test, and 434 of them left behind made the nav's
 * Thư viện count read 434. The demo run re-seeds itself on the next page render either way.
 */
const PATH = process.env.STUDIO_SQLITE_PATH ?? 'data/studio-test.db';

export default function sweep(): void {
  if (!fs.existsSync(PATH)) return;
  const db = new Database(PATH);
  try {
    db.exec(`DELETE FROM studio_steps  WHERE run_id  IN (SELECT id FROM studio_runs WHERE id <> 'demo-run-0001')`);
    db.exec(`DELETE FROM studio_assets WHERE run_id  IN (SELECT id FROM studio_runs WHERE id <> 'demo-run-0001')`);
    const gone = db.prepare(`DELETE FROM studio_runs WHERE id <> 'demo-run-0001'`).run().changes;

    const ids = db
      .prepare(`SELECT id FROM studio_channels WHERE name GLOB '*[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'`)
      .all() as { id: string }[];
    if (!ids.length) {
      if (gone) console.log(`swept ${gone} test runs from ${PATH}`);
      return;
    }
    const list = ids.map((r) => r.id);
    const holes = list.map(() => '?').join(',');
    const runs = db.prepare(`SELECT id FROM studio_runs WHERE channel_id IN (${holes})`).all(list) as { id: string }[];
    const runHoles = runs.map(() => '?').join(',') || "''";
    const runIds = runs.map((r) => r.id);

    db.transaction(() => {
      db.prepare(`DELETE FROM studio_steps WHERE run_id IN (${runHoles})`).run(runIds);
      db.prepare(`DELETE FROM studio_assets WHERE run_id IN (${runHoles})`).run(runIds);
      db.prepare(`DELETE FROM studio_runs WHERE channel_id IN (${holes})`).run(list);
      db.prepare(`DELETE FROM studio_channels WHERE id IN (${holes})`).run(list);
    })();
    console.log(`swept ${list.length} test channels and ${gone} runs from ${PATH}`);
  } finally {
    db.close();
  }
}
