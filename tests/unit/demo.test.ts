import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-demo-'));
process.env.STUDIO_SQLITE_PATH = path.join(dir, 'test.db');

const { studioDb, resetStudioDbForTests } = await import('@/lib/studio/db');
const { seedDemo, DEMO_CHANNEL_ID, DEMO_KIT_ID } = await import('@/lib/studio/demo/seed');

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => resetStudioDbForTests());

describe('seedDemo()', () => {
  it('creates the demo channel and its kit', () => {
    seedDemo();
    const d = studioDb();
    expect(d.prepare('SELECT name FROM studio_channels WHERE id=?').get(DEMO_CHANNEL_ID)).toBeTruthy();
    expect(d.prepare('SELECT name FROM studio_kits WHERE id=?').get(DEMO_KIT_ID)).toBeTruthy();
  });

  it('is safe to call on every page load', () => {
    seedDemo();
    seedDemo();
    seedDemo();
    const d = studioDb();
    expect(d.prepare('SELECT COUNT(*) c FROM studio_channels').get()).toEqual({ c: 1 });
    // Both shipped kits, seeded once each however many times seedDemo runs.
    expect(d.prepare('SELECT COUNT(*) c FROM studio_kits').get()).toEqual({ c: 2 });
  });

  it('marks the demo channel as reachable by the demo tier', () => {
    seedDemo();
    const row: any = studioDb()
      .prepare('SELECT tier_min, kit_id FROM studio_channels WHERE id=?')
      .get(DEMO_CHANNEL_ID);
    expect(row.tier_min).toBe('demo');
    expect(row.kit_id).toBe(DEMO_KIT_ID);
  });

  it('never overwrites an edited demo channel', () => {
    seedDemo();
    const d = studioDb();
    d.prepare('UPDATE studio_channels SET name=? WHERE id=?').run('Renamed', DEMO_CHANNEL_ID);
    seedDemo();
    expect(d.prepare('SELECT name FROM studio_channels WHERE id=?').get(DEMO_CHANNEL_ID)).toEqual({
      name: 'Renamed',
    });
  });
});

describe('the shipped kits', () => {
  it('seeds both, with their real tabs and not a stub', () => {
    seedDemo();
    const rows = studioDb().prepare('SELECT id, json FROM studio_kits ORDER BY id').all() as {
      id: string;
      json: string;
    }[];
    expect(rows.map((r) => r.id)).toEqual(['demo', 'desoul-posting-vi']);
    expect(JSON.parse(rows[0].json).card.engine).toBe('studio');
    expect(JSON.parse(rows[1].json).card.engine).toBe('classic');
  });

  it('never overwrites a kit the owner edited', () => {
    seedDemo();
    const d = studioDb();
    d.prepare('UPDATE studio_kits SET name=? WHERE id=?').run('Mine', 'demo');
    seedDemo();
    expect(d.prepare('SELECT name FROM studio_kits WHERE id=?').get('demo')).toEqual({ name: 'Mine' });
  });
});

describe('seeding over an older row', () => {
  it('replaces a stub that does not validate — it was never an edit', () => {
    const d = studioDb();
    d.prepare('INSERT INTO studio_kits (id, name, schema_version, json) VALUES (?,?,?,?)').run(
      'demo',
      'Demo',
      1,
      JSON.stringify({ identity: { name: 'Demo' } }), // slice 0's placeholder shape
    );
    seedDemo();
    const row = d.prepare('SELECT json FROM studio_kits WHERE id=?').get('demo') as { json: string };
    expect(JSON.parse(row.json).card.engine).toBe('studio');
  });

  it('leaves a valid kit the owner edited exactly as they left it', () => {
    seedDemo();
    const d = studioDb();
    const kit = JSON.parse((d.prepare('SELECT json FROM studio_kits WHERE id=?').get('demo') as any).json);
    kit.captions.size = 33;
    d.prepare('UPDATE studio_kits SET json=? WHERE id=?').run(JSON.stringify(kit), 'demo');
    seedDemo();
    const after = JSON.parse((d.prepare('SELECT json FROM studio_kits WHERE id=?').get('demo') as any).json);
    expect(after.captions.size).toBe(33);
  });
});

describe('shipped kit revisions', () => {
  it('replaces a stored kit when the pack ships a higher revision', () => {
    seedDemo();
    const d = studioDb();
    const kit = JSON.parse((d.prepare('SELECT json FROM studio_kits WHERE id=?').get('demo') as any).json);
    // Pretend the install is on an older revision with an older look.
    d.prepare('UPDATE studio_kits SET json=? WHERE id=?').run(
      JSON.stringify({ ...kit, revision: 1, card: { ...kit.card, engine: 'classic', ratio: '1:1' } }),
      'demo',
    );
    seedDemo();
    const after = JSON.parse((d.prepare('SELECT json FROM studio_kits WHERE id=?').get('demo') as any).json);
    expect(after.card.engine).toBe('studio');
    expect(after.revision).toBeGreaterThan(1);
  });

  it('leaves a kit at the shipped revision alone, however the owner edited it', () => {
    seedDemo();
    const d = studioDb();
    const kit = JSON.parse((d.prepare('SELECT json FROM studio_kits WHERE id=?').get('demo') as any).json);
    kit.card.radius = 7;
    d.prepare('UPDATE studio_kits SET json=? WHERE id=?').run(JSON.stringify(kit), 'demo');
    seedDemo();
    const after = JSON.parse((d.prepare('SELECT json FROM studio_kits WHERE id=?').get('demo') as any).json);
    expect(after.card.radius).toBe(7);
  });
});
