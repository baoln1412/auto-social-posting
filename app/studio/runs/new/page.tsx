import { notFound, redirect } from 'next/navigation';
import { query } from '@/app/lib/db';
import { channelForMarket } from '@/lib/studio/handoff';
import { createRun } from '@/lib/studio/runs';
import { can, mayUseChannel, tier } from '@/lib/studio/tier';
import { studioDb } from '@/lib/studio/db';

export const dynamic = 'force-dynamic';

/**
 * GET /studio/runs/new?item=gold:<id>&market=<uuid>
 *
 * The other end of PostCard's one link: make a run for this gold post and open it. A page
 * rather than a route handler because the entry point has to be an anchor.
 */
export default async function NewRunHandoff({
  searchParams,
}: {
  searchParams: { item?: string; market?: string };
}) {
  const t = tier();
  if (!can(t, 'run')) notFound();

  const item = searchParams.item?.trim();
  const market = searchParams.market?.trim();
  if (!item || !market) notFound();

  const { data } = await query('content_pages').select('name').eq('id', market).single();
  const channelId = channelForMarket(market, (data as { name?: string } | null)?.name);

  const channel = studioDb()
    .prepare('SELECT tier_min FROM studio_channels WHERE id=?')
    .get(channelId) as { tier_min: string };
  if (!mayUseChannel(t, channel.tier_min)) notFound();

  redirect(`/studio/runs/${createRun({ channelId, itemRef: item })}`);
}
