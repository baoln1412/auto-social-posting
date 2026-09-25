'use client';

/**
 * The bell's contents, and the one button that empties it.
 *
 * `Đánh dấu đã đọc` clears the count, not the history: an alert stays readable after it has
 * been seen, because "what broke last week" is the question this list exists to answer.
 */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { BellOff, CheckCheck, TriangleAlert } from 'lucide-react';
import type { Alert } from '@/lib/studio/alerts';

const LABEL: Record<string, string> = {
  render: 'Dựng video',
  publish: 'Đăng bài',
  pipeline: 'Nguồn tự động',
};

export function AlertList({ alerts, unseen }: { alerts: Alert[]; unseen: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function clear() {
    setBusy(true);
    try {
      await fetch('/api/studio/alerts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="alerts" className="scroll-mt-4">
      <div className="st-sec">
        <h2>
          <TriangleAlert strokeWidth={2.25} />
          Cảnh báo
        </h2>
        {unseen > 0 && (
          <span data-testid="alerts-unseen" className="st-badge st-amber">
            <span className="st-num">{unseen}</span>&nbsp;chưa đọc
          </span>
        )}
        {alerts.length > 0 && (
          <button type="button" data-testid="alerts-clear" disabled={busy} onClick={clear} className="st-btn st-sm ml-auto">
            <CheckCheck strokeWidth={2.25} />
            Đánh dấu đã đọc
          </button>
        )}
      </div>

      {alerts.length === 0 ? (
        <div data-testid="alerts-empty" className="st-blank">
          <BellOff strokeWidth={2.25} />
          <b>Chưa có cảnh báo nào</b>
          <span>Bước nào hỏng, hoặc bài nào không gửi được, sẽ hiện ở đây và vào Telegram nếu đã nối.</span>
        </div>
      ) : (
        <ul data-testid="alerts-list" className="flex flex-col gap-1.5">
          {alerts.map((a) => (
            <li
              key={a.id}
              data-testid="alert-row"
              className={`st-quiet flex flex-wrap items-start gap-2 px-3 py-2 text-sm ${a.seen ? 'opacity-60' : ''}`}
            >
              <span className="st-badge st-grey">{LABEL[a.kind] ?? a.kind}</span>
              <span className="min-w-0 flex-1">{a.message}</span>
              <span className="st-num text-xs text-muted-foreground">
                {new Date(a.createdAt).toLocaleString('vi-VN')}
              </span>
              {a.runId && (
                <Link href={`/studio/runs/${a.runId}`} className="st-btn st-sm st-ghost">
                  Mở
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
