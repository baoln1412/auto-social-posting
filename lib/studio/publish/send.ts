/**
 * One row of `studio_publish` → the thing actually leaving the machine.
 *
 * The split is deliberate: photos and feed posts go through `/api/facebook/post`, the SPA's own
 * route, because it holds the page tokens and the idempotency marker that stops a retry from
 * double-posting. Reels are the only Graph code here, because that endpoint does not exist over
 * there. Two implementations of "post a photo" would drift by the first bug fix.
 */
import fs from 'node:fs';
import { sendVideo } from '../deliver';
import { getRun } from '../runs';
import { isDemoChannel } from '../steps/is-demo';
import type { Draft } from '../gold';
import type { CardAsset } from '../steps/image';
import type { ReelAsset } from '../steps/reel';
import { commentOn, publishReel } from './facebook';
import { connectedPages } from './pages';
import type { PublishRow } from './queue';

/** The base the server calls itself on for the SPA's own routes. */
const SELF = () => process.env.STUDIO_SELF_URL ?? 'http://127.0.0.1:3000';

export async function sendRow(row: PublishRow): Promise<{ remoteId: string | null }> {
  const rec = getRun(row.runId);
  if (!rec) throw new Error(`Không còn lượt chạy ${row.runId}.`);

  const draft = rec.steps.draft?.output as Draft | undefined;
  const reel = rec.steps.reel?.output as ReelAsset | undefined;
  const card = rec.steps.image?.output as CardAsset | undefined;
  const scheduled = new Date(row.at).getTime() > Date.now() + 60_000 ? row.at : undefined;

  if (row.where === 'library') return { remoteId: row.runId };

  // The demo channel queues like any other — that is what makes its Đăng screen real — but
  // nothing leaves the machine. The refusal is recorded on the row, where it can be read.
  if (isDemoChannel(rec.channel)) throw new Error('Chế độ xem thử không gửi đi đâu cả.');

  if (row.where === 'telegram') {
    if (!reel?.path || !fs.existsSync(reel.path)) throw new Error('Chưa có video để gửi.');
    await sendVideo(reel.path, draft?.title ?? 'Video mới');
    return { remoteId: null };
  }

  if (row.where.startsWith('facebook:')) {
    const channelId = row.where.slice('facebook:'.length);
    const page = (await connectedPages()).find((p) => p.id === channelId);
    if (!page) throw new Error('Trang Facebook này không còn được nối.');

    if (reel?.path && fs.existsSync(reel.path)) {
      const out = await publishReel({
        pageId: page.pageId,
        token: page.token,
        filePath: reel.path,
        description: `${draft?.title ? `${draft.title}\n\n` : ''}${draft?.text ?? ''}`.trim(),
        scheduledAt: scheduled,
      });
      if (row.firstComment && out.postId) {
        // A first comment that fails is not a failed post — the reel is up either way.
        await commentOn(out.postId, row.firstComment, page.token).catch(() => null);
      }
      return { remoteId: out.postId ?? out.videoId };
    }

    // No reel: the card and the text, through the route that already knows how.
    const res = await fetch(`${SELF()}/api/facebook/post`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channelId,
        emojiTitle: draft?.title ?? '',
        facebookText: draft?.text ?? '',
        imageUrl: card?.url ? new URL(card.url, SELF()).toString() : undefined,
        scheduledTime: scheduled,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { postId?: string; error?: string };
    if (!res.ok || !body.postId) throw new Error(body.error ?? `Đăng Facebook trả về ${res.status}.`);
    if (row.firstComment) await commentOn(body.postId, row.firstComment, page.token).catch(() => null);
    return { remoteId: body.postId };
  }

  throw new Error(`Không biết gửi đi đâu: ${row.where}`);
}
