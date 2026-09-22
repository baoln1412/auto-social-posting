/**
 * The hand-over from the existing post list.
 *
 * All of the work lives here so PostCard.tsx — a file this plan protects — needs nothing but
 * one anchor. A link cannot POST, so the link points at a Studio page that does the creating
 * and redirects.
 */
import { randomUUID } from 'node:crypto';
import { studioDb } from './db';

/**
 * The gold channel for a market, made on first use.
 *
 * Found by its source config rather than by name, so renaming the channel in Studio does not
 * make the next hand-over create a second one. Oldest first, so an owner with several gold
 * channels on one market always lands in the same place rather than an arbitrary one.
 */
export function channelForMarket(marketId: string, marketName?: string): string {
  const rows = studioDb()
    .prepare('SELECT id, sources_json FROM studio_channels WHERE market_id=? ORDER BY created_at')
    .all(marketId) as { id: string; sources_json: string }[];

  for (const r of rows) {
    try {
      const sources = JSON.parse(r.sources_json || '[]') as { type?: string }[];
      if (sources.some((s) => s.type === 'gold')) return r.id;
    } catch {
      /* an unreadable row is not a match */
    }
  }

  const id = randomUUID();
  studioDb()
    .prepare(
      `INSERT INTO studio_channels (id, name, market_id, kit_id, sources_json, tier_min, makes_json)
       VALUES (?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      `Kho bài — ${marketName ?? marketId.slice(0, 8)}`,
      marketId,
      'desoul-posting-vi',
      JSON.stringify([{ type: 'gold', marketId }]),
      'owner',
      JSON.stringify(['post', 'reel']),
    );
  return id;
}
