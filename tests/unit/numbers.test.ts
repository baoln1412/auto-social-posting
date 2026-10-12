/**
 * The big-number zone.
 *
 * deploy/make-reel.py's header has listed it as skipped since the beginning: "Skipped (add
 * later): top big-number zone, background music, SFX". The music is built; this is the
 * first item.
 *
 * It earns its place by NOT repeating the caption. ainius-2.mp4 sets the narration itself
 * as big type, which for us would duplicate the karaoke band word for word — ours lifts the
 * number out as an object instead, which is the one thing a caption reads worst: a viewer
 * hears "sáu phẩy chín hai" and sees it for a quarter second in a scrolling line.
 */
import { describe, it, expect } from 'vitest';
import { sceneWindow, pickNumber } from '@/lib/studio/steps/numbers';

describe('finding the number worth showing', () => {
  it('reads Vietnamese money, with its own thousands separator', () => {
    const n = pickNumber('Mỗi hồ sơ tốn 2.500 đô la, chưa kể phí dịch thuật.');
    expect(n?.value).toBe('2.500');
    expect(n?.unit).toContain('đô');
  });

  it('reads a decimal comma as a decimal, not as a list', () => {
    expect(pickNumber('Giá lên 6,92 đô la một pound.')?.value).toBe('6,92');
  });

  it('reads a percentage', () => {
    const n = pickNumber('Số đơn bị từ chối tăng 37% so với năm ngoái.');
    expect(n?.value).toBe('37');
    expect(n?.unit).toBe('%');
  });

  it('keeps the Vietnamese scale word, which carries the magnitude', () => {
    const n = pickNumber('Chính phủ chi 750 triệu đô cho chương trình này.');
    expect(n?.value).toBe('750');
    expect(n?.unit).toMatch(/triệu/);
  });

  it('prefers the biggest claim when a sentence carries several', () => {
    const n = pickNumber('3 hiệp hội cảnh báo giá có thể chạm 12.000 đô một tấn.');
    expect(n?.value).toBe('12.000');
  });

  it('ignores a year, which is a date and not a quantity', () => {
    expect(pickNumber('Quy định có hiệu lực từ năm 2026.')).toBeNull();
  });

  it('ignores a sentence with nothing to show', () => {
    expect(pickNumber('Bộ Nội vụ chưa bình luận về việc này.')).toBeNull();
    expect(pickNumber('')).toBeNull();
  });

  it('refuses a bare small count, which is not a headline number', () => {
    expect(pickNumber('Có 3 người tham gia buổi họp.')).toBeNull();
  });
});

describe('when it is on screen', () => {
  const scenes = [40, 60, 50, 50];   // characters per scene

  it('lands on the scene whose line says it, not at a fixed time', () => {
    const w = sceneWindow(scenes, 2, 40)!;
    // Scene 2 of 4 by character weight: starts after the first 40 of 200 chars.
    expect(w.from).toBeGreaterThan(0);
    expect(w.until).toBeGreaterThan(w.from);
    expect(w.until).toBeLessThanOrEqual(40);
  });

  it('holds long enough to read and not so long it outstays the line', () => {
    const w = sceneWindow(scenes, 1, 40)!;
    expect(w.until - w.from).toBeGreaterThanOrEqual(1.5);
  });

  it('gives nothing for a scene that does not exist', () => {
    expect(sceneWindow(scenes, 9, 40)).toBeNull();
    expect(sceneWindow([], 0, 40)).toBeNull();
  });

  it('never opens before the inset has left the screen', async () => {
    const { INSET_SEC } = await import('@/lib/studio/steps/filters');
    // A number under the inset card is a number nobody sees.
    const w = sceneWindow([10, 10], 0, 60)!;
    expect(w.from).toBeGreaterThanOrEqual(INSET_SEC);
  });
});

describe('one card per reel', () => {
  it('takes the biggest claim in the whole script, not the first one it meets', async () => {
    const { pickNumberIn } = await import('@/lib/studio/steps/numbers');
    const got = pickNumberIn([
      'Ba hiệp hội cảnh báo về giá.',
      'Phí hồ sơ là 2.500 đô la.',
      'Thiệt hại có thể lên tới 12.000 đô một tấn.',
      'Bộ chưa bình luận.',
    ]);
    expect(got?.index).toBe(2);
    expect(got?.number.value).toBe('12.000');
  });

  it('gives nothing when the script has no figure to show', async () => {
    const { pickNumberIn } = await import('@/lib/studio/steps/numbers');
    expect(pickNumberIn(['Bộ chưa bình luận.', 'Quy định có hiệu lực từ năm 2026.'])).toBeNull();
    expect(pickNumberIn([])).toBeNull();
  });
});
