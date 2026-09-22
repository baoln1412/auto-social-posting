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
    expect(d.prepare('SELECT COUNT(*) c FROM studio_kits').get()).toEqual({ c: 1 });
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
