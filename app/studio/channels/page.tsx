import Link from 'next/link';
import { AtSign, MessageSquare, Plus, Rss, Tv } from 'lucide-react';
import { tier } from '@/lib/studio/tier';
import { visibleChannels } from '@/lib/studio/visible';
import { channelSource } from '@/lib/studio/sources';

import { PageHeader } from '@/app/studio/components/PageHeader';

export const dynamic = 'force-dynamic';

/** An icon per source kind — the row reads as what it is before the label is read. */
const ICON: Record<string, typeof Rss> = {
  gold: Rss,
  rss: Rss,
  facebook: AtSign,
  instagram: AtSign,
  threads: AtSign,
  reddit: MessageSquare,
};

export default function ChannelsPage() {
  const rows = visibleChannels(tier()) as unknown as {
    id: string;
    name: string;
    sources_json: string;
    makes_json: string;
    tier_min: string;
  }[];

  return (
    <>
      <PageHeader
        title="Kênh"
        sub="Mỗi kênh là một nguồn đã thử chạy được."
        right={
          <Link href="/studio/channels/new" data-testid="new-channel" className="st-btn st-primary st-sm">
            <Plus strokeWidth={2.5} />
            Kênh mới
          </Link>
        }
      />
      <div className="st-content">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          <div className="st-sec">
            <h2>
              <Tv strokeWidth={2.25} />
              Kênh của bạn
            </h2>
            <span className="st-help">Kênh quyết định nguồn, bộ nhận diện và nơi đăng</span>
            <span className="st-more st-num">{rows.length}</span>
          </div>

          {rows.length === 0 ? (
            <div data-testid="channels-empty" className="st-blank">
              <Tv strokeWidth={2.25} />
              <b>Chưa có kênh nào</b>
              <span>Kênh mới đi qua năm bước và bước hai phải lấy được bài thật.</span>
              <Link href="/studio/channels/new" className="st-btn st-sm st-primary">
                <Plus strokeWidth={2.5} />
                Kênh mới
              </Link>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((c) => {
                let makes: string[] = [];
                try {
                  makes = JSON.parse(c.makes_json || '[]');
                } catch {
                  /* an unreadable column is not worth a 500 */
                }
                const src = channelSource(c.sources_json);
                const Icon = ICON[src.def.kind] ?? Rss;
                return (
                  <li
                    key={c.id}
                    data-testid="channel-card"
                    className="st-card flex flex-wrap items-center gap-3 px-3.5 py-3"
                  >
                    <span className="st-tile">
                      <Icon strokeWidth={2.25} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <b className="block truncate text-[15px]">{c.name}</b>
                      <span className="block text-xs text-muted-foreground">{src.def.label}</span>
                    </div>
                    {makes.map((m) => (
                      <span key={m} className="st-chip st-soft">
                        {m}
                      </span>
                    ))}
                    <span className="st-badge st-grey">{c.tier_min}</span>
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
