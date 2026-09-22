import { describe, it, expect } from 'vitest';
import { poolFor, scenesFor, splitSentences } from '@/lib/studio/scenes';
import type { Comment, SourceItem } from '@/lib/studio/steps/types';

const comments: Comment[] = [
  { id: 'a', text: 'A', score: 10, depth: 0 },
  { id: 'b', text: 'B', score: 300, depth: 0 },
  { id: 'c', text: 'C', score: null, depth: 1 },
];
const item = { id: 'i', title: 'T', text: 'x.', comments } as SourceItem;

describe('splitSentences()', () => {
  it('splits at sentence ends and keeps the terminator', () => {
    expect(splitSentences('Một câu. Câu hai! Câu ba?')).toEqual(['Một câu.', 'Câu hai!', 'Câu ba?']);
  });

  it('treats the Vietnamese ellipsis as an end', () => {
    expect(splitSentences('Chờ đã… Rồi sao?')).toEqual(['Chờ đã…', 'Rồi sao?']);
  });
});

describe('scenesFor()', () => {
  it('numbers the post sentences first, then the promoted comments in pick order', () => {
    const s = scenesFor('Một. Hai.', comments, { commentIds: ['b', 'a'], hideUnselected: false });
    expect(s.map((x) => [x.n, x.kind, x.text])).toEqual([
      [1, 'post', 'Một.'],
      [2, 'post', 'Hai.'],
      [3, 'comment', 'B'],
      [4, 'comment', 'A'],
    ]);
  });

  it('carries each comment score onto its scene', () => {
    const s = scenesFor('Một.', comments, { commentIds: ['b'], hideUnselected: false });
    expect(s[1].score).toBe(300);
  });

  it('ignores a pick whose comment is gone', () => {
    expect(scenesFor('Một.', comments, { commentIds: ['zzz'], hideUnselected: false })).toHaveLength(1);
  });
});

describe('poolFor()', () => {
  it('shows every comment, best score first — a promoted one stays in the pool, ticked', () => {
    const pool = poolFor(item, { commentIds: ['b'], hideUnselected: false });
    expect(pool.map((c) => c.id)).toEqual(['b', 'a', 'c']);
  });

  it('sorts a scoreless comment last rather than dropping it', () => {
    expect(poolFor(item, { commentIds: [], hideUnselected: false }).at(-1)!.id).toBe('c');
  });
});
