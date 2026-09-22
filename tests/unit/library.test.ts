import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-lib-'));
process.env.STUDIO_SQLITE_PATH = path.join(dir, 'test.db');

const { studioDb, resetStudioDbForTests } = await import('@/lib/studio/db');
const { seedDemo, DEMO_CHANNEL_ID } = await import('@/lib/studio/demo/seed');
const { createRun, advance } = await import('@/lib/studio/runs');
const { listLibrary, groupByDay, matches } = await import('@/lib/studio/library');
const { QUOTA, quotaOf, safeName } = await import('@/lib/studio/assets');

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  resetStudioDbForTests();
  seedDemo();
});

const item = (over = {}) => ({
  runId: 'r1',
  channelName: 'Kênh thử',
  title: 'Tiêu đề',
  sourceUrl: 'https://ex.com/bai-viet',
  itemRef: 'gold:g1',
  status: 'done',
  createdAt: '2026-09-22T03:00:00.000Z',
  assets: [],
  ...over,
});

describe('matches()', () => {
  it('finds a run by its source link — the thing the owner actually remembers', () => {
    expect(matches(item(), 'bai-viet')).toBe(true);
    expect(matches(item(), 'ex.com')).toBe(true);
  });

  it('finds one by run id, channel or title', () => {
    expect(matches(item(), 'r1')).toBe(true);
    expect(matches(item(), 'kênh')).toBe(true);
    expect(matches(item(), 'tiêu')).toBe(true);
  });

  it('is case- and accent-tolerant, because nobody types diacritics into a search box', () => {
    expect(matches(item(), 'KENH')).toBe(true);
    expect(matches(item({ title: 'Định cư Mỹ' }), 'dinh cu')).toBe(true);
  });

  it('says no when it means no', () => {
    expect(matches(item(), 'không có gì')).toBe(false);
  });

  it('matches everything on an empty query', () => {
    expect(matches(item(), '')).toBe(true);
  });
});

describe('groupByDay()', () => {
  it('groups runs under one heading per day, newest day first', () => {
    const g = groupByDay([
      item({ runId: 'a', createdAt: '2026-09-20T10:00:00.000Z' }),
      item({ runId: 'b', createdAt: '2026-09-22T01:00:00.000Z' }),
      item({ runId: 'c', createdAt: '2026-09-22T09:00:00.000Z' }),
    ]);
    expect(g.map((x) => x.items.length)).toEqual([2, 1]);
    expect(g[0].items.map((i) => i.runId)).toEqual(['c', 'b']);
  });

  it('returns nothing for nothing, rather than one empty day', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('listLibrary()', () => {
  it('records an asset row for every artefact a run produced', async () => {
    const id = createRun({ channelId: DEMO_CHANNEL_ID, mode: 'read-post', itemRef: 'demo:1' });
    for (let i = 0; i < 4; i++) await advance(id);

    const kinds = studioDb()
      .prepare('SELECT kind FROM studio_assets WHERE run_id=? ORDER BY kind')
      .all(id)
      .map((r: any) => r.kind);
    expect(kinds).toEqual(['png', 'mp4']. sort());
  });

  it('lists the run with its assets and the source it came from', async () => {
    const id = createRun({ channelId: DEMO_CHANNEL_ID, mode: 'read-post', itemRef: 'demo:1' });
    for (let i = 0; i < 4; i++) await advance(id);

    const rows = listLibrary();
    expect(rows).toHaveLength(1);
    expect(rows[0].runId).toBe(id);
    expect(rows[0].status).toBe('done');
    expect(rows[0].assets.map((a) => a.kind).sort()).toEqual(['mp4', 'png']);
    expect(rows[0].sourceUrl).toContain('example.com');
  });

  it('re-running a step replaces its asset instead of stacking a second one', async () => {
    const id = createRun({ channelId: DEMO_CHANNEL_ID, mode: 'read-post', itemRef: 'demo:1' });
    for (let i = 0; i < 4; i++) await advance(id);
    await advance(id, { step: 'image' });
    expect(
      studioDb().prepare('SELECT COUNT(*) c FROM studio_assets WHERE run_id=? AND kind=?').get(id, 'png'),
    ).toEqual({ c: 1 });
  });
});

describe('listLibrary() channel filtering', () => {
  it('keeps the runs whose channel is in the allowed set', async () => {
    const id = createRun({ channelId: DEMO_CHANNEL_ID, mode: 'read-post', itemRef: 'demo:1' });
    for (let i = 0; i < 4; i++) await advance(id);
    expect(listLibrary({ channelIds: new Set([DEMO_CHANNEL_ID]) })).toHaveLength(1);
  });

  it('drops the runs whose channel is not', async () => {
    const id = createRun({ channelId: DEMO_CHANNEL_ID, mode: 'read-post', itemRef: 'demo:1' });
    for (let i = 0; i < 4; i++) await advance(id);
    expect(listLibrary({ channelIds: new Set(['someone-else']) })).toHaveLength(0);
  });

  it('shows everything when no set is given', async () => {
    createRun({ channelId: DEMO_CHANNEL_ID, mode: 'read-post', itemRef: 'demo:1' });
    expect(listLibrary()).toHaveLength(1);
  });
});

describe('the asset quota', () => {
  it('is the plan\'s 50 MB and 30 files', () => {
    expect(QUOTA).toEqual({ bytes: 50 * 1024 * 1024, files: 30 });
  });

  it('reports whichever limit is closer to being hit', () => {
    const q = quotaOf([{ bytes: 25 * 1024 * 1024 }, { bytes: 1 }]);
    expect(q.files).toBe(2);
    expect(Math.round(q.pct)).toBe(50);
  });

  it('counts a full file list as full even when the bytes are tiny', () => {
    expect(quotaOf(Array(30).fill({ bytes: 10 })).pct).toBe(100);
    expect(quotaOf(Array(30).fill({ bytes: 10 })).full).toBe(true);
  });

  it('is empty when nothing is uploaded', () => {
    expect(quotaOf([])).toMatchObject({ files: 0, bytes: 0, pct: 0, full: false });
  });
});

describe('safeName()', () => {
  it('keeps a readable name but strips anything that could escape the directory', () => {
    expect(safeName('../../etc/passwd')).not.toContain('/');
    expect(safeName('ảnh nền.png')).toMatch(/\.png$/);
    expect(safeName('a b.PNG')).toBe('a-b.png');
  });

  it('never returns an empty name', () => {
    expect(safeName('///').length).toBeGreaterThan(0);
  });
});

describe('the sticker overlay', () => {
  it('covers the whole video when the kit says cover', async () => {
    const { overlayFilter } = await import('@/lib/studio/steps/overlay');
    expect(overlayFilter(['cover'])).toBe('[0][1]overlay=W-w-40:H-h-320');
  });

  it('limits an intro sticker to the opening seconds', async () => {
    const { overlayFilter, INTRO_SEC } = await import('@/lib/studio/steps/overlay');
    expect(overlayFilter(['intro'])).toContain(`between(t,0,${INTRO_SEC})`);
  });

  it('does nothing when the kit asks for nothing', async () => {
    const { overlayFilter } = await import('@/lib/studio/steps/overlay');
    expect(overlayFilter([])).toBeNull();
    expect(overlayFilter(['reactions'])).toBeNull();
  });

  it('keeps the audio stream as-is — re-encoding it costs quality for nothing', async () => {
    const { overlayArgs } = await import('@/lib/studio/steps/overlay');
    const args = overlayArgs('in.mp4', 's.png', 'out.mp4', 'f');
    expect(args).toContain('-c:a');
    expect(args[args.indexOf('-c:a') + 1]).toBe('copy');
    expect(args.at(-1)).toBe('out.mp4');
  });
});

describe('an uploaded background reaches the renderer', () => {
  it('becomes a file:// media entry make-reel.py can open', async () => {
    const { saveUpload } = await import('@/lib/studio/assets');
    const { backgroundMedia } = await import('@/lib/studio/steps/overlay');
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const row = saveUpload('bg', 'nen.png', png);

    // Same transport the card already uses — slice 3's real render composited one this way,
    // so urllib opening file:// is measured, not assumed.
    const media = backgroundMedia({ id: 'k', name: 'K', frame: { background: row.id } });
    expect(media).toEqual({ url: `file://${row.path}`, kind: 'image' });
    expect(fs.existsSync(row.path)).toBe(true);
  });

  it('is nothing when the kit names a file that is gone', async () => {
    const { backgroundMedia } = await import('@/lib/studio/steps/overlay');
    expect(backgroundMedia({ id: 'k', name: 'K', frame: { background: 'missing' } })).toBeNull();
    expect(backgroundMedia({ id: 'k', name: 'K' })).toBeNull();
  });

  it('calls an uploaded mp4 a video, not an image', async () => {
    const { saveUpload } = await import('@/lib/studio/assets');
    const { backgroundMedia } = await import('@/lib/studio/steps/overlay');
    const row = saveUpload('bg', 'clip.mp4', Buffer.from('not really an mp4'));
    expect(backgroundMedia({ id: 'k', name: 'K', frame: { background: row.id } })?.kind).toBe('video');
  });
});
