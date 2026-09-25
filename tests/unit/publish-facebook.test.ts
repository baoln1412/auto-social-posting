import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fx from '../fixtures/graph-reels.json';
import { commentOn, publishReel } from '@/lib/studio/publish/facebook';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-reel-'));
const file = path.join(dir, 'reel.mp4');
fs.writeFileSync(file, Buffer.alloc(2048, 7));

/** A fetch that replays the recorded bodies and remembers what it was asked. */
function recorder(bodies: unknown[]) {
  const calls: { url: string; method: string; headers: Record<string, string> }[] = [];
  let i = 0;
  const fetchLike = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
    });
    const body = bodies[Math.min(i++, bodies.length - 1)];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { calls, fetchLike: fetchLike as unknown as typeof fetch };
}

const opts = { pageId: '123', token: 'tok', filePath: file, description: 'Bài mới' };

describe('publishReel', () => {
  it('walks start → upload → finish → ready, and hands back the post id', async () => {
    const r = recorder([fx.start, fx.upload, fx.finish, fx.statusReady]);
    const out = await publishReel({ ...opts, io: { fetch: r.fetchLike, sleep: async () => {} } });

    expect(out).toEqual({ videoId: '1010101010', postId: '555_666' });
    expect(r.calls[0].url).toMatch(/\/123\/video_reels/);
    expect(r.calls[0].url).toMatch(/upload_phase=start/);
    // The upload goes to the url the API handed back, with the file's real size on it.
    expect(r.calls[1].url).toBe(fx.start.upload_url);
    expect(r.calls[1].headers.Authorization).toBe('OAuth tok');
    expect(r.calls[1].headers.file_size).toBe('2048');
    expect(r.calls[1].headers.offset).toBe('0');
    expect(r.calls[2].url).toMatch(/upload_phase=finish/);
    expect(r.calls[2].url).toMatch(/video_state=PUBLISHED/);
  });

  it('schedules instead of publishing when a time is given', async () => {
    const r = recorder([fx.start, fx.upload, fx.finish, fx.statusReady]);
    const when = new Date(Date.now() + 3_600_000);
    await publishReel({ ...opts, scheduledAt: when.toISOString(), io: { fetch: r.fetchLike, sleep: async () => {} } });

    expect(r.calls[2].url).toMatch(/video_state=SCHEDULED/);
    expect(r.calls[2].url).toMatch(new RegExp(`scheduled_publish_time=${Math.floor(when.getTime() / 1000)}`));
  });

  it('keeps polling while the video is still processing', async () => {
    const r = recorder([fx.start, fx.upload, fx.finish, fx.statusUploading, fx.statusUploading, fx.statusReady]);
    const out = await publishReel({ ...opts, io: { fetch: r.fetchLike, sleep: async () => {} } });
    expect(out.postId).toBe('555_666');
    expect(r.calls.filter((c) => c.url.includes('fields=status'))).toHaveLength(3);
  });

  it('raises what Meta said when the video is rejected', async () => {
    const r = recorder([fx.start, fx.upload, fx.finish, fx.statusError]);
    await expect(publishReel({ ...opts, io: { fetch: r.fetchLike, sleep: async () => {} } })).rejects.toThrow(
      /âm thanh/,
    );
  });

  it('raises the Graph error rather than a blank failure', async () => {
    const r = recorder([fx.tokenError]);
    await expect(publishReel({ ...opts, io: { fetch: r.fetchLike, sleep: async () => {} } })).rejects.toThrow(
      /Session has expired/,
    );
  });

  it('will not upload a file that is not there', async () => {
    const r = recorder([fx.start]);
    await expect(
      publishReel({ ...opts, filePath: path.join(dir, 'gone.mp4'), io: { fetch: r.fetchLike, sleep: async () => {} } }),
    ).rejects.toThrow(/không tìm thấy|not found/i);
    expect(r.calls).toHaveLength(0);
  });
});

describe('commentOn', () => {
  it('posts the first comment against the post it was given', async () => {
    const r = recorder([fx.comment]);
    const id = await commentOn('555_666', 'Nguồn: https://x.test', 'tok', { fetch: r.fetchLike, sleep: async () => {} });
    expect(id).toBe('555_666_777');
    expect(r.calls[0].url).toMatch(/\/555_666\/comments/);
    expect(r.calls[0].method).toBe('POST');
  });
});
