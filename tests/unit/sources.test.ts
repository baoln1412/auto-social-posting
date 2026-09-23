import { describe, it, expect } from 'vitest';
import { goldRowToItem } from '@/lib/studio/sources/gold';
import { parseRedditThread } from '@/lib/studio/sources/reddit';
import { textToItem } from '@/lib/studio/sources/text';
import { articleToItem } from '@/lib/studio/sources/article';
import { parseThreadsPost } from '@/lib/studio/sources/threads';
import { SOURCES } from '@/lib/studio/sources';

describe('gold', () => {
  const row = {
    id: 'g1',
    emoji_title: '🇺🇸 Tin mới',
    body_text: 'Nội dung bài.',
    article_url: 'https://ex.com/a',
    source_name: 'Reuters',
    comment_1: 'Bình luận một',
    comment_2: '',
    comment_3: 'Bình luận ba',
  };

  it('turns a gold row into an item with a gold: ref', () => {
    const it_ = goldRowToItem(row);
    expect(it_.id).toBe('gold:g1');
    expect(it_.title).toBe('🇺🇸 Tin mới');
    expect(it_.text).toBe('Nội dung bài.');
    expect(it_.source).toBe('Reuters');
  });

  it('makes comment_1..3 the pool and drops the empty ones', () => {
    expect(goldRowToItem(row).comments.map((c) => c.text)).toEqual(['Bình luận một', 'Bình luận ba']);
  });

  it('leaves gold comment scores null — the lake has none to give', () => {
    expect(goldRowToItem(row).comments.every((c) => c.score === null)).toBe(true);
  });
});

describe('reddit', () => {
  const thread = [
    {
      data: {
        children: [
          {
            kind: 't3',
            data: {
              id: 'p1',
              title: 'A post',
              selftext: 'Body text.',
              permalink: '/r/x/comments/p1/a/',
              score: 900,
            },
          },
        ],
      },
    },
    {
      data: {
        children: [
          {
            kind: 't1',
            data: {
              id: 'c1',
              body: 'Top comment',
              score: 120,
              replies: {
                data: {
                  children: [
                    { kind: 't1', data: { id: 'c1a', body: 'A reply', score: 9, replies: '' } },
                    { kind: 'more', data: { id: 'x' } },
                  ],
                },
              },
            },
          },
          { kind: 't1', data: { id: 'c2', body: '[deleted]', score: 5, replies: '' } },
          { kind: 't1', data: { id: 'c3', body: 'Another', score: 40, replies: '' } },
          { kind: 'more', data: { id: 'y' } },
        ],
      },
    },
  ];

  it('reads the post and gives it a reddit: ref', () => {
    const item = parseRedditThread(thread)!;
    expect(item.id).toBe('reddit:p1');
    expect(item.title).toBe('A post');
    expect(item.text).toBe('Body text.');
    expect(item.url).toBe('https://www.reddit.com/r/x/comments/p1/a/');
  });

  it('keeps each comment score — that is what orders the pool', () => {
    const c = parseRedditThread(thread)!.comments;
    expect(c.find((x) => x.id === 'c1')!.score).toBe(120);
  });

  it('nests replies exactly one level and no deeper', () => {
    const c = parseRedditThread(thread)!.comments;
    expect(c.find((x) => x.id === 'c1a')!.depth).toBe(1);
    expect(Math.max(...c.map((x) => x.depth))).toBe(1);
  });

  it('drops the "more" stubs and deleted bodies rather than rendering them as scenes', () => {
    const ids = parseRedditThread(thread)!.comments.map((c) => c.id);
    expect(ids).toEqual(['c1', 'c1a', 'c3']);
  });

  it('returns null for a shape that is not a thread', () => {
    expect(parseRedditThread([])).toBeNull();
    expect(parseRedditThread({ error: 403 } as any)).toBeNull();
  });
});

describe('text', () => {
  it('hashes the text into a stable text: ref', () => {
    expect(textToItem('xin chào').id).toBe(textToItem('xin chào').id);
    expect(textToItem('xin chào').id).not.toBe(textToItem('khác').id);
    expect(textToItem('xin chào').id).toMatch(/^text:[0-9a-f]{12}$/);
  });

  it('titles itself from the first sentence', () => {
    expect(textToItem('Câu đầu. Câu sau.').title).toBe('Câu đầu.');
  });

  it('carries no comment pool — there is nobody to quote', () => {
    expect(textToItem('abc').comments).toEqual([]);
  });
});

describe('article', () => {
  it('canonicalises the url into the ref', () => {
    expect(articleToItem('https://ex.com/a?utm_source=x', 'T', 'B').id).toMatch(/^url:https:\/\/ex\.com\/a/);
  });

  it('falls back to the host when the page gave no title', () => {
    expect(articleToItem('https://ex.com/a', '', 'B').title).toBe('ex.com');
  });
});

describe('threads', () => {
  it('turns replies into a scored pool', () => {
    const item = parseThreadsPost(
      { id: 't1', text: 'Bài của tôi', permalink: 'https://threads.net/p/1' },
      [
        { id: 'r1', text: 'Trả lời', like_count: 12 },
        { id: 'r2', text: '', like_count: 3 },
      ],
    );
    expect(item.id).toBe('threads:t1');
    expect(item.comments).toEqual([{ id: 'r1', text: 'Trả lời', score: 12, depth: 0 }]);
  });
});

describe('the source registry', () => {
  it('lists every day-one source, including the ones that cannot run', () => {
    expect(Object.keys(SOURCES).sort()).toEqual([
      'article',
      'demo',
      'facebook',
      'gold',
      'instagram',
      'reddit',
      'rss',
      'text',
      'threads',
    ]);
  });

  it('says why Threads is unusable instead of hiding it', () => {
    const before = process.env.THREADS_ACCESS_TOKEN;
    delete process.env.THREADS_ACCESS_TOKEN;
    expect(SOURCES.threads.blocked()).toMatch(/token/i);
    expect(SOURCES.facebook.blocked()).toMatch(/FACEBOOK_GRAPH_TOKEN/);
    expect(SOURCES.instagram.blocked()).toMatch(/FACEBOOK_GRAPH_TOKEN/);
    expect(SOURCES.gold.blocked()).toBeNull();
    if (before) process.env.THREADS_ACCESS_TOKEN = before;
  });
});
