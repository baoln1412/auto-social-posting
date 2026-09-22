import Link from 'next/link';
import { studioDb } from '@/lib/studio/db';
import { channelSource } from '@/lib/studio/sources';

export const dynamic = 'force-dynamic';

export default function ChannelsPage() {
  const rows = studioDb()
    .prepare('SELECT id, name, sources_json, makes_json, tier_min FROM studio_channels ORDER BY created_at')
    .all() as { id: string; name: string; sources_json: string; makes_json: string; tier_min: string }[];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Kênh</h1>
          <p className="text-sm text-muted-foreground">Mỗi kênh là một nguồn đã thử chạy được.</p>
        </div>
        <Link
          href="/studio/channels/new"
          data-testid="new-channel"
          className="pen-line-sm rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
        >
          Kênh mới
        </Link>
      </header>

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
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {channelSource(c.sources_json).def.label}
              </span>
              <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {makes.join(' · ')}
              </span>
              <span className="pen-line-sm rounded-md bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider">
                {c.tier_min}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
