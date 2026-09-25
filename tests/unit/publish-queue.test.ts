import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-pub-'));
process.env.STUDIO_SQLITE_PATH = path.join(dir, 'test.db');

const { resetStudioDbForTests } = await import('@/lib/studio/db');
const { enqueue, rowsFor, due, markSent, markFailed, nextSlot, tick } = await import(
  '@/lib/studio/publish/queue'
);

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => resetStudioDbForTests());

const iso = (s: string) => new Date(s).toISOString();

describe('the publish queue', () => {
  it('records what was asked for, and reads it back against its run', () => {
    const row = enqueue({ runId: 'r1', where: 'telegram', at: iso('2026-10-01T09:00:00Z'), firstComment: 'Nguồn: x' });
    expect(row.status).toBe('pending');
    const back = rowsFor('r1');
    expect(back).toHaveLength(1);
    expect(back[0].where).toBe('telegram');
    expect(back[0].firstComment).toBe('Nguồn: x');
  });

  it('only hands out rows whose time has come', () => {
    enqueue({ runId: 'r1', where: 'telegram', at: iso('2026-10-01T09:00:00Z') });
    enqueue({ runId: 'r1', where: 'library', at: iso('2026-10-01T11:00:00Z') });
    expect(due(new Date('2026-10-01T10:00:00Z')).map((r) => r.where)).toEqual(['telegram']);
    expect(due(new Date('2026-10-01T12:00:00Z'))).toHaveLength(2);
  });

  it('stops handing out a row once it is sent or failed', () => {
    const a = enqueue({ runId: 'r1', where: 'telegram', at: iso('2026-10-01T09:00:00Z') });
    const b = enqueue({ runId: 'r1', where: 'library', at: iso('2026-10-01T09:00:00Z') });
    markSent(a.id, 'fb_123');
    markFailed(b.id, 'token hết hạn');
    expect(due(new Date('2026-10-01T10:00:00Z'))).toHaveLength(0);
    const back = rowsFor('r1');
    expect(back.find((r) => r.id === a.id)!.remoteId).toBe('fb_123');
    expect(back.find((r) => r.id === b.id)!.error).toMatch(/token/);
  });

  describe('tick', () => {
    it('sends what is due and records the id it got back', async () => {
      const row = enqueue({ runId: 'r1', where: 'telegram', at: iso('2026-10-01T09:00:00Z') });
      const seen: string[] = [];
      const out = await tick(async (r) => {
        seen.push(r.where);
        return { remoteId: 'tg_9' };
      }, new Date('2026-10-01T10:00:00Z'));

      expect(out).toEqual({ sent: 1, failed: 0 });
      expect(seen).toEqual(['telegram']);
      expect(rowsFor('r1').find((r) => r.id === row.id)!.status).toBe('sent');
    });

    it('records a failure against the row instead of throwing it at the caller', async () => {
      enqueue({ runId: 'r1', where: 'telegram', at: iso('2026-10-01T09:00:00Z') });
      const out = await tick(async () => {
        throw new Error('Telegram trả về 401');
      }, new Date('2026-10-01T10:00:00Z'));

      expect(out).toEqual({ sent: 0, failed: 1 });
      const r = rowsFor('r1')[0];
      expect(r.status).toBe('failed');
      expect(r.error).toMatch(/401/);
    });

    it('does nothing at all when nothing is due', async () => {
      enqueue({ runId: 'r1', where: 'telegram', at: iso('2026-10-01T23:00:00Z') });
      let called = 0;
      const out = await tick(async () => {
        called++;
        return { remoteId: null };
      }, new Date('2026-10-01T10:00:00Z'));
      expect(called).toBe(0);
      expect(out).toEqual({ sent: 0, failed: 0 });
    });
  });

  describe('nextSlot', () => {
    const times = ['06:00', '12:00', '18:00'];
    const at = (s: string) => new Date(s);

    it('is the next cadence time today', () => {
      expect(nextSlot([], at('2026-10-01T07:00:00'), times)).toBe(new Date('2026-10-01T12:00:00').toISOString());
    });

    it('skips a slot that is already taken', () => {
      const taken = [new Date('2026-10-01T12:00:00').toISOString()];
      expect(nextSlot(taken, at('2026-10-01T07:00:00'), times)).toBe(new Date('2026-10-01T18:00:00').toISOString());
    });

    it('rolls over to tomorrow after the last slot', () => {
      expect(nextSlot([], at('2026-10-01T19:00:00'), times)).toBe(new Date('2026-10-02T06:00:00').toISOString());
    });

    it('has no answer when the machine has no cadence', () => {
      expect(nextSlot([], at('2026-10-01T07:00:00'), [])).toBeNull();
    });
  });
});
