/**
 * The search and grouping half of the library, kept import-free.
 *
 * LibraryView.tsx is 'use client' and calls `matches`/`groupByDay`. Importing them from the
 * module that also opens SQLite dragged better-sqlite3 into the browser bundle and the whole
 * route failed to compile with "Can't resolve 'fs'" — the same seam app/lib/videoSteps.ts
 * exists to hold.
 */
export interface LibraryAsset {
  kind: string;
  url: string;
  path: string | null;
  bytes: number | null;
}

export interface LibraryItem {
  runId: string;
  channelName: string;
  title: string;
  sourceUrl: string | null;
  itemRef: string | null;
  status: string;
  createdAt: string;
  assets: LibraryAsset[];
}

export type Sort = 'newest' | 'oldest' | 'channel';

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export function matches(item: LibraryItem, q: string): boolean {
  const needle = fold(q.trim());
  if (!needle) return true;
  return fold(
    [item.runId, item.channelName, item.title, item.sourceUrl, item.itemRef]
      .filter(Boolean)
      .join(' '),
  ).includes(needle);
}

/** Newest day first, and newest run first inside each day. */
export function groupByDay(items: LibraryItem[]): { day: string; items: LibraryItem[] }[] {
  const by = new Map<string, LibraryItem[]>();
  for (const i of items) {
    // The server and the owner are the same machine, so the server's local day is the
    // owner's day. ponytail: a hosted Studio would need the viewer's offset.
    const day = new Date(i.createdAt).toLocaleDateString('vi-VN');
    (by.get(day) ?? by.set(day, []).get(day)!).push(i);
  }
  return [...by.entries()]
    .map(([day, list]) => ({
      day,
      items: [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }))
    .sort((a, b) => b.items[0].createdAt.localeCompare(a.items[0].createdAt));
}
