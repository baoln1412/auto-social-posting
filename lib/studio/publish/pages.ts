/**
 * The Facebook pages this install can post to — the rows `FacebookConnect` writes when the
 * owner connects, read back rather than asked for again.
 *
 * Studio never stores a page token of its own. There is one place they live, and it is the
 * table the OAuth callback fills.
 */
import { query } from '@/app/lib/db';

export interface PageChannel {
  /** `page_channels.id` — what /api/facebook/post takes as `channelId`. */
  id: string;
  /** The market this page belongs to. */
  marketId: string | null;
  pageId: string;
  name: string;
  token: string;
}

export async function connectedPages(marketId?: string | null): Promise<PageChannel[]> {
  try {
    const { data } = await query('page_channels')
      .select('id,page_id,platform,platform_page_id,platform_page_name,access_token')
      .order('connected_at');
    const rows = ((data ?? []) as Record<string, string>[]).filter((r) => r.platform === 'facebook');
    return rows
      .filter((r) => !marketId || r.page_id === marketId)
      .map((r) => ({
        id: r.id,
        marketId: r.page_id ?? null,
        pageId: r.platform_page_id,
        name: r.platform_page_name || r.platform_page_id,
        token: r.access_token,
      }));
  } catch {
    // A page list that cannot be read is an empty list with a reason, never a 500 on the
    // screen that was only trying to show destinations.
    return [];
  }
}
