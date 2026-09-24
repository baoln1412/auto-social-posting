import Link from 'next/link';
import { tier } from '@/lib/studio/tier';
import { visibleChannels } from '@/lib/studio/visible';
import { channelSource } from '@/lib/studio/sources';

import { PageHeader } from '@/app/studio/components/PageHeader';

export const dynamic = 'force-dynamic';

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
            Kênh mới
          </Link>
        }
      />
      <div className="st-content">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">

      <ul className="flex flex-col gap-2">
        {rows.map((c) => {
          let makes: string[] = [];
          try {
            makes = JSON.parse(c.makes_json || '[]');
          } catch {
            /* an unreadable column is not worth a 500 */
          }
          return (
            <li key={c.id} data-testid="channel-card" className="card-warm flex items-center gap-3 px-4 py-3">
              <span className="font-medium">{c.name}</span>
              <span className="st-label text-muted-foreground">
                {channelSource(c.sources_json).def.label}
              </span>
              <span className="ml-auto st-label text-muted-foreground">
                {makes.join(' · ')}
              </span>
              <span className="pen-line-sm rounded-md bg-secondary px-2 py-0.5 st-label">
                {c.tier_min}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
      </div>
    </>
  );
}
