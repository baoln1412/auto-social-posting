/**
 * publish — where the finished thing goes.
 *
 * The library is not a destination you choose: every run is already in it, and saying so on
 * this screen is the honest version of "published". Telegram is a destination, and it is
 * listed with its reason when it is not connected rather than hidden. "Đăng sau" records the
 * intent and nothing else — there is no scheduler in this repo yet, and a button that
 * pretended otherwise would be the worst kind of lie a publish screen can tell.
 */
import fs from 'node:fs';
import { chatId, sendVideo, telegramBlocked } from '../deliver';
import type { CardAsset } from './image';
import type { ReelAsset } from './reel';
import type { Draft } from '../gold';
import type { RunCtx, Step } from './types';

export type Where = 'library' | 'telegram';

export interface PublishRecord {
  /** Always true: a run is in the library the moment it produces anything. */
  library: boolean;
  telegram: 'sent' | 'off' | 'error';
  telegramNote?: string;
  /** ISO time the owner asked for, recorded only. */
  scheduledAt?: string;
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
export function destinations(): { id: Where; label: string; blocked: string | null }[] {
  const tg = telegramBlocked() ?? (chatId() ? null : 'Chưa nối Telegram — vào Cài đặt để nối.');
  return [
    { id: 'library', label: 'Thư viện', blocked: null },
    { id: 'telegram', label: 'Telegram', blocked: tg },
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
        destinations: destinations(),
      },
      // Saving costs nothing; Telegram is a free API. Zero is the honest number.
      cost: { usd: 0, note: 'lưu & gửi' },
    };
  },

  async run(draft, ctx) {
    const wanted = (ctx.overrides.publishTo as Where[] | undefined) ?? ['library'];
    const reel = ctx.outputs.reel as ReelAsset | undefined;
    const rec: PublishRecord = {
      library: true,
      telegram: 'off',
      at: new Date().toISOString(),
    };

    const at = typeof ctx.overrides.publishAt === 'string' ? ctx.overrides.publishAt.trim() : '';
    if (at) rec.scheduledAt = at;

    if (wanted.includes('telegram')) {
      const blocked = destinations().find((d) => d.id === 'telegram')?.blocked;
      if (blocked) {
        rec.telegram = 'error';
        rec.telegramNote = blocked;
      } else if (!reel?.path || !fs.existsSync(reel.path)) {
        rec.telegram = 'error';
        rec.telegramNote = 'Chưa có video để gửi.';
      } else {
        try {
          await sendVideo(reel.path, draft?.title ?? 'Video mới');
          rec.telegram = 'sent';
        } catch (e) {
          // A delivery that failed is a fact to record, not a reason to fail the run: the
          // video exists and is in the library either way.
          rec.telegram = 'error';
          rec.telegramNote = e instanceof Error ? e.message : String(e);
        }
      }
    }

    return rec;
  },
};
