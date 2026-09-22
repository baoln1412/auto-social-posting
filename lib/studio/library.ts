/**
 * What a run left behind. The searchable, groupable half lives in library-pure.ts so the
 * client can use it without this file's SQLite import.
 */
import { studioDb } from './db';
import { matches, type LibraryItem, type Sort } from './library-pure';

export * from './library-pure';

function parse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function listLibrary(opts: { q?: string; sort?: Sort } = {}): LibraryItem[] {
  const d = studioDb();
  // ponytail: reads every run and its steps. At tens to hundreds of runs that is a few ms;
  // add a denormalised source_url column if this ever shows up in a profile.
  const runs = d
    .prepare(
      `SELECT r.id, r.item_ref, r.status, r.created_at, c.name AS channel_name
       FROM studio_runs r LEFT JOIN studio_channels c ON c.id = r.channel_id
       ORDER BY r.created_at DESC`,
    )
    .all() as any[];

  const steps = d.prepare('SELECT run_id, name, output_ref FROM studio_steps').all() as any[];
  const assets = d
    .prepare('SELECT run_id, kind, path, bytes, meta_json FROM studio_assets')
    .all() as any[];

  const items: LibraryItem[] = runs.map((r) => {
    const mine = steps.filter((s) => s.run_id === r.id);
    const fetched = parse<any>(mine.find((s) => s.name === 'fetch')?.output_ref, null);
    const drafted = parse<any>(mine.find((s) => s.name === 'draft')?.output_ref, null);
    return {
      runId: r.id,
      channelName: r.channel_name ?? '(kênh đã xoá)',
      title: drafted?.title ?? fetched?.title ?? '(chưa có tiêu đề)',
      sourceUrl: fetched?.url ?? null,
      itemRef: r.item_ref,
      status: r.status,
      createdAt: r.created_at,
      assets: assets
        .filter((a) => a.run_id === r.id)
        .map((a) => ({
          kind: a.kind,
          url: parse<{ url?: string }>(a.meta_json, {}).url ?? '',
          path: a.path,
          bytes: a.bytes,
        })),
    };
  });

  const found = opts.q ? items.filter((i) => matches(i, opts.q!)) : items;
  const sort = opts.sort ?? 'newest';
  return [...found].sort((a, b) =>
    sort === 'oldest'
      ? a.createdAt.localeCompare(b.createdAt)
      : sort === 'channel'
        ? a.channelName.localeCompare(b.channelName) || b.createdAt.localeCompare(a.createdAt)
        : b.createdAt.localeCompare(a.createdAt),
  );
}
