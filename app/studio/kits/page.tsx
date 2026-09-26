import Link from 'next/link';
import { studioDb } from '@/lib/studio/db';
import { shippedIds } from '@/lib/studio/kits/create';
import { query } from '@/app/lib/db';
import { getGold } from '@/app/lib/lake';
import { cardParams, cardPath } from '@/lib/studio/kits/load';
import type { Kit } from '@/lib/studio/steps/types';

import { PageHeader } from '@/app/studio/components/PageHeader';
import { KitRowActions, NewKitButton, type KitChoice } from '@/app/studio/components/KitActions';

export const dynamic = 'force-dynamic';

/** One headline, every kit — the only way to see what a kit actually changes. */
const SAMPLE = {
  title: 'MỸ: CỤ BÀ 82 TUỔI Ở POMONA BỊ LỪA MẤT 2.500 ĐÔ VÌ CHIÊU VÉ SỐ TRÚNG THƯỞNG',
};

/**
 * A real article from the lake, because all three shipped kits set `card.background:
 * 'article'` and this page drew every one of them with no article at all — "the only way to
 * see what a kit actually changes" was not showing the thing every one of them changes.
 *
 * The ARTICLE URL, not the picture: that is what `image.ts` passes in a real run
 * (`cardParams(kit, draft, item?.url)`), and a preview that feeds the renderer something
 * different from production is a preview of nothing. Best effort — an empty lake previews
 * without one, as before.
 */
async function sampleArticle(): Promise<{ page?: string; picture?: string }> {
  try {
    const { data } = await query('content_pages').select('id').limit(1);
    const marketId = ((data ?? []) as { id: string }[])[0]?.id;
    if (!marketId) return {};
    const { rows } = await getGold({ marketId, limit: 1 });
    const ok = (u: unknown) => (typeof u === 'string' && /^https?:/.test(u) ? u : undefined);
    return { page: ok(rows[0]?.article_url), picture: ok(rows[0]?.image_url) };
  } catch {
    return {};
  }
}

export default async function KitsPage() {
  const rows = studioDb().prepare('SELECT id, name, json FROM studio_kits ORDER BY id').all() as {
    id: string;
    name: string;
    json: string;
  }[];
  const sample = await sampleArticle();
  const shipped = shippedIds();
  // A plain array of plain values: a server page must not hand a client component anything
  // it cannot serialise, and it must not import one's constants either.
  const choices: KitChoice[] = rows.map((r) => ({ id: r.id, name: r.name, shipped: shipped.has(r.id) }));

  // Which channels wear which kit — the fact that decides whether a kit can be deleted, and
  // the one thing the page never said.
  const users = studioDb()
    .prepare('SELECT kit_id, COUNT(*) AS n FROM studio_channels GROUP BY kit_id')
    .all() as { kit_id: string | null; n: number }[];
  const inUse = new Map(users.map((u) => [u.kit_id ?? '', u.n]));

  return (
    <>
      <PageHeader
        title="Bộ nhận diện"
        sub="Cùng một tiêu đề, mỗi bộ một kiểu. Đây là cách duy nhất thấy được bộ nào đổi cái gì."
        right={<NewKitButton kits={choices} />}
      />
      <div className="st-content">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">

      <ul data-testid="kit-grid" className="grid gap-6 sm:grid-cols-2">
        {rows.map((r) => {
          let kit: Kit;
          try {
            kit = JSON.parse(r.json);
          } catch {
            kit = { id: r.id, name: r.name };
          }
          const card = (kit.card ?? {}) as Record<string, string>;
          return (
            <li key={r.id} data-testid={`kit-${r.id}`} className="flex flex-col gap-2">
              <Link href={`/studio/kits/${r.id}`} className="card-warm block overflow-hidden p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  data-testid={`kit-card-${r.id}`}
                  src={`${cardPath(kit)}?${cardParams(kit, SAMPLE, sample.page, sample.picture)}`}
                  alt={r.name}
                  className="w-full rounded-md"
                />
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.name}</span>
                {shipped.has(r.id) && <span className="st-badge st-grey">đi kèm</span>}
                {inUse.get(r.id) ? (
                  <span className="st-badge st-green">
                    <span className="st-num">{inUse.get(r.id)}</span>&nbsp;kênh
                  </span>
                ) : null}
                <span className="st-label text-muted-foreground">
                  {card.ratio} · {card.highlight}
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                  <KitRowActions kit={{ id: r.id, name: r.name, shipped: shipped.has(r.id) }} />
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      </div>
      </div>
    </>
  );
}
