import { describe, it, expect } from 'vitest';
import { detectSource } from '@/lib/studio/sources/detect';
import { sourceFor } from '@/lib/studio/steps/fetch';

const GOLD = JSON.stringify([{ type: 'gold', marketId: 'm-1' }]);
const REDDIT = JSON.stringify([{ type: 'reddit' }]);

describe('detectSource', () => {
  it('reads the source off the host', () => {
    expect(detectSource('https://www.reddit.com/r/x/comments/p1/a/')?.kind).toBe('reddit');
    expect(detectSource('https://redd.it/p1')?.kind).toBe('reddit');
    expect(detectSource('https://www.threads.net/@a/post/1')?.kind).toBe('threads');
    expect(detectSource('https://www.facebook.com/x/posts/1')?.kind).toBe('facebook');
    expect(detectSource('https://fb.watch/abc/')?.kind).toBe('facebook');
    expect(detectSource('https://www.instagram.com/p/abc/')?.kind).toBe('instagram');
    expect(detectSource('https://ktla.com/news/a-story')?.kind).toBe('article');
  });

  it('treats anything that is not a link as the owner’s own text', () => {
    expect(detectSource('Hôm nay tôi muốn kể một chuyện.')).toEqual({
      kind: 'text',
      cfg: { text: 'Hôm nay tôi muốn kể một chuyện.' },
    });
  });

  it('takes a bare domain as the link it obviously is', () => {
    expect(detectSource('reddit.com/r/x/comments/p1/a/')?.cfg.url).toBe(
      'https://reddit.com/r/x/comments/p1/a/',
    );
  });

  it('is null for an empty box — the channel’s own source then decides', () => {
    expect(detectSource('')).toBeNull();
    expect(detectSource(null)).toBeNull();
  });

  it('reads the refs a run already stores', () => {
    expect(detectSource('gold:abc')?.kind).toBe('gold');
    expect(detectSource('demo:1')?.kind).toBe('demo');
    expect(detectSource('text:9f8e')?.kind).toBe('text');
    expect(detectSource('url:https://ktla.com/a')?.kind).toBe('article');
  });
});

describe('sourceFor — the link decides, on every channel', () => {
  // Complaint A: v1 read the pasted box only when the channel's own source declared
  // `needs: 'url'`, so on a gold channel a pasted link was dropped and the first listed
  // gold row was used instead — silently.
  it('sends a Reddit link on a gold channel to Reddit, not to the first gold row', () => {
    const { def, cfg } = sourceFor(GOLD, 'https://www.reddit.com/r/x/comments/p1/a/');
    expect(def.kind).toBe('reddit');
    expect(cfg.url).toBe('https://www.reddit.com/r/x/comments/p1/a/');
  });

  it('keeps the channel’s market when the link changes the source', () => {
    expect(sourceFor(GOLD, 'https://ktla.com/a').cfg.marketId).toBe('m-1');
  });

  it('falls back to the channel’s own source only when the box is empty', () => {
    const { def, cfg } = sourceFor(GOLD, '');
    expect(def.kind).toBe('gold');
    expect(cfg.marketId).toBe('m-1');
  });

  it('keeps a gold ref on the gold channel, market and all', () => {
    const { def, cfg } = sourceFor(GOLD, 'gold:xyz');
    expect(def.kind).toBe('gold');
    expect(cfg.marketId).toBe('m-1');
  });

  it('accepts the url: prefix a v1 run stored', () => {
    const { def, cfg } = sourceFor(REDDIT, 'url:https://www.reddit.com/r/x/comments/p1/a/');
    expect(def.kind).toBe('reddit');
    expect(cfg.url).toBe('https://www.reddit.com/r/x/comments/p1/a/');
  });
});
