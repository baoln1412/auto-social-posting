import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

/**
 * Preview fidelity, measured on every shipped kit.
 *
 * The composed frame the kit editor and the run page show must be what the reel does: for
 * `card-top` / `continuous` the card is an overlay the S12 pass places (centre, 6% or 18%
 * from the top) over the background; for `multi` the card is the scene plate the engine
 * cover-scales. v2's preview ignored that and cover-scaled a fixed 4:5 sample, which cut the
 * card's text at both edges — and nobody could tell whether the reel did too.
 *
 * Two measurements, per kit: (1) the card lands whole — its four inset corners in the frame
 * are the card's own pixels there, and the box the layout gives it is inside 1080×1920;
 * (2) the caption band carries text — the band's bright pixels outnumber the same band in
 * the plate-only composition. The gate says how many kits it checked.
 */
process.env.STUDIO_ENABLED = '1'; // the studio card route answers 404 without it
process.env.STUDIO_SQLITE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'studio-fit-')), 'test.db');

const { cardBox } = await import('@/lib/studio/steps/filters');
const { scenePlate, cardPngFor } = await import('@/lib/studio/plate');
const { renderFrame } = await import('@/lib/studio/frame');
const { captionStyle, cardParams, cardPath } = await import('@/lib/studio/kits/load');
const { layoutOf } = await import('@/lib/studio/steps/overlay');
const { W, H } = await import('@/lib/studio/steps/filters');
type Kit = import('@/lib/studio/steps/types').Kit;

const KITS_DIR = path.join(process.cwd(), 'deploy', 'assets', 'kits', 'kits');
const SAMPLE = { title: 'MỸ: CỤ BÀ 82 TUỔI Ở POMONA BỊ LỪA MẤT 2.500 ĐÔ VÌ CHIÊU VÉ SỐ TRÚNG THƯỞNG' };
const CUE = 'CỤ BÀ 82 TUỔI BỊ LỪA MẤT 2.500 ĐÔ';

const kits = fs
  .readdirSync(KITS_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(KITS_DIR, f), 'utf8')) as Kit);

async function px(file: string | Uint8Array) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  return {
    w: info.width,
    h: info.height,
    at: (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return [data[i], data[i + 1], data[i + 2]] as const;
    },
    bright: (y0: number, y1: number) => {
      let n = 0;
      for (let y = Math.max(0, y0); y < Math.min(info.height, y1); y++) {
        for (let x = 0; x < info.width; x++) {
          const i = (y * info.width + x) * info.channels;
          if (data[i] + data[i + 1] + data[i + 2] > 3 * 200) n++;
        }
      }
      return n;
    },
  };
}

const close = (a: readonly number[], b: readonly number[], tol = 28) =>
  Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol && Math.abs(a[2] - b[2]) < tol;

let checked = 0;
beforeAll(() => {
  expect(kits.length, 'no kits to check — the gate checked nothing').toBeGreaterThan(0);
});

describe.each(kits.map((k) => [k.id, k] as const))('kit %s', (_id, kit) => {
  it('lands its card whole in the frame, and draws a caption over it', async () => {
    const layout = layoutOf(kit, {});
    const card = await cardPngFor(`${cardPath(kit)}?${cardParams(kit, SAMPLE)}`);
    const cardPx = await px(card);
    const box = cardBox(layout, cardPx.w, cardPx.h);

    // (1a) arithmetic: the box the layout gives the card is inside the frame — for `multi`
    // the box is the cover-scale, so a non-9:16 card fails here with the crop in numbers.
    expect(box.x, `card off the left: ${JSON.stringify(box)}`).toBeGreaterThanOrEqual(0);
    expect(box.y, `card off the top: ${JSON.stringify(box)}`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.w, `card cut on the right by ${box.x + box.w - W}px`).toBeLessThanOrEqual(W);
    expect(box.y + box.h, `card cut at the bottom by ${box.y + box.h - H}px`).toBeLessThanOrEqual(H);

    // (1b) measured: the frame's pixels at the card's inset corners are the card's own.
    const plate = await scenePlate({ card, background: null, layout });
    const frame = await px(await renderFrame({ text: CUE, style: captionStyle(kit), plate }));
    expect(frame.w).toBe(W);
    expect(frame.h).toBe(H);
    const sx = box.w / cardPx.w;
    const sy = box.h / cardPx.h;
    for (const [fx, fy] of [
      [box.x + 12, box.y + 12],
      [box.x + box.w - 13, box.y + 12],
      [box.x + 12, box.y + box.h - 13],
      [box.x + box.w - 13, box.y + box.h - 13],
    ]) {
      const cx = Math.min(cardPx.w - 1, Math.round((fx - box.x) / sx));
      const cy = Math.min(cardPx.h - 1, Math.round((fy - box.y) / sy));
      const want = cardPx.at(cx, cy);
      const got = frame.at(fx, fy);
      // The caption band may legitimately cover a corner; then the pixel is text or outline
      // (near white or near black), not "somewhere else".
      const captionish = got[0] + got[1] + got[2] > 3 * 220 || got[0] + got[1] + got[2] < 3 * 30;
      expect(close(want, got) || captionish, `at (${fx},${fy}) wanted ${want} got ${got}`).toBe(true);
    }

    // (2) the caption band has text: more bright pixels than the plate alone at those rows.
    const bandY = Math.round(H * (((captionStyle(kit) as { pos?: number }).pos ?? 855 / 1920)));
    const bare = await px(plate!);
    expect(frame.bright(bandY - 160, bandY + 160)).toBeGreaterThan(bare.bright(bandY - 160, bandY + 160) + 500);
    checked++;
  }, 120_000);
});

it(`checked ${kits.length} kits`, () => {
  expect(checked).toBe(kits.length);
});
