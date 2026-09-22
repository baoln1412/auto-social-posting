import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-handoff-'));
process.env.STUDIO_SQLITE_PATH = path.join(dir, 'test.db');

const { studioDb, resetStudioDbForTests } = await import('@/lib/studio/db');
const { seedDemo } = await import('@/lib/studio/demo/seed');
const { channelForMarket } = await import('@/lib/studio/handoff');

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  resetStudioDbForTests();
  seedDemo();
});

const MARKET = 'c7469ff0-5bae-495a-befd-8c2539c4ff31';

describe('channelForMarket()', () => {
  it('makes a gold channel the first time a post is handed over', () => {
    const id = channelForMarket(MARKET, 'US Immigration');
    const row = studioDb().prepare('SELECT * FROM studio_channels WHERE id=?').get(id) as any;
    expect(row.market_id).toBe(MARKET);
    expect(row.name).toContain('US Immigration');
    expect(JSON.parse(row.sources_json)).toEqual([{ type: 'gold', marketId: MARKET }]);
    expect(row.kit_id).toBe('desoul-posting-vi');
  });

  it('reuses it on every hand-over after that', () => {
    const a = channelForMarket(MARKET, 'US Immigration');
    const b = channelForMarket(MARKET, 'US Immigration');
    expect(b).toBe(a);
    expect(studioDb().prepare('SELECT COUNT(*) c FROM studio_channels WHERE market_id=?').get(MARKET))
      .toEqual({ c: 1 });
  });

  it('still finds it after the owner renames it — matched on its source, not its name', () => {
    const a = channelForMarket(MARKET, 'US Immigration');
    studioDb().prepare('UPDATE studio_channels SET name=? WHERE id=?').run('Của tôi', a);
    expect(channelForMarket(MARKET, 'US Immigration')).toBe(a);
  });

  it('does not hijack a non-gold channel that happens to share the market', () => {
    studioDb()
      .prepare(
        'INSERT INTO studio_channels (id, name, market_id, sources_json) VALUES (?,?,?,?)',
      )
      .run('reddit-one', 'Reddit', MARKET, JSON.stringify([{ type: 'reddit' }]));
    expect(channelForMarket(MARKET, 'US')).not.toBe('reddit-one');
  });

  it('keeps one channel per market', () => {
    const a = channelForMarket(MARKET, 'US');
    const b = channelForMarket('7ed20514-51b0-4aae-92ff-6bcdbfb3f2e8', 'UK');
    expect(a).not.toBe(b);
  });
});
