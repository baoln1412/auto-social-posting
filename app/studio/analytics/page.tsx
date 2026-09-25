import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BarChart3, Eye, Heart, Users } from 'lucide-react';
import { query } from '@/app/lib/db';
import AnalyticsDashboard from '@/app/components/analytics/AnalyticsDashboard';
import { recent, unseenCount } from '@/lib/studio/alerts';
import { listLibrary } from '@/lib/studio/library';
import { latestFor } from '@/lib/studio/metrics';
import { windowRows } from '@/lib/studio/publish/queue';
import { can, tier } from '@/lib/studio/tier';
import { visibleChannelIds } from '@/lib/studio/visible';

import { PageHeader } from '@/app/studio/components/PageHeader';
import { AlertList } from '@/app/studio/components/AlertList';

export const dynamic = 'force-dynamic';

/**
 * Two different questions on one page.
 *
 * The top half is the market's own content: the SPA's dashboard, imported, counting gold rows.
 * The bottom half is Studio's — what each run it posted actually did, and what broke. A run
 * with no numbers beside one that has them is the honest way to show a post Graph would not
 * give insights for; a zero would be a lie.
 */
export default async function AnalyticsPage({ searchParams }: { searchParams: { market?: string } }) {
  if (!can(tier(), 'run')) notFound();
  const { data } = await query('content_pages').select('id,name').order('name');
  const markets = (data ?? []) as { id: string; name: string }[];
  const current = markets.find((m) => m.id === searchParams.market) ?? markets[0];

  const runs = listLibrary({ channelIds: visibleChannelIds(tier()) }).slice(0, 40);
  const sent = windowRows(new Date(0).toISOString(), new Date().toISOString()).filter((r) => r.status === 'sent');
  const posted = new Map(sent.map((r) => [r.runId, r]));
  const rows = runs.filter((r) => posted.has(r.runId));
  const metrics = latestFor(rows.map((r) => r.runId));

  return (
    <>
      <PageHeader title="Số liệu" sub="Bài của thị trường, và những gì Studio đã đăng." />
      <div className="st-content">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
          {markets.length > 1 && (
            <div data-testid="an-markets" className="flex flex-wrap gap-1.5">
              {markets.map((m) => (
                <Link
                  key={m.id}
                  href={`/studio/analytics?market=${m.id}`}
                  className={`st-chip ${m.id === current?.id ? 'st-on' : 'st-soft'}`}
                >
                  {m.name}
                </Link>
              ))}
            </div>
          )}

          <div data-testid="an-dashboard">
            {current ? (
              <AnalyticsDashboard pageId={current.id} />
            ) : (
              <p className="text-sm text-muted-foreground">Chưa có thị trường nào.</p>
            )}
          </div>

          <section>
            <div className="st-sec">
              <h2>
                <BarChart3 strokeWidth={2.25} />
                Video Studio đã đăng
              </h2>
              <span className="st-help">Số liệu đọc lại mỗi ngày qua trang đã nối</span>
              <span className="st-more st-num">{rows.length}</span>
            </div>
            {rows.length === 0 ? (
              <div data-testid="an-empty" className="st-blank">
                <BarChart3 strokeWidth={2.25} />
                <b>Chưa đăng video nào</b>
                <span>Đăng một video ở bước Đăng rồi quay lại — số liệu về sau khoảng một ngày.</span>
              </div>
            ) : (
              <ul data-testid="an-runs" className="flex flex-col gap-2">
                {rows.map((r) => {
                  const m = metrics[r.runId];
                  return (
                    <li key={r.runId} data-testid="an-run" className="st-card flex flex-wrap items-center gap-3 px-3.5 py-3">
                      <div className="min-w-0 flex-1">
                        <b className="block truncate text-sm">{r.title}</b>
                        <span className="block text-xs text-muted-foreground">
                          {r.channelName} · {new Date(posted.get(r.runId)!.at).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                      {m ? (
                        <span className="flex flex-wrap items-center gap-3 text-sm">
                          <span className="inline-flex items-center gap-1" title="Lượt xem">
                            <Eye size={14} strokeWidth={2.25} />
                            <span className="st-num">{m.views.toLocaleString('vi-VN')}</span>
                          </span>
                          <span className="inline-flex items-center gap-1" title="Người tiếp cận">
                            <Users size={14} strokeWidth={2.25} />
                            <span className="st-num">{m.reach.toLocaleString('vi-VN')}</span>
                          </span>
                          <span className="inline-flex items-center gap-1" title="Cảm xúc">
                            <Heart size={14} strokeWidth={2.25} />
                            <span className="st-num">{m.reactions.toLocaleString('vi-VN')}</span>
                          </span>
                        </span>
                      ) : (
                        <span data-testid="an-nonumbers" className="st-badge st-grey">
                          chưa có số liệu
                        </span>
                      )}
                      <Link href={`/studio/runs/${r.runId}`} className="st-btn st-sm">
                        Mở
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <AlertList alerts={recent(50)} unseen={unseenCount()} />
        </div>
      </div>
    </>
  );
}
