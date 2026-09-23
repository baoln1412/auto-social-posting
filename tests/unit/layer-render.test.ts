import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { applyOverlays, placeLayers } from '@/lib/studio/steps/overlay';
import { H, W } from '@/lib/studio/steps/filters';
import { toPixels, type Layer } from '@/lib/studio/layers';

/**
 * The slice's "done when", measured: a layer placed in the editor's 0..1 units has to land
 * in the same place in the rendered MP4, within two per cent.
 *
 * Not asserted by reading the filter string back — that would only prove the code agrees
 * with itself. A solid, unmistakable colour is drawn, the reel is rendered for real, a frame
 * is pulled out of it, and the pixels of that colour are counted to find where the layer
 * actually is.
 */
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const MARK = { r: 255, g: 0, b: 234 }; // nothing else in this frame is magenta
const TOLERANCE = 0.02;

let dir = '';
let source = '';

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-layers-'));
  source = path.join(dir, 'source.mp4');
  execFileSync(
    FFMPEG,
    ['-y', '-f', 'lavfi', '-i', `color=c=0x141414:s=${W}x${H}:d=3`, '-pix_fmt', 'yuv420p', source],
    { env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` } },
  );
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

/** Where the marked pixels actually are, in the same 0..1 units the editor uses. */
async function findMark(png: string): Promise<{ x: number; y: number; w: number; h: number }> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      // Generous per-channel tolerance: the frame went through h264, which does not keep a
      // colour exactly. The mark is far enough from everything else for that to be safe.
      if (
        Math.abs(data[i] - MARK.r) < 60 &&
        data[i + 1] < 90 &&
        Math.abs(data[i + 2] - MARK.b) < 60
      ) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  expect(maxX, 'the layer was not found in the rendered frame at all').toBeGreaterThan(-1);
  return {
    x: minX / info.width,
    y: minY / info.height,
    w: (maxX - minX + 1) / info.width,
    h: (maxY - minY + 1) / info.height,
  };
}

async function renderWith(layers: Layer[], name: string): Promise<string> {
  const mp4 = path.join(dir, `${name}.mp4`);
  fs.copyFileSync(source, mp4);
  const placed = await placeLayers(layers);
  expect(await applyOverlays(mp4, { layout: 'multi', durationSec: 3, layers: placed })).toBe(true);

  const png = path.join(dir, `${name}.png`);
  execFileSync(FFMPEG, ['-y', '-ss', '1', '-i', mp4, '-frames:v', '1', png], {
    env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` },
  });
  return png;
}

const mark = (over: Partial<Layer> = {}): Layer => ({
  id: 'mark',
  type: 'shape',
  x: 0.25,
  y: 0.3,
  w: 0.5,
  h: 0.2,
  z: 1,
  props: { bg: '#FF00EA', radius: 0, opacity: 1 },
  ...over,
});

describe('a layer lands where the editor put it', () => {
  it('within two per cent, on every edge', async () => {
    const want = mark();
    const got = await findMark(await renderWith([want], 'centre'));

    for (const k of ['x', 'y', 'w', 'h'] as const) {
      expect(Math.abs(got[k] - want[k]), `${k}: wanted ${want[k]}, measured ${got[k]}`).toBeLessThan(
        TOLERANCE,
      );
    }
  }, 120_000);

  it('and still does after it is dragged into a corner', async () => {
    const want = mark({ x: 0.02, y: 0.7, w: 0.3, h: 0.1 });
    const got = await findMark(await renderWith([want], 'corner'));
    for (const k of ['x', 'y', 'w', 'h'] as const) {
      expect(Math.abs(got[k] - want[k]), `${k}: wanted ${want[k]}, measured ${got[k]}`).toBeLessThan(
        TOLERANCE,
      );
    }
  }, 120_000);

  it('paints a higher layer over a lower one', async () => {
    // Two boxes on the same spot; only the top one's colour should survive.
    const under = mark({ id: 'under', z: 1, props: { bg: '#FF00EA', opacity: 1 } });
    const over: Layer = { ...under, id: 'over', z: 2, props: { bg: '#141414', opacity: 1 } };
    const png = await renderWith([under, over], 'stack');
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const mid = (Math.round(info.height * 0.4) * info.width + Math.round(info.width * 0.5)) * info.channels;
    expect(data[mid + 1], 'the lower layer showed through').toBeLessThan(90);
    expect(Math.abs(data[mid] - MARK.r)).toBeGreaterThan(60);
  }, 120_000);

  it('does not draw a locked row — the engine already burned those in', async () => {
    const png = await renderWith([mark({ locked: true })], 'locked').catch(() => null);
    // Nothing to composite means no pass at all, so applyOverlays returns false and the
    // helper's expectation fails — which is the assertion.
    expect(png).toBeNull();
  }, 120_000);

  it('agrees with the editor’s own arithmetic', () => {
    // The editor multiplies the same numbers out at canvas size; this is that one line.
    expect(toPixels(mark(), W, H)).toEqual({ left: 270, top: 576, width: 540, height: 384 });
  });
});
