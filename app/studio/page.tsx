import Link from 'next/link';
import { studioDb } from '@/lib/studio/db';
import { listLibrary, suggestionsFor, type Suggestion } from '@/lib/studio/library';
import { channelSource } from '@/lib/studio/sources';
import { can, tier } from '@/lib/studio/tier';
import { visibleChannels, visibleChannelIds } from '@/lib/studio/visible';
import { NewRunBox, type ChannelRow } from './components/NewRunBox';
import newTour from '@/lib/studio/tours/new.json';
import { Tour } from './components/Tour';

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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      {/* Small, but present: the drawing has no title here, and every screen still needs one
          heading for structure and for a screen reader. */}
      <h1 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        /studio · tạo mới
      </h1>

      <NewRunBox channels={channels} kits={kits} canSpend={can(t, 'spend')} />

      <section>
        <h2 className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Gợi ý từ kho nguồn · bài gold chưa có video
        </h2>
        {gợi.length === 0 ? (
          <p className="text-sm text-muted-foreground/70">Chưa có bài nào chờ dựng.</p>
        ) : (
          <ul data-testid="suggestions" className="grid gap-2 sm:grid-cols-2">
            {gợi.map((s) => (
              <li key={s.itemRef}>
                <Link
                  href={`/studio/runs/new?item=${encodeURIComponent(s.itemRef)}&market=${
                    all.find((c) => channelSource(c.sources_json).def.kind === 'gold')?.market_id ?? ''
                  }`}
                  data-testid="suggestion"
                  className="pen-line-static block rounded-md bg-card px-2.5 py-2 hover:bg-secondary"
                >
                  <span className="line-clamp-2 text-[13px] leading-snug">{s.title}</span>
                  <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    gold {s.source ? `· ${s.source}` : ''} · chưa có reel
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Kết quả gần đây
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground/70">Chưa có lượt chạy nào.</p>
        ) : (
          <ul data-testid="recent" className="flex flex-wrap gap-2">
            {recent.map((r) => {
              const png = r.assets.find((a) => a.kind === 'png');
              return (
                <li key={r.runId}>
                  <Link
                    href={`/studio/runs/${r.runId}`}
                    data-testid="recent-item"
                    title={`${r.title}\n${r.channelName} · ${r.status}`}
                    className="block w-20"
                  >
                    {png?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={png.url} alt="" className="pen-line-static aspect-[4/5] w-full rounded-md object-cover" />
                    ) : (
                      <span className="grid aspect-[4/5] w-full place-items-center rounded-md border-2 border-dashed border-border text-[10px] text-muted-foreground">
                        —
                      </span>
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
  );
}
