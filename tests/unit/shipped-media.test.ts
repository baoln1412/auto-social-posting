/**
 * The shipped asset pack.
 *
 * assets.ts opened with "Uploads only — no Pinterest, no MyInstants. Fetching someone
 * else's asset library is a licensing problem this project does not need." That was right
 * while nobody had decided a licence. The decision is now made — CC0 and no-attribution
 * sources only, with a manifest naming the licence of every file — so the shelves can ship
 * with something on them.
 *
 * Shipped files are not uploads: they live in the repo, cannot be deleted from the UI, and
 * must not eat the owner's 50 MB / 30 file budget. A curated pack would consume the whole
 * quota before the owner added anything of their own.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-shipped-'));
process.env.STUDIO_SQLITE_PATH = path.join(dir, 'test.db');

const { resetStudioDbForTests } = await import('@/lib/studio/db');
const assets = await import('@/lib/studio/assets');

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => resetStudioDbForTests());

describe('the shipped pack', () => {
  it('appears in the library beside the owner’s own uploads', () => {
    const shipped = assets.listShipped('music');
    expect(Array.isArray(shipped)).toBe(true);
    for (const row of shipped) {
      expect(row.id.startsWith('shipped:'), row.id).toBe(true);
      expect(fs.existsSync(row.path), row.path).toBe(true);
      expect(row.kind).toBe('music');
    }
    // listMedia returns both pools, shipped last so the owner's own are nearest the top.
    const all = assets.listMedia('music');
    expect(all.length).toBe(shipped.length);
  });

  it('resolves a shipped id the same way a run resolves an upload', () => {
    const shipped = assets.listShipped('music');
    if (!shipped.length) return;                       // empty pack is a valid state
    const row = assets.mediaById(shipped[0].id);
    expect(row?.path).toBe(shipped[0].path);
  });

  it('never counts against the owner’s quota', () => {
    const q = assets.libraryQuota();
    // The quota bar reads uploads only; the pack is the product, not the owner's storage.
    expect(q.files).toBe(0);
    expect(q.bytes).toBe(0);
  });

  it('refuses to delete a shipped file, because the repo owns it', () => {
    const shipped = assets.listShipped('music');
    if (!shipped.length) return;
    expect(() => assets.deleteMedia(shipped[0].id)).toThrow();
    expect(fs.existsSync(shipped[0].path)).toBe(true);
  });

  it('carries a licence for every shipped file, or it is not shippable', () => {
    for (const kind of ['music', 'sticker', 'bg'] as const) {
      for (const row of assets.listShipped(kind)) {
        expect(row.licence, `${row.id} has no licence`).toBeTruthy();
        expect(row.licence?.source, `${row.id} has no source`).toBeTruthy();
      }
    }
  });
});
