import Link from 'next/link';
import { notFound } from 'next/navigation';
import { History, Rss, Settings2, Sparkles } from 'lucide-react';
import { query } from '@/app/lib/db';
import { getGold, getGoldStats } from '@/app/lib/lake';
import { loadPipeline } from '@/lib/studio/pipeline/config';
import { scheduleText } from '@/lib/studio/pipeline/schedule';
import { can, tier } from '@/lib/studio/tier';

import { PageHeader } from '@/app/studio/components/PageHeader';

export const dynamic = 'force-dynamic';

const ago = (iso: string) => {
  const h = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000));
  if (h < 1) return 'dưới một giờ trước';
  return h < 48 ? `${h} giờ trước` : `${Math.round(h / 24)} ngày trước`;
};

/** Which markets exist, how much each has produced, and which have been set up here. */
export default async function PipelineIndex() {
  if (!can(tier(), 'run')) notFound();
  const { data } = await query('content_pages').select('id,name,country_code').order('name');
  const markets = (data ?? []) as { id: string; name: string; country_code: string }[];
  const schedule = scheduleText();

  // Gold counts come from the one cheap query that already exists; the card would be just a
  // name and a revision without them, which is what v2's list was.
  const stats = await Promise.all(markets.map((m) => getGoldStats(m.id).catch(() => null)));
  // "Last run" the way this repo can actually know it: the newest row the market produced.
  // audit_runs holds the crawler's own log, but reading it costs the whole audit summary —
  // feed health, per-source breakdowns and a Supabase round trip per market.
  const last = await Promise.all(
    markets.map((m) =>
      getGold({ marketId: m.id, limit: 1 })
        .then((g) => (g.rows[0]?.generated_at ? String(g.rows[0].generated_at) : null))
        .catch(() => null),
    ),
  );

  return (
    <>
      <PageHeader
        title="Nguồn tự động"
        sub="Một thiết lập cho mỗi thị trường: nguồn → lọc &amp; xếp → dạng bài → ảnh → lịch."
      />
      <div className="st-content">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          <div className="st-sec">
            <h2>
              <Rss strokeWidth={2.25} />
              Thị trường
            </h2>
            <span data-testid="pipeline-schedule-line" className="st-help">{schedule} · chung cho mọi thị trường</span>
          </div>

          {markets.length === 0 ? (
            <div data-testid="market-empty" className="st-blank">
              <Rss strokeWidth={2.25} />
              <b>Chưa có thị trường nào</b>
              <span>Thị trường được tạo ở trang Desoul Posting; Studio chỉ thiết lập dây chuyền cho nó.</span>
            </div>
          ) : (
            <ul data-testid="market-list" className="flex flex-col gap-2.5">
              {markets.map((m, i) => {
                const p = loadPipeline(m.id);
                const s = stats[i];
                return (
                  <li key={m.id}>
                    <Link
                      href={`/studio/pipeline/${m.id}`}
                      data-testid="market-row"
                      className="st-card flex flex-wrap items-center gap-3 px-3.5 py-3"
                    >
                      <span className="st-tile">
                        <Rss strokeWidth={2.25} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <b className="block truncate text-[15px]">{m.name}</b>
                        <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                          {last[i] && (
                            <span className="inline-flex items-center gap-1">
                              <History size={13} strokeWidth={2.25} />
                              bài mới nhất {ago(last[i]!)}
                            </span>
                          )}
                          {s && (
                            <span className="inline-flex items-center gap-1">
                              <Sparkles size={13} strokeWidth={2.25} />
                              <span className="st-num">{s.total}</span> bài Gold ·{' '}
                              <span className="st-num">{s.thisWeek}</span> tuần này
                            </span>
                          )}
                        </span>
                      </div>
                      {p.revision === 0 ? (
                        <span className="st-badge st-amber">chưa thiết lập</span>
                      ) : (
                        <span className="st-badge st-green">
                          {p.config.output.format} · bản{' '}
                          <span className="st-num">{p.revision}</span>
                        </span>
                      )}
                      <span className="st-btn st-sm">
                        <Settings2 strokeWidth={2.25} />
                        Thiết lập
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
