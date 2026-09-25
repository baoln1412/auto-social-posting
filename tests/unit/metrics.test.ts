import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fx from '../fixtures/graph-reels.json';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-metrics-'));
process.env.STUDIO_SQLITE_PATH = path.join(dir, 'test.db');

const { resetStudioDbForTests } = await import('@/lib/studio/db');
const { readInsights, record, seriesFor, latestFor } = await import('@/lib/studio/metrics');

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => resetStudioDbForTests());

function recorder(bodies: unknown[]) {
  const calls: string[] = [];
  let i = 0;
  const fetchLike = async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify(bodies[Math.min(i++, bodies.length - 1)]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { calls, io: { fetch: fetchLike as unknown as typeof fetch, sleep: async () => {} } };
}

describe('readInsights', () => {
  it('reads a feed post: impressions, reach, reactions', async () => {
    const r = recorder([fx.insightsPost, fx.reactions]);
    expect(await readInsights('555_666', 'tok', false, r.io)).toEqual({
      views: 4820,
      reach: 3910,
      reactions: 187,
    });
    expect(r.calls[0]).toMatch(/555_666\/insights/);
    expect(r.calls[1]).toMatch(/reactions\.summary/);
  });

  it('reads a reel from the video metrics instead', async () => {
    const r = recorder([fx.insightsVideo, fx.reactions]);
    expect(await readInsights('1010101010', 'tok', true, r.io)).toEqual({
      views: 12043,
      reach: 9004,
      reactions: 187,
    });
    expect(r.calls[0]).toMatch(/video_insights/);
  });

  it('raises what Graph said rather than reporting a post with zero views', async () => {
    const r = recorder([fx.insightsDenied]);
    await expect(readInsights('555_666', 'tok', false, r.io)).rejects.toThrow(/Insights permission/);
  });
});

describe('the metrics table', () => {
  it('keeps one row per fetch, so a number that moves can be read as a series', () => {
    record({ runId: 'r1', where: 'facebook:c1', remoteId: '555', views: 10, reach: 8, reactions: 1 });
    record({ runId: 'r1', where: 'facebook:c1', remoteId: '555', views: 40, reach: 30, reactions: 5 });
    const series = seriesFor('r1');
    expect(series).toHaveLength(2);
    expect(series.map((m) => m.views)).toEqual([10, 40]);
  });

  it('hands back the newest row per run for a list of runs', () => {
    record({ runId: 'r1', where: 'facebook:c1', remoteId: '555', views: 10, reach: 8, reactions: 1 });
    record({ runId: 'r1', where: 'facebook:c1', remoteId: '555', views: 40, reach: 30, reactions: 5 });
    record({ runId: 'r2', where: 'facebook:c1', remoteId: '777', views: 3, reach: 3, reactions: 0 });
    const latest = latestFor(['r1', 'r2']);
    expect(latest.r1.views).toBe(40);
    expect(latest.r2.views).toBe(3);
  });

  it('says nothing about a run it has never fetched', () => {
    expect(latestFor(['nope'])).toEqual({});
  });
});
