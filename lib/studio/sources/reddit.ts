/**
 * A public Reddit thread via `<post url>.json` — no API key, no scraping library.
 *
 * Top-level comments carry their score and become the pool; replies nest exactly one level,
 * which is as deep as a reel scene list can stay readable.
 */
import type { Comment, SourceItem } from '../steps/types';

const UA = 'desoul-studio/1.0 (+https://posting.desoul.dev)';

type Node = { kind?: string; data?: Record<string, any> };

function dead(body: string): boolean {
  const t = body.trim();
  return !t || t === '[deleted]' || t === '[removed]';
}

function commentsOf(children: Node[], depth: number, out: Comment[]): void {
  for (const c of children) {
    // "more" is Reddit's load-more stub, not a comment. Rendered as a scene it would read
    // as an empty line of narration.
    if (c.kind !== 't1' || !c.data) continue;
    const body = String(c.data.body ?? '');
    if (!dead(body)) {
      out.push({
        id: String(c.data.id),
        text: body.replace(/\s+/g, ' ').trim(),
        score: typeof c.data.score === 'number' ? c.data.score : null,
        depth,
      });
    }
    const replies = c.data.replies;
    if (depth === 0 && replies && typeof replies === 'object') {
      commentsOf((replies.data?.children ?? []) as Node[], 1, out);
    }
  }
}

/** Pure: the two-listing array Reddit answers with → one item. Null if it is not that. */
export function parseRedditThread(json: unknown): SourceItem | null {
  if (!Array.isArray(json) || json.length < 1) return null;
  const post = (json[0] as any)?.data?.children?.[0]?.data;
  if (!post?.id) return null;

  const comments: Comment[] = [];
  commentsOf(((json[1] as any)?.data?.children ?? []) as Node[], 0, comments);

  return {
    id: `reddit:${post.id}`,
    title: String(post.title ?? '(không tiêu đề)'),
    text: String(post.selftext ?? '').trim(),
    url: post.permalink ? `https://www.reddit.com${post.permalink}` : undefined,
    source: post.subreddit ? `r/${post.subreddit}` : 'reddit',
    comments,
  };
}

export async function listReddit(url: string): Promise<SourceItem[]> {
  const clean = url.split('?')[0].replace(/\/$/, '');
  const res = await fetch(`${clean}.json?limit=100&raw_json=1`, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Reddit trả về ${res.status} — đường dẫn có công khai không?`);
  const item = parseRedditThread(await res.json());
  if (!item) throw new Error('Đường dẫn này không phải một bài Reddit.');
  return [item];
}
