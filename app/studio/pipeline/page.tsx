import Link from 'next/link';
import { notFound } from 'next/navigation';
import { query } from '@/app/lib/db';
import { loadPipeline } from '@/lib/studio/pipeline/config';
import { can, tier } from '@/lib/studio/tier';

export const dynamic = 'force-dynamic';

/** Which markets exist, and which of them have been set up here. */
export default async function PipelineIndex() {
  if (!can(tier(), 'run')) notFound();
  const { data } = await query('content_pages').select('id,name,country_code').order('name');
  const markets = (data ?? []) as { id: string; name: string; country_code: string }[];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <header>
        <h1 className="text-xl font-bold">Nguồn tự động</h1>
        <p className="text-sm text-muted-foreground">
          Một thiết lập cho mỗi thị trường: nguồn → lọc &amp; xếp → dạng bài → ảnh → lịch.
        </p>
      </header>

      <ul data-testid="market-list" className="flex flex-col gap-2">
        {markets.map((m) => {
          const p = loadPipeline(m.id);
          return (
            <li key={m.id}>
              <Link
                href={`/studio/pipeline/${m.id}`}
                data-testid="market-row"
                className="pen-line-static flex flex-wrap items-baseline gap-2 rounded-[var(--radius)] bg-card px-3 py-2 hover:bg-secondary"
              >
                <span className="text-sm font-semibold">{m.name}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {p.revision === 0
                    ? 'chưa thiết lập'
                    : `${p.config.output.format} · rev ${p.revision}`}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
