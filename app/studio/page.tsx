import Link from 'next/link';
import { Clock, FileText, Image as ImageIcon, PenLine, Play, Send, Sparkles, Video } from 'lucide-react';
import { query } from '@/app/lib/db';
import { getRun, previewStep } from '@/lib/studio/runs';
import { scheduleText } from '@/lib/studio/pipeline/schedule';
import { RUN_STATUS_LABELS } from '@/lib/studio/steps/types';
import { studioDb } from '@/lib/studio/db';
import { listLibrary, suggestionsFor, type Suggestion } from '@/lib/studio/library';
import { channelSource } from '@/lib/studio/sources';
import { can, tier } from '@/lib/studio/tier';
import { visibleChannels, visibleChannelIds } from '@/lib/studio/visible';
import { NewRunBox, type ChannelRow, type PipelineFacts } from './components/NewRunBox';
import newTour from '@/lib/studio/tours/new.json';
import { Tour } from './components/Tour';

import { PageHeader } from '@/app/studio/components/PageHeader';

export const dynamic = 'force-dynamic';

/** Gold posts of the first gold channel that have no Studio reel yet. Best-effort: a source
 *  that cannot answer must not take the whole page down with it. */
async function suggestions(channels: { id: string; sources_json: string }[]): Promise<Suggestion[]> {
  const gold = channels.find((c) => channelSource(c.sources_json).def.kind === 'gold');
  if (!gold) return [];
  try {
    const { def, cfg } = channelSource(gold.sources_json);
    const items = await def.list(cfg, 12);
    return suggestionsFor(items.map((i) => ({ id: i.id, title: i.title, source: i.source })));
  } catch {
    return [];
  }
}


/** The composed first frame of a run's reel, as its own Video step previews it — or null. */
async function frameOf(runId: string): Promise<string | null> {
  const rec = getRun(runId);
  if (!rec) return null;
  const p = await previewStep(rec, 'reel');
  const d = p.data as { firstFrameUrl?: string } | null;
  return p.kind === 'scenes' && d?.firstFrameUrl ? d.firstFrameUrl : null;
}

const RAIL = [
  ['Đọc bài', FileText],
  ['Viết bài', PenLine],
  ['Ảnh', ImageIcon],
  ['Video', Video],
  ['Đăng', Send],
] as const;

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

export default async function StudioNewPage() {
  const t = tier();
  const all = visibleChannels(t);
  const channels = all.map((c) => ({
    id: c.id,
    name: c.name,
    kit_id: c.kit_id,
    tier_min: c.tier_min,
  })) as ChannelRow[];

  const kits = studioDb().prepare('SELECT id, name FROM studio_kits ORDER BY name').all() as {
    id: string;
    name: string;
  }[];

  const [gợi, recent] = await Promise.all([
    suggestions(all as unknown as { id: string; sources_json: string }[]),
    Promise.resolve(listLibrary({ channelIds: visibleChannelIds(t) }).slice(0, 6)),
  ]);
  const goldChannel = all.find((c) => channelSource(c.sources_json).def.kind === 'gold');
  const marketId = goldChannel?.market_id ?? '';
  let marketName = '';
  if (marketId) {
    const { data } = await query('content_pages').select('name').eq('id', marketId).single();
    marketName = (data as { name?: string } | null)?.name ?? '';
  }
  const pipeline: PipelineFacts = {
    market: marketId ? { id: marketId, name: marketName } : null,
    schedule: scheduleText(),
    pending: gợi.length,
  };
  const frames = await Promise.all(recent.map((r) => frameOf(r.runId).catch(() => null)));
  const total = listLibrary({ channelIds: visibleChannelIds(t) }).length;

  return (
    <>
      <PageHeader title="Tạo video" />
      <div className="st-content">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <h2 className="text-center text-[40px] font-extrabold leading-none" style={{ fontFamily: "'Baloo 2', system-ui, sans-serif" }}>
        Dựng <em className="text-primary" style={{ fontStyle: 'italic', fontWeight: 700 }}>video mới</em>
      </h2>

      <div data-testid="create-rail" className="flex flex-wrap justify-center gap-1.5">
        {RAIL.map(([label, Icon]) => (
          <span key={label} className="st-chip st-soft text-muted-foreground">
            <Icon strokeWidth={2.25} className="text-primary" />
            {label}
          </span>
        ))}
      </div>

      <NewRunBox channels={channels} kits={kits} canSpend={can(t, 'spend')} pipeline={pipeline} />

      <section className="mx-auto w-full max-w-[720px]">
        <div className="st-sec">
          <h2>
            <Sparkles strokeWidth={2.25} />
            Gợi ý từ kho nguồn
          </h2>
          <span className="st-help">Bài Gold mới nhất chưa có video</span>
        </div>
        {gợi.length === 0 ? (
          <p className="text-sm text-muted-foreground/70">Chưa có bài nào chờ dựng.</p>
        ) : (
          <ul data-testid="suggestions" className="grid gap-3 sm:grid-cols-2">
            {gợi.map((s) => (
              <li key={s.itemRef} data-testid="suggestion" className="st-card flex flex-col gap-1.5 px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <b data-testid="suggestion-source" className="block truncate text-sm">
                      {s.source || marketName || 'Kho nguồn'}
                    </b>
                    <small className="block text-[11px] text-muted-foreground">Kho nguồn{s.day ? ` · ${s.day}` : ''}</small>
                  </div>
                  <Link
                    href={`/studio/runs/new?item=${encodeURIComponent(s.itemRef)}&market=${marketId}`}
                    data-testid="suggestion-go"
                    aria-label="Tạo video từ bài này"
                    title="Tạo video từ bài này"
                    className="st-btn st-sm st-icon"
                  >
                    <Video strokeWidth={2.25} />
                  </Link>
                </div>
                <p className="line-clamp-2 text-sm leading-snug">{s.title}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="st-badge st-green">Gold</span>
                  <span>chưa có video</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mx-auto w-full max-w-[720px]">
        <div className="st-sec">
          <h2>
            <Clock strokeWidth={2.25} />
            Kết quả gần đây
          </h2>
          <span className="st-help">Video giữ trên đĩa của bạn — không hết hạn</span>
          <Link href="/studio/library" data-testid="recent-all" className="st-more">
            Xem tất cả (<span className="st-num">{total}</span>) →
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground/70">Chưa có lượt chạy nào.</p>
        ) : (
          <ul data-testid="recent" className="flex flex-wrap gap-3">
            {recent.map((r, i) => {
              const frame = frames[i] ?? r.assets.find((a) => a.kind === 'png')?.url ?? null;
              const why =
                r.status === 'running'
                  ? 'đang render…'
                  : r.status === 'done'
                    ? 'chưa có ảnh'
                    : (RUN_STATUS_LABELS[r.status] ?? r.status);
              return (
                <li key={r.runId}>
                  <Link
                    href={`/studio/runs/${r.runId}`}
                    data-testid="recent-item"
                    title={`${r.title}\n${r.channelName} · ${RUN_STATUS_LABELS[r.status] ?? r.status}`}
                    className={`st-thumb block ${frame ? '' : 'st-empty grid place-items-center px-2'}`}
                  >
                    {frame ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={frame} alt="" />
                        <span className="st-t">{hhmm(r.createdAt)}</span>
                        <span className="st-play">
                          <b>
                            <Play size={14} strokeWidth={2.25} />
                          </b>
                        </span>
                      </>
                    ) : (
                      <span>{why}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Tour id="new" steps={newTour} />
    </div>
      </div>
    </>
  );
}
