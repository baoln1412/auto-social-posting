import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-db-'));
process.env.STUDIO_SQLITE_PATH = path.join(dir, 'test.db');

const { studioDb, ensureStudioTables, resetStudioDbForTests } = await import('@/lib/studio/db');

const TABLES = [
  'studio_channels',
  'studio_kits',
  'studio_runs',
  'studio_media',
  'studio_steps',
  'studio_assets',
];

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

beforeEach(() => resetStudioDbForTests());

describe('ensureStudioTables()', () => {
  it('creates all six studio tables', () => {
    const names = studioDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name);
    for (const t of TABLES) expect(names).toContain(t);
  });

  it('touches nothing outside the studio_ prefix', () => {
    const names = studioDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r: any) => r.name);
    expect(names.filter((n: string) => !n.startsWith('studio_'))).toEqual([]);
  });

  it('is idempotent — a second call over a populated table keeps the rows', () => {
    const d = studioDb();
    d.prepare('INSERT INTO studio_kits (id, name, schema_version, json) VALUES (?,?,?,?)').run(
      'k1',
      'Kit',
      1,
      '{}',
    );
    ensureStudioTables(d);
    expect(d.prepare('SELECT COUNT(*) c FROM studio_kits').get()).toEqual({ c: 1 });
  });

  it('defaults auto_continue off and tier_min to owner', () => {
    const d = studioDb();
    d.prepare('INSERT INTO studio_channels (id, name) VALUES (?,?)').run('c1', 'Chan');
    expect(d.prepare('SELECT auto_continue, tier_min FROM studio_channels').get()).toEqual({
      auto_continue: 0,
      tier_min: 'owner',
    });
  });

  it('stamps created_at on a run without being asked', () => {
    const d = studioDb();
    d.prepare('INSERT INTO studio_runs (id, channel_id, mode, status) VALUES (?,?,?,?)').run(
      'r1',
      'c1',
      'read-post',
      'new',
    );
    const row: any = d.prepare('SELECT created_at FROM studio_runs WHERE id = ?').get('r1');
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
