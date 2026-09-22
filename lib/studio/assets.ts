/**
 * The owner's own backgrounds, stickers and music.
 *
 * Uploads only — no Pinterest, no MyInstants. Fetching someone else's asset library is a
 * licensing problem this project does not need.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { studioDb } from './db';

export type MediaKind = 'bg' | 'sticker' | 'music';

export const QUOTA = { bytes: 50 * 1024 * 1024, files: 30 };

export const MEDIA_DIR = path.join(process.cwd(), 'data', 'studio-media');

export interface MediaRow {
  id: string;
  kind: MediaKind;
  path: string;
  bytes: number;
  name: string;
  url: string;
  created_at: string;
}

/** Whichever limit is closer to being hit — a bar that only tracks bytes lies at 30 files. */
export function quotaOf(rows: { bytes: number | null }[]): {
  bytes: number;
  files: number;
  pct: number;
  full: boolean;
} {
  const bytes = rows.reduce((n, r) => n + (r.bytes ?? 0), 0);
  const files = rows.length;
  const pct = Math.min(100, Math.max((bytes / QUOTA.bytes) * 100, (files / QUOTA.files) * 100));
  return { bytes, files, pct, full: bytes >= QUOTA.bytes || files >= QUOTA.files };
}

/** A name that is readable and cannot leave MEDIA_DIR. */
export function safeName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return cleaned || 'tep';
}

const EXT: Record<MediaKind, RegExp> = {
  bg: /\.(png|jpe?g|webp|mp4)$/i,
  sticker: /\.(png|webp)$/i,
  music: /\.(mp3|m4a|wav)$/i,
};

export function listMedia(kind?: MediaKind): MediaRow[] {
  const rows = (
    kind
      ? studioDb().prepare('SELECT * FROM studio_media WHERE kind=? ORDER BY created_at DESC').all(kind)
      : studioDb().prepare('SELECT * FROM studio_media ORDER BY created_at DESC').all()
  ) as any[];
  return rows.map((r) => {
    const meta = (() => {
      try {
        return JSON.parse(r.meta_json || '{}');
      } catch {
        return {};
      }
    })();
    return {
      id: r.id,
      kind: r.kind,
      path: r.path,
      bytes: r.bytes,
      name: meta.name ?? path.basename(r.path ?? ''),
      url: `/api/studio/media/${r.id}`,
      created_at: r.created_at,
    };
  });
}

export function mediaById(id: string): MediaRow | undefined {
  return listMedia().find((m) => m.id === id);
}

export function saveUpload(kind: MediaKind, filename: string, buf: Buffer): MediaRow {
  if (!EXT[kind].test(filename)) throw new Error(`Định dạng không nhận cho "${kind}".`);
  const q = quotaOf(listMedia().map((m) => ({ bytes: m.bytes })));
  if (q.full) throw new Error('Đã chạm giới hạn 50 MB / 30 tệp.');
  if (q.bytes + buf.length > QUOTA.bytes) throw new Error('Tệp này sẽ vượt quá 50 MB.');

  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const id = randomUUID();
  const name = safeName(filename);
  const abs = path.join(MEDIA_DIR, `${id}-${name}`);
  fs.writeFileSync(abs, buf);

  studioDb()
    .prepare('INSERT INTO studio_media (id, kind, path, bytes, meta_json) VALUES (?,?,?,?,?)')
    .run(id, kind, abs, buf.length, JSON.stringify({ name: filename }));
  return mediaById(id)!;
}

export function deleteMedia(id: string): boolean {
  const row = mediaById(id);
  if (!row) return false;
  fs.rmSync(row.path, { force: true });
  studioDb().prepare('DELETE FROM studio_media WHERE id=?').run(id);
  return true;
}
