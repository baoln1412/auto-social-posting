import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-auto-'));
process.env.STUDIO_SQLITE_PATH = path.join(dir, 'test.db');

const { studioDb, resetStudioDbForTests } = await import('@/lib/studio/db');
const { seedDemo, DEMO_CHANNEL_ID } = await import('@/lib/studio/demo/seed');
const { createRun, getRun, advance } = await import('@/lib/studio/runs');
const { loadPipeline, savePipeline } = await import('@/lib/studio/pipeline/config');
const { rowsFor } = await import('@/lib/studio/publish/queue');

const MARKET = 'market-auto-test';

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  resetStudioDbForTests();
  seedDemo();
  // The shipped demo channel belongs to no market; auto-publish is a market's setting.
  studioDb().prepare('UPDATE studio_channels SET market_id=? WHERE id=?').run(MARKET, DEMO_CHANNEL_ID);
});

const turnAutoOn = () => {
  const { config } = loadPipeline(MARKET);
  savePipeline(MARKET, { ...config, publish: { auto: true, to: ['library'] } });
};

/** Walk a demo run to the end of Video — the demo pack neither spends nor reaches the network. */
async function renderARun(): Promise<string> {
  const id = createRun({ channelId: DEMO_CHANNEL_ID, itemRef: 'demo:1' });
  for (let i = 0; i < 4; i++) await advance(id, { allowSpend: true });
  return id;
}

describe('Tự đăng khi render xong', () => {
  it('queues nothing while the market has it off', async () => {
    const id = await renderARun();
    expect(getRun(id)!.steps.reel?.status).toBe('ok');
    expect(rowsFor(id)).toEqual([]);
  });

  it('queues the finished reel the moment it renders', async () => {
    turnAutoOn();
    const id = await renderARun();
    const rows = rowsFor(id);
    expect(rows.map((r) => r.where)).toEqual(['library']);
    // `at = now`, so the same loop that handles a scheduled post takes it at once.
    expect(new Date(rows[0].at).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    expect(rows[0].status).toBe('sent');
  });

  it('does not queue a destination twice when Đăng runs over the top of it', async () => {
    turnAutoOn();
    const id = await renderARun();
    await advance(id, { allowSpend: true });
    expect(getRun(id)!.steps.publish?.status).toBe('ok');
    expect(rowsFor(id).filter((r) => r.where === 'library')).toHaveLength(1);
  });
});
