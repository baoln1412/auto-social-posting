import Link from 'next/link';
import { notFound } from 'next/navigation';
import { query } from '@/app/lib/db';
import ContentCalendar from '@/app/components/calendar/ContentCalendar';
import { can, tier } from '@/lib/studio/tier';

import { PageHeader } from '@/app/studio/components/PageHeader';
import { PublishQueue } from '@/app/studio/components/PublishQueue';

export const dynamic = 'force-dynamic';

/**
 * The month, twice: the market's own content schedule on the left — the SPA's calendar,
 * imported, not copied — and Studio's publish queue on the right.
 */
export default async function CalendarPage({ searchParams }: { searchParams: { market?: string } }) {
  if (!can(tier(), 'run')) notFound();
  const { data } = await query('content_pages').select('id,name').order('name');
  const markets = (data ?? []) as { id: string; name: string }[];
  const current = markets.find((m) => m.id === searchParams.market) ?? markets[0];

  return (
    <>
      <PageHeader title="Lịch đăng" sub="Bài của thị trường, và những gì Studio đã hẹn giờ gửi." />
      <div className="st-content">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          {markets.length > 1 && (
            <div data-testid="cal-markets" className="flex flex-wrap gap-1.5">
              {markets.map((m) => (
                <Link
                  key={m.id}
                  href={`/studio/calendar?market=${m.id}`}
                  className={`st-chip ${m.id === current?.id ? 'st-on' : 'st-soft'}`}
                >
                  {m.name}
                </Link>
              ))}
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div data-testid="cal-grid" className="min-w-0">
              {current ? (
                <ContentCalendar pageId={current.id} />
              ) : (
                <p className="text-sm text-muted-foreground">Chưa có thị trường nào.</p>
              )}
            </div>
            <PublishQueue />
          </div>
        </div>
      </div>
    </>
  );
}
