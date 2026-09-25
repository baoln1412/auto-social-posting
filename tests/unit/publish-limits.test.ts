import { describe, expect, it } from 'vitest';
import { LIMITS, lintCaption, type Caption } from '@/lib/studio/publish/limits';

const base: Caption = {
  title: 'Mỹ: Cụ bà 82 tuổi bị lừa mất 2.500 đô',
  text: 'Mỹ: Cụ bà 82 tuổi bị lừa mất 2.500 đô vì chiêu vé số trúng thưởng.\n\nNgười Việt lớn tuổi cần cảnh giác.',
  firstComment: 'Nguồn: https://ktla.com/news/pomona-scam',
  sourceUrl: 'https://ktla.com/news/pomona-scam',
  hasReel: true,
};

describe('lintCaption', () => {
  it('says how many checks it ran, and passes a clean post', () => {
    const g = lintCaption(base, ['facebook:123']);
    expect(g.checked).toBeGreaterThanOrEqual(6);
    expect(g.findings).toEqual([]);
  });

  it('blocks an empty caption', () => {
    const g = lintCaption({ ...base, text: '   ' }, ['facebook:123']);
    expect(g.findings.join(' ')).toMatch(/trống/);
  });

  it('blocks a Facebook post over the post limit, and names the number', () => {
    const g = lintCaption({ ...base, text: 'a'.repeat(LIMITS.facebookPost + 1) }, ['facebook:123']);
    expect(g.findings.some((f) => f.includes(String(LIMITS.facebookPost)))).toBe(true);
  });

  it('warns rather than blocks past the reel caption floor', () => {
    const g = lintCaption({ ...base, text: 'a'.repeat(LIMITS.reelCaption + 1) }, ['facebook:123']);
    expect(g.findings).toEqual([]);
    expect(g.warnings.join(' ')).toMatch(/2 ?200|2200/);
  });

  it('blocks a post that cites no source when the run has one', () => {
    const g = lintCaption({ ...base, firstComment: '', text: 'Không có nguồn ở đây.' }, ['facebook:123']);
    expect(g.findings.join(' ')).toMatch(/nguồn/i);
  });

  it('does not invent a source check for a post that has no source', () => {
    const typed = { ...base, sourceUrl: undefined, firstComment: '', text: 'Tôi tự viết bài này.' };
    const g = lintCaption(typed, ['facebook:123']);
    expect(g.findings).toEqual([]);
    expect(g.checked).toBeLessThan(lintCaption(base, ['facebook:123']).checked);
  });

  it('warns about a phone number or a messaging handle', () => {
    const g = lintCaption({ ...base, text: `${base.text}\nLiên hệ Zalo 0901234567` }, ['facebook:123']);
    expect(g.findings).toEqual([]);
    expect(g.warnings.join(' ')).toMatch(/liên hệ|Zalo|số điện thoại/i);
  });

  it('warns when the point is below the fold', () => {
    const buried = { ...base, text: `${'x '.repeat(80)}${base.title}` };
    expect(lintCaption(buried, ['facebook:123']).warnings.join(' ')).toMatch(/125/);
  });

  it('checks less when nothing goes to Facebook', () => {
    const fb = lintCaption(base, ['facebook:123']).checked;
    expect(lintCaption(base, ['library']).checked).toBeLessThan(fb);
  });
});
