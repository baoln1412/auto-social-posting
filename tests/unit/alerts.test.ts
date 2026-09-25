import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-alerts-'));
process.env.STUDIO_SQLITE_PATH = path.join(dir, 'test.db');

const { resetStudioDbForTests } = await import('@/lib/studio/db');
const { raise, recent, unseenCount, markSeen } = await import('@/lib/studio/alerts');

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => resetStudioDbForTests());

describe('alerts', () => {
  it('records a failure with its kind, its run and its text', async () => {
    await raise('render', 'Bước "Video" lỗi: ffmpeg trả về 1.', 'run-1');
    const [a] = recent();
    expect(a.kind).toBe('render');
    expect(a.runId).toBe('run-1');
    expect(a.message).toMatch(/ffmpeg/);
    expect(a.seen).toBe(false);
  });

  it('counts only what has not been read', async () => {
    await raise('render', 'một', 'r1');
    await raise('publish', 'hai', 'r1');
    expect(unseenCount()).toBe(2);
    markSeen();
    expect(unseenCount()).toBe(0);
    expect(recent()).toHaveLength(2);
  });

  it('marks one alert read without touching the others', async () => {
    const a = await raise('render', 'một', 'r1');
    await raise('publish', 'hai', 'r1');
    markSeen([a.id]);
    expect(unseenCount()).toBe(1);
  });

  it('hands newest first, and stops at the limit asked for', async () => {
    for (let i = 0; i < 5; i++) await raise('render', `lỗi ${i}`, 'r1');
    const r = recent(3);
    expect(r).toHaveLength(3);
    expect(r[0].message).toBe('lỗi 4');
  });

  it('never lets a broken notifier swallow the record', async () => {
    const boom = vi.fn(async () => {
      throw new Error('Telegram 401');
    });
    await expect(raise('publish', 'ba', 'r1', boom)).resolves.toBeTruthy();
    expect(boom).toHaveBeenCalledOnce();
    expect(recent()[0].message).toBe('ba');
  });

  it('sends the alert on when a notifier is there', async () => {
    const sent: string[] = [];
    await raise('render', 'bốn', 'r1', async (m) => {
      sent.push(m);
    });
    expect(sent[0]).toMatch(/bốn/);
  });
});
