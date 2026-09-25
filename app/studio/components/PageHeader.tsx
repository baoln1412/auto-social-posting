import Link from 'next/link';
import { Bell, DollarSign } from 'lucide-react';
import { unseenCount } from '@/lib/studio/alerts';
import { studioDb } from '@/lib/studio/db';
import { tier } from '@/lib/studio/tier';

/**
 * The header bar every Studio page renders first: the page's own title and one-line subtitle
 * on the left; on the right what the reference shows as credits, translated into what this
 * owner actually has — this month's spend — plus the bell and the owner chip.
 *
 * A server component: the month's cost is one SUM over studio_steps, run per request.
 */
export function monthCostUsd(): number {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const row = studioDb()
    .prepare(
      `SELECT COALESCE(SUM(s.cost_usd), 0) AS usd FROM studio_steps s
       JOIN studio_runs r ON r.id = s.run_id WHERE r.created_at >= ?`,
    )
    .get(start.toISOString()) as { usd: number };
  return row.usd;
}

export function PageHeader({
  title,
  sub,
  right,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
}) {
  const usd = monthCostUsd();
  const alerts = unseenCount();
  const channels = (studioDb().prepare('SELECT COUNT(*) AS n FROM studio_channels').get() as { n: number }).n;
  const t = tier();
  return (
    <header data-testid="studio-header" className="st-top">
      <div className="min-w-0">
        <h1 data-testid="page-title" className="st-title truncate">
          {title}
        </h1>
        {sub ? <div className="st-subtitle truncate">{sub}</div> : null}
      </div>
      <div className="st-right">
        {right}
        <span data-testid="cost-pill" className="st-pill" title="Chi phí các lượt chạy tháng này">
          <DollarSign strokeWidth={2.25} />
          Tháng này <span className="st-num">${usd.toFixed(2)}</span>
        </span>
        {/* Server-rendered, so a failure raised by the advance the screen just made is in the
            bell as soon as that screen comes back — no poll, no lag. */}
        <Link href="/studio/analytics#alerts" data-testid="bell" className="st-bell" title="Thông báo">
          <Bell strokeWidth={2.25} />
          {alerts > 0 && (
            <i data-testid="bell-count" className="st-num">
              {alerts > 9 ? '9+' : alerts}
            </i>
          )}
        </Link>
        <span className="st-user">
          <span className="st-avatar">C</span>
          <span>
            <div className="st-n">Chủ kênh</div>
            <div className="st-e">
              <span className="st-num">{channels}</span> kênh · <span data-testid="tier-badge">{t}</span>
            </div>
          </span>
        </span>
      </div>
    </header>
  );
}
