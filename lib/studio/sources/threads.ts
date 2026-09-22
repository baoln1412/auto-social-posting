/**
 * The owner's own Threads posts, through the sanctioned API.
 *
 * Other people's posts are not here on purpose: the owner's decision is paste-the-text, no
 * scraping and no extension. Without a token this source is listed and disabled with the
 * reason on it — a source that vanishes looks like a bug.
 */
import type { Comment, SourceItem } from '../steps/types';

const API = 'https://graph.threads.net/v1.0';

export interface ThreadsPost {
  id: string;
  text?: string;
  permalink?: string;
}
export interface ThreadsReply {
  id: string;
  text?: string;
  like_count?: number;
}

export function parseThreadsPost(post: ThreadsPost, replies: ThreadsReply[]): SourceItem {
  const comments: Comment[] = replies
    .filter((r) => (r.text ?? '').trim().length > 0)
    .map((r) => ({
      id: r.id,
      text: (r.text ?? '').trim(),
      score: typeof r.like_count === 'number' ? r.like_count : null,
      depth: 0,
    }));
  const text = (post.text ?? '').trim();
  return {
    id: `threads:${post.id}`,
    title: text.split('\n')[0].slice(0, 120) || '(không tiêu đề)',
    text,
    url: post.permalink,
    source: 'Threads',
    comments,
  };
}

export function threadsToken(): string | undefined {
  return process.env.THREADS_ACCESS_TOKEN || undefined;
}

async function api<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API}${path}${path.includes('?') ? '&' : '?'}access_token=${token}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Threads API trả về ${res.status}.`);
  return (await res.json()) as T;
}

export async function listThreads(limit: number): Promise<SourceItem[]> {
  const token = threadsToken();
  if (!token) throw new Error('Chưa có THREADS_ACCESS_TOKEN.');
  const posts = await api<{ data: ThreadsPost[] }>(
    `/me/threads?fields=id,text,permalink&limit=${limit}`,
    token,
  );
  return Promise.all(
    (posts.data ?? []).map(async (p) => {
      const replies = await api<{ data: ThreadsReply[] }>(
        `/${p.id}/replies?fields=id,text,like_count`,
        token,
      ).catch(() => ({ data: [] as ThreadsReply[] }));
      return parseThreadsPost(p, replies.data ?? []);
    }),
  );
}
