import { query } from '@/app/lib/db';
import { listLibrary } from '@/lib/studio/library';
import { channelForMarket } from '@/lib/studio/handoff';
import { can, tier } from '@/lib/studio/tier';
import { visibleChannelIds } from '@/lib/studio/visible';
import { LakeView, type Market } from '../components/LakeView';
import { LibraryView } from '../components/LibraryView';
import { PageHeader } from '@/app/studio/components/PageHeader';
import libTour from '@/lib/studio/tours/library.json';
import { Tour } from '../components/Tour';

export const dynamic = 'force-dynamic';

/**
 * Thư viện — the gold lake by market, one PostCard per post; `?market=other` is the runs that
 * have no post (v2's library, untouched). Markets are the old app's content_pages.
 */
async function markets(): Promise<Market[]> {
  const { data } = await query('content_pages').select('id, name, country_code').order('created_at');
  const rows = (data ?? []) as { id: string; name: string; country_code?: string | null }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    countryCode: r.country_code ?? '',
    channelId: channelForMarket(r.id, r.name),
  }));
}

export default async function LibraryPage({ searchParams }: { searchParams: { market?: string } }) {
  const t = tier();
  const all = await markets();
  const other = searchParams.market === 'other';
  const market = all.find((m) => m.id === searchParams.market) ?? all[0];

  return (
    <>
      <PageHeader
        title="Thư viện"
        sub={
          other
            ? 'Lượt chạy không gắn với bài trong kho — link dán tay, bài tự viết, dữ liệu mẫu.'
            : 'Kho bài của bạn — mỗi bài là một thẻ, video và ảnh nằm ngay trên thẻ.'
        }
      />
      <div className="st-content">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          {other || !market ? (
            <>
              <nav data-testid="lake-tabs" className="flex flex-wrap gap-0.5 border-b-2 border-border">
                {all.map((m) => (
                  <a key={m.id} href={`/studio/library?market=${m.id}`} className="-mb-[2px] border-b-[3px] border-transparent px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
                    {m.countryCode ? `${m.countryCode} · ` : ''}
                    {m.name}
                  </a>
                ))}
                <a href="/studio/library?market=other" data-testid="lake-tab-other" aria-current="page" className="-mb-[2px] ml-auto border-b-[3px] border-primary px-3 py-2 text-sm font-semibold text-primary">
                  Khác
                </a>
              </nav>
              <LibraryView items={listLibrary({ channelIds: visibleChannelIds(t) }).filter((i) => !i.itemRef?.startsWith('gold:'))} />
            </>
          ) : (
            <LakeView markets={all} market={market} canRun={can(t, 'run')} />
          )}
          <Tour id="library" steps={libTour} />
        </div>
      </div>
    </>
  );
}
