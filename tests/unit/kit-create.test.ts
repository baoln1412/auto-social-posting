import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-kitnew-'));
process.env.STUDIO_SQLITE_PATH = path.join(dir, 'test.db');

const { studioDb, resetStudioDbForTests } = await import('@/lib/studio/db');
const { seedDemo } = await import('@/lib/studio/demo/seed');
const { createKit, deleteKit, isShipped, kitIdFrom } = await import('@/lib/studio/kits/create');

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  resetStudioDbForTests();
  seedDemo();
});

describe('kitIdFrom', () => {
  it('makes a url-safe id out of a Vietnamese name', () => {
    expect(kitIdFrom('Bộ nhận diện mới của tôi')).toBe('bo-nhan-dien-moi-cua-toi');
  });

  it('never collides with a kit that is already there', () => {
    expect(kitIdFrom('Demo')).toBe('demo-2');
    expect(kitIdFrom('')).toMatch(/^kit-/);
  });
});

describe('createKit', () => {
  it('copies an existing kit rather than starting from nothing', () => {
    const made = createKit({ name: 'Bản của tôi', from: 'desoul-posting-vi' });
    expect(made.id).toBe('ban-cua-toi');

    const src = JSON.parse(
      (studioDb().prepare('SELECT json FROM studio_kits WHERE id=?').get('desoul-posting-vi') as { json: string }).json,
    );
    const copy = JSON.parse(
      (studioDb().prepare('SELECT json FROM studio_kits WHERE id=?').get(made.id) as { json: string }).json,
    );
    expect(copy.card).toEqual(src.card);
    expect(copy.frame).toEqual(src.frame);
    // Its own identity, and a revision that cannot be clobbered by a re-shipped file.
    expect(copy.id).toBe(made.id);
    expect(copy.name).toBe('Bản của tôi');
    expect(copy.revision).toBe(1);
  });

  it('refuses a source that does not exist, instead of writing an empty kit', () => {
    expect(() => createKit({ name: 'X', from: 'nope' })).toThrow(/không có/i);
  });

  it('survives a fresh seed — a copy is not a shipped file and is never overwritten', () => {
    const made = createKit({ name: 'Của tôi', from: 'demo' });
    studioDb().prepare('UPDATE studio_kits SET name=? WHERE id=?').run('Đã sửa', made.id);
    seedDemo();
    const after = studioDb().prepare('SELECT name FROM studio_kits WHERE id=?').get(made.id) as { name: string };
    expect(after.name).toBe('Đã sửa');
  });
});

describe('deleteKit', () => {
  it('will not delete a kit a channel still points at, and names the channel', () => {
    const made = createKit({ name: 'Đang dùng', from: 'demo' });
    studioDb().prepare('UPDATE studio_channels SET kit_id=? WHERE id=?').run(made.id, 'demo');
    expect(() => deleteKit(made.id)).toThrow(/kênh|Kênh thử/i);
  });

  it('will not delete a shipped kit, because the next boot would bring it back', () => {
    studioDb().prepare("UPDATE studio_channels SET kit_id='none'").run();
    expect(isShipped('desoul-posting-vi')).toBe(true);
    expect(() => deleteKit('desoul-posting-vi')).toThrow(/đi kèm|shipped/i);
  });

  it('deletes one the owner made', () => {
    const made = createKit({ name: 'Tạm', from: 'demo' });
    expect(isShipped(made.id)).toBe(false);
    deleteKit(made.id);
    expect(studioDb().prepare('SELECT id FROM studio_kits WHERE id=?').get(made.id)).toBeUndefined();
  });
});
