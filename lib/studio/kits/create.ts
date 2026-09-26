/**
 * Making a Bộ nhận diện, copying one, and deleting one.
 *
 * v3 shipped an editor with no way in: the page listed two kits that arrived as files and
 * offered nothing else, so "đổi diện mạo của kênh" meant editing one of the two the pack came
 * with — and editing a shipped kit is the one thing `seedDemo` warns against, since a later
 * revision bump replaces it.
 *
 * A new kit is always a COPY. A kit assembled from nothing has no card preset, no frame, no
 * voice, and the first thing it would do is fail the renderer; the useful blank page here is
 * "the one I already like, under a new name".
 */
import { randomBytes } from 'node:crypto';
import { studioDb } from '../db';
import { listKitFiles, loadKitFile } from './schema';

/** The ids that arrive as files, and that a fresh boot will always put back. */
export function shippedIds(): Set<string> {
  const out = new Set<string>();
  for (const f of listKitFiles()) {
    const k = loadKitFile(f) as { id?: string };
    if (k.id) out.add(k.id);
  }
  return out;
}

export const isShipped = (id: string): boolean => shippedIds().has(id);

const NO_MARK = /[̀-ͯ]/g;

/** A Vietnamese name → a url-safe id nothing else is using. */
export function kitIdFrom(name: string): string {
  const base =
    name
      .normalize('NFD')
      .replace(NO_MARK, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || `kit-${randomBytes(3).toString('hex')}`;

  const d = studioDb();
  const taken = (id: string) => Boolean(d.prepare('SELECT 1 FROM studio_kits WHERE id=?').get(id));
  if (!taken(base)) return base;
  for (let n = 2; n < 100; n++) if (!taken(`${base}-${n}`)) return `${base}-${n}`;
  return `${base}-${randomBytes(3).toString('hex')}`;
}

export function createKit(opts: { name: string; from: string }): { id: string; name: string } {
  const d = studioDb();
  const src = d.prepare('SELECT json FROM studio_kits WHERE id=?').get(opts.from) as
    | { json: string }
    | undefined;
  if (!src) throw new Error(`Không có bộ nhận diện "${opts.from}" để chép.`);

  const name = opts.name.trim() || 'Bộ nhận diện mới';
  const id = kitIdFrom(name);
  const kit = JSON.parse(src.json) as Record<string, unknown>;
  kit.id = id;
  kit.name = name;
  // Back to 1: `revision` is how a re-shipped file decides it may replace a stored row, and a
  // copy must never inherit a number that makes the pack think it owns this kit.
  kit.revision = 1;

  d.prepare('INSERT INTO studio_kits (id, name, schema_version, json) VALUES (?,?,?,?)').run(
    id,
    name,
    (kit.schemaVersion as number) ?? 1,
    JSON.stringify(kit),
  );
  return { id, name };
}

export function deleteKit(id: string): void {
  if (isShipped(id)) throw new Error('Bộ nhận diện đi kèm bản cài — xoá xong lần khởi động sau sẽ có lại. Nhân bản rồi sửa bản chép.');
  const d = studioDb();
  const used = d.prepare('SELECT name FROM studio_channels WHERE kit_id=?').all(id) as { name: string }[];
  if (used.length) {
    throw new Error(`Còn ${used.length} kênh đang dùng: ${used.map((u) => u.name).join(', ')}.`);
  }
  d.prepare('DELETE FROM studio_kits WHERE id=?').run(id);
}
