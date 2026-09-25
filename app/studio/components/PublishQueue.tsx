'use client';

/**
 * Studio's overlay on the calendar: what Studio itself will send, and what it already did.
 *
 * The SPA's `ContentCalendar` draws the gold posts' own schedule — `scheduled_at` on the lake
 * row. That is a different fact from "Studio has a row queued to push this reel to a page at
 * 18:00", and merging them into one grid would make both unreadable. So they sit side by side.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock, TriangleAlert } from 'lucide-react';
import type { PublishRow } from '@/lib/studio/publish/queue';

const WHERE = (w: string) =>
  w.startsWith('facebook:') ? 'Facebook' : w === 'telegram' ? 'Telegram' : 'Thư viện';

export function PublishQueue() {
  const [rows, setRows] = useState<PublishRow[] | null>(null);

  useEffect(() => {
    let live = true;
    const read = async () => {
      try {
        const r = await fetch('/api/studio/publish');
        const b = (await r.json()) as { rows: PublishRow[] };
        if (live) setRows(b.rows ?? []);
      } catch {
        if (live) setRows([]);
      }
    };
    void read();
    const t = setInterval(read, 30_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const pending = (rows ?? []).filter((r) => r.status === 'pending');
  const past = (rows ?? []).filter((r) => r.status !== 'pending').slice(-20).reverse();

  return (
    <div className="flex flex-col gap-4">
      <section>
        <div className="st-sec">
          <h2>
            <Clock strokeWidth={2.25} />
            Studio sẽ đăng
          </h2>
          <span className="st-more st-num">{pending.length}</span>
        </div>
        {rows === null ? (
          <p className="text-sm text-muted-foreground">Đang đọc…</p>
        ) : pending.length === 0 ? (
          <div data-testid="queue-empty" className="st-blank">
            <Clock strokeWidth={2.25} />
            <b>Chưa hẹn giờ bài nào</b>
            <span>Chọn giờ ở bước Đăng của một lượt chạy và nó hiện ở đây.</span>
          </div>
        ) : (
          <ul data-testid="queue-pending" className="flex flex-col gap-2">
            {pending.map((r) => (
              <li key={r.id} data-testid="queue-row" className="st-card flex flex-wrap items-center gap-2 px-3 py-2.5">
                <span className="st-badge st-grey">{WHERE(r.where)}</span>
                <span className="st-num text-sm">{new Date(r.at).toLocaleString('vi-VN')}</span>
                <Link href={`/studio/runs/${r.runId}`} className="st-btn st-sm ml-auto">
                  Mở lượt chạy
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <div className="st-sec">
            <h2>
              <CheckCircle2 strokeWidth={2.25} />
              Đã gửi
            </h2>
          </div>
          <ul data-testid="queue-past" className="flex flex-col gap-1.5">
            {past.map((r) => (
              <li key={r.id} className="st-quiet flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                {r.status === 'failed' ? (
                  <TriangleAlert size={15} strokeWidth={2.25} className="text-[hsl(var(--destructive))]" />
                ) : (
                  <CheckCircle2 size={15} strokeWidth={2.25} className="text-primary" />
                )}
                <b>{WHERE(r.where)}</b>
                <span className="st-num text-xs text-muted-foreground">
                  {new Date(r.at).toLocaleString('vi-VN')}
                </span>
                {r.error && <span className="w-full text-xs text-[hsl(var(--destructive))]">{r.error}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
