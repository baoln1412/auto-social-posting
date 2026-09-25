/**
 * publish — where the finished thing goes, and when.
 *
 * v2 recorded the intent and nothing acted on it: "Đăng sau" wrote a string onto the run and no
 * scheduler existed, which is the worst kind of lie a publish screen can tell. Now every
 * destination becomes a row in `studio_publish`, the loop in `lib/studio/publish/loop.ts`
 * sends what is due, and a row that failed says so against the run for ever.
 *
 * The library is not a destination you choose — every run is already in it — but it is still a
 * row, because "when did this go out and did it work" should have one answer per destination
 * and not two shapes.
 */
import { chatId, telegramBlocked } from '../deliver';
import { can, type Tier } from '../tier';
import { connectedPages } from '../publish/pages';
import { enqueue, rowsFor, tick, type PublishRow } from '../publish/queue';
import { sendRow } from '../publish/send';
import type { CardAsset } from './image';
import type { ReelAsset } from './reel';
import type { Draft } from '../gold';
import type { RunCtx, Step } from './types';

export type Where = 'library' | 'telegram' | `facebook:${string}`;

export interface Destination {
  id: Where;
  label: string;
  blocked: string | null;
}

export interface PublishRecord {
  /** Always true: a run is in the library the moment it produces anything. */
  library: boolean;
  telegram: 'sent' | 'off' | 'error';
  telegramNote?: string;
  /** ISO time the owner asked for. */
  scheduledAt?: string;
  /** One per destination, as written to studio_publish. */
  rows: PublishRow[];
  at: string;
}

/** What this run has to show for itself. */
export function assetsOf(ctx: RunCtx): { kind: string; path?: string; url?: string }[] {
  const out: { kind: string; path?: string; url?: string }[] = [];
  const card = ctx.outputs.image as CardAsset | undefined;
  const reel = ctx.outputs.reel as ReelAsset | undefined;
  if (card?.url) out.push({ kind: 'png', path: card.path, url: card.url });
  if (reel?.url) out.push({ kind: 'mp4', path: reel.path, url: reel.url });
  return out;
}

/** Which destinations exist, and why one cannot be used. Listed either way, never hidden. */
export async function destinations(marketId?: string | null, tier?: Tier): Promise<Destination[]> {
  // A tier that cannot deliver cannot be offered a destination that delivers — said with its
  // reason on the row, never by leaving the row out.
  const demo = tier && !can(tier, 'deliver') ? 'Chế độ xem thử không gửi đi đâu cả.' : null;
  const tg = demo ?? telegramBlocked() ?? (chatId() ? null : 'Chưa nối Telegram — vào Cài đặt để nối.');
  const pages = await connectedPages(marketId);
  return [
    { id: 'library', label: 'Thư viện', blocked: null },
    { id: 'telegram', label: 'Telegram', blocked: tg },
    ...pages.map((p): Destination => ({ id: `facebook:${p.id}`, label: `Facebook · ${p.name}`, blocked: demo })),
    ...(pages.length
      ? []
      : [
          {
            id: 'facebook:none' as Where,
            label: 'Facebook',
            blocked: 'Chưa nối trang nào — vào Cài đặt · Facebook.',
          },
        ]),
  ];
}

export const publishStep: Step<Draft, PublishRecord> = {
  name: 'publish',
  from: 'draft',

  async preview(draft, ctx) {
    return {
      kind: 'text',
      data: {
        title: draft?.title ?? '',
        text: draft?.text ?? '',
        assets: assetsOf(ctx),
        // What the first comment defaults to, and what the linter checks a citation against.
        sourceUrl: (ctx.outputs.fetch as { url?: string } | undefined)?.url ?? null,
        destinations: await destinations(ctx.channel.market_id, ctx.tier),
        rows: rowsFor(ctx.runId),
      },
      // Saving costs nothing; Telegram and Graph are free APIs. Zero is the honest number.
      cost: { usd: 0, note: 'lưu & gửi' },
    };
  },

  async run(draft, ctx) {
    const wanted = (ctx.overrides.publishTo as Where[] | undefined) ?? ['library'];
    const at = typeof ctx.overrides.publishAt === 'string' ? ctx.overrides.publishAt.trim() : '';
    const firstComment =
      typeof ctx.overrides.firstComment === 'string' ? ctx.overrides.firstComment.trim() : '';
    const when = at || new Date().toISOString();

    const already = new Set(rowsFor(ctx.runId).filter((r) => r.status !== 'failed').map((r) => r.where));
    for (const w of wanted) {
      // Re-running the step must not queue the same post twice. A failed row is the one case
      // worth another attempt.
      if (!already.has(w)) enqueue({ runId: ctx.runId, where: w, at: when, firstComment });
    }

    // Anything due now goes now; anything later waits for the loop. Same code path either way.
    await tick(sendRow);

    const rows = rowsFor(ctx.runId);
    const tg = rows.find((r) => r.where === 'telegram');
    const rec: PublishRecord = {
      library: true,
      telegram: !tg ? 'off' : tg.status === 'sent' ? 'sent' : tg.status === 'failed' ? 'error' : 'off',
      rows,
      at: new Date().toISOString(),
    };
    if (tg?.error) rec.telegramNote = tg.error;
    if (at) rec.scheduledAt = at;
    return rec;
  },
};
