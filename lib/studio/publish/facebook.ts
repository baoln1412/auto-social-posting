/**
 * Reels, the one thing the SPA's Graph code cannot do.
 *
 * Photos and feed posts already work — `app/api/facebook/post/route.ts` holds the page tokens
 * and the idempotency marker, and Studio calls that route rather than growing a second copy of
 * it. Reels are a different endpoint with a four-step handshake the SPA never needed:
 *
 *   start   POST /{page}/video_reels?upload_phase=start    → { video_id, upload_url }
 *   upload  POST {upload_url}  Authorization: OAuth <tok>, offset: 0, file_size: <bytes>
 *   finish  POST /{page}/video_reels?upload_phase=finish&video_state=PUBLISHED|SCHEDULED
 *   poll    GET  /{video_id}?fields=status                 until video_status is ready
 *
 * `io` exists so the test drives the whole handshake against recorded bodies with no clock and
 * no network — the shapes live in tests/fixtures/graph-reels.json.
 */
import fs from 'node:fs';

export const GRAPH = () => process.env.GRAPH_API_BASE ?? 'https://graph.facebook.com/v23.0';

export interface GraphIO {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
}

const realIO: GraphIO = {
  fetch: (...a) => fetch(...a),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/** Graph answers 200 with an `error` object as often as it answers a status code. */
async function json(io: GraphIO, url: string, init?: RequestInit): Promise<any> {
  const res = await io.fetch(url, init);
  const body = await res.json().catch(() => ({ error: { message: `Graph trả về ${res.status}.` } }));
  if (body?.error) throw new Error(body.error.message ?? `Graph trả về ${res.status}.`);
  return body;
}

export async function publishReel(opts: {
  pageId: string;
  token: string;
  filePath: string;
  description: string;
  /** ISO. Present means SCHEDULED rather than PUBLISHED. */
  scheduledAt?: string;
  io?: GraphIO;
  /** How many times to ask whether the video is ready before giving up. */
  tries?: number;
}): Promise<{ videoId: string; postId: string | null }> {
  const io = opts.io ?? realIO;

  // Before the first call, not after start has already reserved a video id on Meta's side.
  if (!fs.existsSync(opts.filePath)) throw new Error(`Không tìm thấy tệp video: ${opts.filePath}`);
  const bytes = fs.statSync(opts.filePath).size;

  const start = await json(
    io,
    `${GRAPH()}/${opts.pageId}/video_reels?upload_phase=start&access_token=${encodeURIComponent(opts.token)}`,
    { method: 'POST' },
  );
  const videoId = String(start.video_id);

  await json(io, String(start.upload_url), {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${opts.token}`,
      offset: '0',
      file_size: String(bytes),
    },
    body: fs.readFileSync(opts.filePath),
  });

  const when = opts.scheduledAt ? Math.floor(new Date(opts.scheduledAt).getTime() / 1000) : null;
  const finish = new URLSearchParams({
    upload_phase: 'finish',
    video_id: videoId,
    video_state: when ? 'SCHEDULED' : 'PUBLISHED',
    description: opts.description,
    access_token: opts.token,
  });
  if (when) finish.set('scheduled_publish_time', String(when));
  const done = await json(io, `${GRAPH()}/${opts.pageId}/video_reels?${finish}`, { method: 'POST' });

  // Meta accepts the upload and processes it afterwards; a "success" that is still encoding is
  // not a published reel, and the errors that matter (no audio track, wrong codec) arrive here.
  const tries = opts.tries ?? 30;
  for (let i = 0; i < tries; i++) {
    const s = await json(io, `${GRAPH()}/${videoId}?fields=status&access_token=${encodeURIComponent(opts.token)}`);
    const state = s?.status?.video_status;
    if (state === 'ready' || state === 'published') {
      return { videoId, postId: done.post_id ? String(done.post_id) : null };
    }
    if (state === 'error') {
      const why = s?.status?.processing_phase?.errors?.[0]?.message ?? 'Meta từ chối video này.';
      throw new Error(why);
    }
    await io.sleep(2_000);
  }
  throw new Error(`Video ${videoId} vẫn đang xử lý sau ${tries} lần hỏi.`);
}

/** The first comment, posted against the post the reel became. */
export async function commentOn(postId: string, message: string, token: string, io: GraphIO = realIO): Promise<string> {
  const q = new URLSearchParams({ message, access_token: token });
  const body = await json(io, `${GRAPH()}/${postId}/comments?${q}`, { method: 'POST' });
  return String(body.id);
}
