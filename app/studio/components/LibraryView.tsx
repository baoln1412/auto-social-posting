'use client';

/**
 * Grouped by day, searchable by the thing the owner actually remembers — the link they
 * pasted. Grid or list, because a wall of thumbnails and a scannable table answer different
 * questions.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { groupByDay, matches, type LibraryItem, type Sort } from '@/lib/studio/library-pure';

function kb(n: number | null): string {
  if (!n) return '—';
  return n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

const STATUS: Record<string, string> = {
  done: 'xong',
  error: 'lỗi',
  blocked: 'bị chặn',
  running: 'đang chạy',
  new: 'mới',
};

export function LibraryView({ items }: { items: LibraryItem[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const [grid, setGrid] = useState(true);

  const days = useMemo(() => {
    const found = items.filter((i) => matches(i, q));
    const sorted = [...found].sort((a, b) =>
      sort === 'oldest'
        ? a.createdAt.localeCompare(b.createdAt)
        : sort === 'channel'
          ? a.channelName.localeCompare(b.channelName) || b.createdAt.localeCompare(a.createdAt)
          : b.createdAt.localeCompare(a.createdAt),
    );
    return sort === 'channel' ? [{ day: 'Theo kênh', items: sorted }] : groupByDay(sorted);
  }, [items, q, sort]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          data-testid="lib-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm theo link nguồn, tên kênh, tiêu đề hoặc mã…"
          className="pen-line-static min-w-[16rem] flex-1 rounded-md bg-card px-3 py-2 text-sm outline-none"
        />
        <select
          data-testid="lib-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="pen-line-static rounded-md bg-card px-2 py-2 text-xs"
        >
          <option value="newest">Mới nhất</option>
          <option value="oldest">Cũ nhất</option>
          <option value="channel">Theo kênh</option>
        </select>
        <button
          type="button"
          data-testid="lib-view"
          onClick={() => setGrid((g) => !g)}
          className="pen-line-sm rounded-md bg-card px-3 py-2 text-xs font-semibold"
        >
          {grid ? 'Dạng bảng' : 'Dạng lưới'}
        </button>
        <button
          type="button"
          data-testid="lib-refresh"
          onClick={() => router.refresh()}
          className="pen-line-sm rounded-md bg-card px-3 py-2 text-xs font-semibold"
        >
          Làm mới
        </button>
      </div>

      {days.length === 0 && (
        <p data-testid="lib-empty" className="text-sm text-muted-foreground">
          Không có lượt chạy nào khớp.
        </p>
      )}

      {days.map((d) => (
        <section key={d.day} data-testid="lib-day">
          <h2 className="mb-2 st-label text-muted-foreground">
            {d.day} · {d.items.length}
          </h2>

          <ul className={grid ? 'grid gap-3 sm:grid-cols-3 lg:grid-cols-4' : 'flex flex-col gap-2'}>
            {d.items.map((i) => {
              const png = i.assets.find((a) => a.kind === 'png');
              const mp4 = i.assets.find((a) => a.kind === 'mp4');
              const tip = [
                i.title,
                png && `ảnh: ${kb(png.bytes)}`,
                mp4 && `video: ${kb(mp4.bytes)}`,
                `trạng thái: ${STATUS[i.status] ?? i.status}`,
              ]
                .filter(Boolean)
                .join('\n');

              return (
                <li
                  key={i.runId}
                  data-testid="lib-item"
                  title={tip}
                  className={`card-warm ${grid ? 'flex h-full flex-col gap-2 p-2' : 'flex items-center gap-3 px-3 py-2'}`}
                >
                  <Link href={`/studio/runs/${i.runId}`} className={grid ? '' : 'contents'}>
                    {png?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={png.url}
                        alt=""
                        data-testid="lib-thumb"
                        className={
                          grid
                            ? 'aspect-[4/5] w-full rounded-md object-cover'
                            : 'h-10 w-10 shrink-0 rounded-md object-cover'
                        }
                      />
                    ) : (
                      <span className={`grid place-items-center rounded-md bg-secondary text-[10px] text-muted-foreground ${grid ? 'aspect-[4/5] w-full' : 'h-10 w-10 shrink-0'}`}>
                        —
                      </span>
                    )}
                    <span className={`block text-xs ${grid ? 'line-clamp-2' : 'flex-1 truncate'}`}>
                      {i.title}
                    </span>
                  </Link>

                  <div className={`flex items-center gap-2 ${grid ? 'mt-auto' : 'ml-auto'}`}>
                    <span className="truncate st-label text-muted-foreground">
                      {i.channelName} · {STATUS[i.status] ?? i.status}
                    </span>
                    {mp4?.url && (
                      <a
                        href={mp4.url}
                        download
                        data-testid="lib-download"
                        className="pen-line-sm rounded-md bg-card px-2 py-0.5 text-[10px] font-semibold"
                      >
                        Tải
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
