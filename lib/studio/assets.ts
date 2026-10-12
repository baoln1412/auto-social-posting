/**
 * The backgrounds, stickers and music a reel can use: the shipped pack, plus the owner's
 * own uploads.
 *
 * This file used to say "uploads only — fetching someone else's asset library is a
 * licensing problem this project does not need", and that was right while nobody had
 * decided a licence. The decision is made: CC0 and no-attribution sources only, every file
 * carrying its licence in deploy/assets/media/licences.json, pulled by
 * deploy/pull-assets.py. An empty shelf is not neutrality — it is a feature nobody can use.
 *
 * The two pools differ in one way that matters: the shipped pack is the product and does
 * not touch the owner's 50 MB / 30 file budget, and it cannot be deleted from the UI
 * because the repo owns those files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { studioDb } from './db';

export type MediaKind = 'bg' | 'sticker' | 'music' | 'sfx';

export const QUOTA = { bytes: 50 * 1024 * 1024, files: 30 };

export const MEDIA_DIR = path.join(process.cwd(), 'data', 'studio-media');
/** The committed pack. Kinds are subdirectories; licences.json sits beside them. */
export const SHIPPED_DIR = path.join(process.cwd(), 'deploy', 'assets', 'media');

export interface Licence {
  /** Where it came from, as a URL a person can open and check. */
  source: string;
  /** The licence itself — "cc0", "pixabay", "mixkit". No attribution-required licences. */
  licence: string;
  title?: string;
  creator?: string;
}

export interface MediaRow {
  id: string;
  kind: MediaKind;
  path: string;
  bytes: number;
  name: string;
  url: string;
  created_at: string;
  /** Set on shipped rows only; an upload's provenance is the owner. */
  licence?: Licence;
  shipped?: boolean;
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
  // Its own kind, not a short piece of music: the reel places one per scene change, and a
  // 40s bed in the transition picker is a different mistake from a whoosh in the bed picker.
  sfx: /\.(mp3|m4a|wav|ogg|flac)$/i,
};

/** The licence manifest, read once per call and tolerant of a pack that is not there yet. */
function licences(): Record<string, Licence> {
  try {
    return JSON.parse(fs.readFileSync(path.join(SHIPPED_DIR, 'licences.json'), 'utf8'));
  } catch {
    return {};
  }
}

/**
 * The committed pack for one kind.
 *
 * A file with no entry in licences.json is skipped rather than shown: an asset whose
 * licence nobody can name is exactly what the old "uploads only" rule was protecting
 * against, and shipping one silently would bring the problem back.
 */
export function listShipped(kind: MediaKind): MediaRow[] {
  const dir = path.join(SHIPPED_DIR, kind);
  const lic = licences();
  let names: string[];
  try {
    names = fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
  const out: MediaRow[] = [];
  for (const name of names) {
    if (!EXT[kind].test(name)) continue;
    const rel = `${kind}/${name}`;
    const licence = lic[rel];
    if (!licence) continue;
    const abs = path.join(dir, name);
    let bytes = 0;
    try {
      bytes = fs.statSync(abs).size;
    } catch {
      continue;
    }
    out.push({
      id: `shipped:${rel}`,
      kind,
      path: abs,
      bytes,
      name: licence.title ?? name,
      url: `/api/studio/media/${encodeURIComponent(`shipped:${rel}`)}`,
      created_at: '',
      licence,
      shipped: true,
    });
  }
  return out;
}

/** What the quota bar reads: the owner's uploads, never the pack. */
export function libraryQuota() {
  return quotaOf(uploads().map((m) => ({ bytes: m.bytes })));
}

/** The owner's own rows, which is what the quota and the delete button act on. */
export function uploads(kind?: MediaKind): MediaRow[] {
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

/** Both pools. The owner's own first — a pack of fifty would bury three uploads. */
export function listMedia(kind?: MediaKind): MediaRow[] {
  const kinds: MediaKind[] = kind ? [kind] : (['bg', 'sticker', 'music', 'sfx'] as MediaKind[]);
  return [...uploads(kind), ...kinds.flatMap((k) => listShipped(k))];
}

export function mediaById(id: string): MediaRow | undefined {
  if (id.startsWith('shipped:')) {
    const kind = id.slice('shipped:'.length).split('/')[0] as MediaKind;
    return listShipped(kind).find((r) => r.id === id);
  }
  return listMedia().find((m) => m.id === id);
}

export function saveUpload(kind: MediaKind, filename: string, buf: Buffer): MediaRow {
  if (!EXT[kind].test(filename)) throw new Error(`Định dạng không nhận cho "${kind}".`);
  const q = libraryQuota();
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
  if (id.startsWith('shipped:')) {
    throw new Error('Tệp đi kèm sẵn — không xoá được. Chỉ xoá được tệp bạn tải lên.');
  }
  const row = mediaById(id);
  if (!row) return false;
  fs.rmSync(row.path, { force: true });
  studioDb().prepare('DELETE FROM studio_media WHERE id=?').run(id);
  return true;
}
