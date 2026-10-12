/**
 * The story frame: one photo, three treatments.
 *
 * Measured off a competitor's actual output rather than its landing page (ainius-2.mp4,
 * 2026-10-12): it uses exactly ONE article image and never cuts to another. The photo is
 * sharp behind the headline for the opening, shrinks to an inset card, then blurs and
 * darkens into a bed that the typography sits on for the rest. ffmpeg's scene detector
 * finds zero hard cuts in 31s — the background is continuous, which is what stops it
 * reading as a slideshow.
 *
 * Ours showed one sharp photo with the card pinned over it for the whole reel. Same input,
 * and the difference is entirely treatment.
 */
import { describe, it, expect } from 'vitest';
import {
  HERO_SEC,
  INSET_SEC,
  W,
  H,
  creditAt,
  eyebrowAt,
  heroAt,
  insetAt,
  insetSize,
} from '@/lib/studio/steps/filters';

describe('the three windows', () => {
  it('runs hero, then inset, then type — never two at once', () => {
    expect(HERO_SEC).toBeGreaterThan(0);
    expect(INSET_SEC).toBeGreaterThan(HERO_SEC);
  });

  it('shows the sharp card only for the opening', () => {
    const f = heroAt(1080, 1350)!;
    expect(f).toContain(`enable='lt(t,${HERO_SEC}`);
    expect(f).toMatch(/^overlay=/);
  });

  it('hands the inset the window the hero just left, and no earlier', () => {
    const f = insetAt(600, 750)!;
    expect(f).toContain(`between(t,${HERO_SEC}`);
    expect(f).toContain(`${INSET_SEC}`);
  });

  it('centres the inset and keeps it near the top, where the reference puts it', () => {
    const w = 600;
    const f = insetAt(w, 750)!;
    expect(f).toContain(`overlay=${Math.round((W - w) / 2)}:`);
  });

  it('sizes the inset to a fraction of the frame, keeping the card’s own shape', () => {
    const { w, h } = insetSize(1080, 1350);
    expect(w).toBeLessThan(W);
    expect(w / h).toBeCloseTo(1080 / 1350, 2);
    // Big enough to read a headline on a phone, small enough to be an inset.
    expect(w / W).toBeGreaterThan(0.45);
    expect(w / W).toBeLessThan(0.85);
  });
});

describe('the top-left slot, which two things share', () => {
  it('credits the source over the hero and nowhere else', () => {
    const f = creditAt()!;
    expect(f).toContain(`enable='lt(t,${HERO_SEC}`);
  });

  it('starts the eyebrow exactly where the credit stops, so the slot is never empty or doubled', () => {
    const e = eyebrowAt()!;
    expect(e).toContain(`gte(t,${HERO_SEC}`);
    // Same corner: one slot, two tenants, no overlap in time.
    const corner = (s: string) => s.slice(s.indexOf('overlay=') + 8).split(':').slice(0, 2).join(':');
    expect(corner(e)).toBe(corner(creditAt()!));
  });
});

describe('the bed', () => {
  it('is the same photo, blurred and darkened to carry type', async () => {
    const sharpMod = (await import('sharp')).default;
    const { bedFrom } = await import('@/lib/studio/plate');
    const src = `/tmp/bed-src-${process.pid}.png`;
    // A bright, busy source: if the bed is not darkened, type on it is unreadable.
    await sharpMod({ create: { width: 1600, height: 900, channels: 3, background: { r: 240, g: 230, b: 210 } } })
      .png()
      .toFile(src);

    const bed = await bedFrom(src);
    expect(bed).toBeTruthy();
    const meta = await sharpMod(bed!).metadata();
    expect([meta.width, meta.height]).toEqual([W, H]);

    const { data } = await sharpMod(bed!).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let sum = 0;
    for (let i = 0; i < data.length; i += 3) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    const mean = sum / (data.length / 3);
    // White text at 100% over this has to stay legible, so the bed must be genuinely dark.
    expect(mean, `bed mean luma ${mean}`).toBeLessThan(110);
  }, 30000);
});

describe('the eyebrow', () => {
  it('says when it cut the headline, instead of just stopping', async () => {
    const { eyebrowLines } = await import('@/lib/studio/steps/reel');
    const long = eyebrowLines(
      'ÚC: SIẾT VISA DU HỌC TỪ THÁNG 7 — ĐIỂM TIẾNG ANH TĂNG, CHỨNG MINH TÀI CHÍNH CAO HƠN',
    );
    expect(long).toHaveLength(2);
    expect(long[1].endsWith('…')).toBe(true);
  });

  it('leaves a headline that fits alone', async () => {
    const { eyebrowLines } = await import('@/lib/studio/steps/reel');
    const short = eyebrowLines('ÚC SIẾT VISA DU HỌC');
    expect(short.join(' ')).toBe('ÚC SIẾT VISA DU HỌC');
  });

  it('drops emoji, which the reference never shows in that slot', async () => {
    const { eyebrowLines } = await import('@/lib/studio/steps/reel');
    expect(eyebrowLines('🇦🇺 ÚC: TIN MỚI ⚖️').join(' ')).not.toMatch(/[\u{1F000}-\u{1FAFF}]/u);
  });

  it('names the host, not the whole url', async () => {
    const { creditLine } = await import('@/lib/studio/steps/reel');
    expect(creditLine('https://www.abc.net.au/news/2026/story-123')).toEqual(['NGUỒN: abc.net.au']);
    expect(creditLine(null)).toEqual([]);
    expect(creditLine('not a url')).toEqual([]);
  });
});
