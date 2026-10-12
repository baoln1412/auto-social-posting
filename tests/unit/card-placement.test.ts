/**
 * Where the classic card puts its headline and its badge.
 *
 * The numbers live in one module because three things read them: the route that draws the
 * card, the drag surface that lets the owner move them, and these tests. That is the same
 * bargain cardBox() struck for the frame, and for the same reason — a second copy of 844,38
 * is a second answer waiting to disagree.
 *
 * Every assertion about "no params" is a regression guard on a file :3000 serves: the
 * production callers pass none of these, so absent MUST mean the layout that shipped.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { NextRequest } from 'next/server';
import { LOGO, TITLE_INSET, dragToPct, logoAt, onFrame, titleSide, titleTop } from '@/lib/studio/card/placement';

const OVERLAYS = path.join(process.cwd(), 'public', 'overlays');
const W45 = 1080;
const H45 = 1350;

describe('the badge, as the art actually is', () => {
  it('sits where it was measured in the shipped overlay', () => {
    expect(LOGO).toEqual({ x: 848, y: 29, w: 203, h: 177 });
  });

  it('with no override lands on the art’s own spot, at either ratio', () => {
    expect(logoAt(W45, H45)).toEqual({ left: 848, top: 29 });
    expect(logoAt(1080, 1080)).toEqual({ left: 848, top: 29 });
  });

  it('reads an override as a per cent of the canvas, so one number fits both ratios', () => {
    expect(logoAt(W45, H45, 10, 50)).toEqual({ left: 108, top: 675 });
    expect(logoAt(1080, 1080, 10, 50)).toEqual({ left: 108, top: 540 });
  });

  it('never leaves the badge hanging off the canvas', () => {
    expect(logoAt(W45, H45, 100, 100)).toEqual({ left: W45 - LOGO.w, top: H45 - LOGO.h });
    expect(logoAt(W45, H45, -50, -50)).toEqual({ left: 0, top: 0 });
  });
});

describe('the headline block', () => {
  it('with no override keeps the inset the card has always had', () => {
    expect(titleSide(W45)).toBe(TITLE_INSET);
    expect(titleTop(H45)).toBeNull();          // null == leave it anchored to the bottom
  });

  it('turns a width per cent into an even inset on both sides', () => {
    expect(titleSide(W45, 50)).toBe(270);      // (1080 - 540) / 2
    expect(titleSide(W45, 100)).toBe(0);
  });

  it('clamps a width that would make the headline a column of single letters', () => {
    expect(titleSide(W45, 5)).toBe(titleSide(W45, 40));
  });

  it('turns a top per cent into pixels, and keeps the block on the card', () => {
    expect(titleTop(H45, 20)).toBe(270);
    expect(titleTop(H45, 200)).toBe(titleTop(H45, 90));
  });
});

describe('card space to frame space', () => {
  // card-top puts a 1080×1350 card at x=0, y=115 in the 1080×1920 frame.
  const box = { x: 0, y: 115, w: 1080, h: 1350 };

  it('puts the badge where the frame actually shows it', () => {
    const r = onFrame({ left: LOGO.x, top: LOGO.y, width: LOGO.w, height: LOGO.h }, box, 1080, 1350, 1080, 1920);
    expect(r.left).toBeCloseTo(848 / 1080, 5);
    expect(r.top).toBeCloseTo((115 + 29) / 1920, 5);
    expect(r.width).toBeCloseTo(203 / 1080, 5);
  });

  it('scales a card that the frame shrinks', () => {
    const small = { x: 270, y: 200, w: 540, h: 675 };
    const r = onFrame({ left: 0, top: 0, width: 1080, height: 1350 }, small, 1080, 1350, 1080, 1920);
    expect(r.width).toBeCloseTo(0.5, 5);
    expect(r.left).toBeCloseTo(0.25, 5);
  });

  it('turns a drag back into the per cent a kit stores, whatever the card is scaled to', () => {
    // Half the frame's width, on a card that fills the frame's width, is half the card.
    expect(dragToPct(0.5, 1080, 1080)).toBeCloseTo(50, 5);
    // The same drag on a card drawn half-size covers twice as much of it.
    expect(dragToPct(0.5, 1080, 540)).toBeCloseTo(100, 5);
  });

  it('round-trips: a drag applied and then measured comes back where it was put', () => {
    const dx = 0.1;
    const lx = 50 + dragToPct(dx, 1080, box.w);
    const at = logoAt(1080, 1350, lx, 0);
    const r = onFrame({ left: at.left, top: at.top, width: LOGO.w, height: LOGO.h }, box, 1080, 1350, 1080, 1920);
    expect(r.left).toBeCloseTo(0.5 + dx, 3);
  });
});

describe('the overlay art, split in two', () => {
  it('is the shipped file, pixel for pixel: the badge lifted out and nothing else touched', async () => {
    const raw = (f: string) => sharp(path.join(OVERLAYS, f)).ensureAlpha().raw().toBuffer();
    const badge = await raw('card-logo.png');

    for (const [grad, orig, H] of [
      ['card-grad-4x5.png', 'card-bg-4x5.png', 1350],
      ['card-grad-1x1.png', 'card-bg-1x1.png', 1080],
    ] as [string, string, number][]) {
      const g = await raw(grad);
      const o = await raw(orig);
      expect(g.length, grad).toBe(o.length);

      // Walked by hand rather than composited: sharp's blend premultiplies the badge's soft
      // edge, which is a different picture from the one that shipped.
      let outside = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W45; x++) {
          const i = (y * W45 + x) * 4;
          const inBadge = x >= LOGO.x && x < LOGO.x + LOGO.w && y >= LOGO.y && y < LOGO.y + LOGO.h;
          if (inBadge) {
            expect(g[i + 3], `${grad} still has badge at ${x},${y}`).toBe(0);
            const j = ((y - LOGO.y) * LOGO.w + (x - LOGO.x)) * 4;
            for (let c = 0; c < 4; c++) expect(badge[j + c], `card-logo.png at ${x},${y}`).toBe(o[i + c]);
          } else {
            for (let c = 0; c < 4; c++) if (g[i + c] !== o[i + c]) outside++;
          }
        }
      }
      expect(outside, `${grad} changed pixels outside the badge`).toBe(0);
    }
  }, 30000);
});

/** A solid background, so any pixel that is not this colour is something drawn over it. */
const MAGENTA = { r: 255, g: 0, b: 255 };

async function bgUri(): Promise<string> {
  const png = await sharp({ create: { width: W45, height: H45, channels: 3, background: MAGENTA } })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

async function render(extra: string): Promise<Buffer> {
  const { GET } = await import('@/app/api/image/card/route');
  const q = new URLSearchParams({ title: 'MỸ: MỘT TIÊU ĐỀ NGẮN', bg: await bgUri() });
  const res = await GET(new NextRequest(`http://127.0.0.1/api/image/card?${q}${extra}`));
  expect(res.status).toBe(200);
  return Buffer.from(await res.arrayBuffer());
}

async function at(png: Buffer, x: number, y: number) {
  const { data } = await sharp(png).extract({ left: x, top: y, width: 1, height: 1 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { r: data[0], g: data[1], b: data[2] };
}

const isBare = (p: { r: number; g: number; b: number }) => p.r > 200 && p.g < 60 && p.b > 200;

describe('the classic card, rendered', () => {
  it('draws the badge on the art’s own spot when nothing asks otherwise', async () => {
    const png = await render('');
    expect(isBare(await at(png, LOGO.x + 20, LOGO.y + 89))).toBe(false);   // badge covers it
    expect(isBare(await at(png, 540, 420))).toBe(true);                    // the clear gap
  }, 30000);

  it('moves the badge where lx/ly say, and leaves nothing behind', async () => {
    const png = await render('&lx=0&ly=0');
    expect(isBare(await at(png, 20, 89))).toBe(false);                     // badge here now
    expect(isBare(await at(png, LOGO.x + 20, LOGO.y + 89))).toBe(true);    // and gone from there
  }, 30000);

  it('lifts the headline out of the bottom when ty says so', async () => {
    const bottom = await render('');
    const lifted = await render('&ty=10');
    // Row 200 is above the gradient and empty on the shipped layout; the lifted headline
    // has to put ink there or the parameter did nothing.
    const inkAt = async (png: Buffer, y: number) => {
      // Left of the badge: it occupies x 844..1022 on rows 38..216 and would count as ink.
      const { data } = await sharp(png).extract({ left: 56, top: y, width: 760, height: 2 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let n = 0;
      for (let i = 0; i < data.length; i += 3) if (!isBare({ r: data[i], g: data[i + 1], b: data[i + 2] })) n++;
      return n;
    };
    expect(await inkAt(bottom, 200)).toBe(0);
    expect(await inkAt(lifted, 200)).toBeGreaterThan(50);
  }, 30000);
});

describe('moving the card on the Video screen', () => {
  /**
   * The placement handles live on the Video screen, because that is the only screen where
   * the headline and the caption band are visible together — and they were landing on each
   * other. But the reel step reads the card the Ảnh step already wrote, so dragging changed
   * ctx.kit.card and nothing else: the preview redrew the same card and the render would
   * have used it too.
   */
  const ctxFor = (cardTab: Record<string, unknown>, stored: string) => ({
    runId: 'r-place',
    channel: { id: 'c1', name: 'C' },
    kit: {
      id: 'k',
      name: 'K',
      card: { engine: 'classic', ratio: '4:5', highlight: 'none', ...cardTab },
      frame: { layout: 'card-top' },
      captions: { preset: 'classic', pos: 0.72 },
    },
    overrides: Object.keys(cardTab).length ? { card: cardTab } : {},
    selection: { commentIds: [], hideUnselected: false },
    outputs: { image: { url: '/x.png', path: stored, kind: 'png' }, fetch: { images: [] } },
  });

  const plateOf = (url: string) => decodeURIComponent((url.match(/plate=([^&]*)/) ?? [])[1] ?? '');

  it('redraws the card when a handle has been moved, and reuses it when none has', async () => {
    const { reelStep } = await import('@/lib/studio/steps/reel');
    const stored = path.join(os.tmpdir(), `placement-stored-${process.pid}.png`);
    await sharp({ create: { width: 1080, height: 1350, channels: 3, background: { r: 10, g: 20, b: 30 } } })
      .png()
      .toFile(stored);
    const draft = { title: 'MỘT TIÊU ĐỀ', text: 'Một câu để có cảnh.', hashtags: [], comments: [] } as any;

    const untouched: any = await reelStep.preview!(draft, ctxFor({}, stored) as any);
    const moved: any = await reelStep.preview!(draft, ctxFor({ y: 20 }, stored) as any);

    const a = plateOf(untouched.data.firstFrameUrl);
    const b = plateOf(moved.data.firstFrameUrl);
    expect(a, 'a plate was composed').toBeTruthy();
    expect(b).not.toBe(a);
    // Both are cards at the kit's own ratio. Under the story frame the preview hands the
    // frame route the card and the raw photo separately and the route composes the moment,
    // so the plate is no longer a pre-composed 1080×1920 scene — the composition moved,
    // the claim did not: a moved handle still means a different card.
    for (const p of [a, b]) {
      const m = await sharp(p).metadata();
      expect([m.width, m.height], p).toEqual([1080, 1350]);
    }
    fs.rmSync(stored, { force: true });
  }, 60000);
});
