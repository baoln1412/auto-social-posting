import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyOverlays, watermarkPng, type OverlayPlan } from '@/lib/studio/steps/overlay';

/**
 * The overlay pass, actually run — real ffmpeg, real filters, real MP4s out.
 *
 * Over a six-second synthetic clip rather than a gold post: what this slice changed is the
 * pass, and deploy/make-reel.py's render is unchanged and hash-pinned in overlay.test.ts. Six
 * renders of a real reel would be fifteen minutes of suite for the same evidence about the
 * same code.
 *
 * The frames land in tests/shots/overlay/ and are the slice's STOP artefact.
 */
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const SHOTS = path.join(process.cwd(), 'tests', 'shots', 'overlay');
const CARD = path.join(process.cwd(), 'public', 'studio-demo', 'card.png');
const DURATION = 6;

let dir = '';
let source = '';

function frame(mp4: string, at: number, out: string): void {
  execFileSync(FFMPEG, ['-y', '-ss', String(at), '-i', mp4, '-frames:v', '1', out], {
    env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` },
  });
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-overlay-'));
  source = path.join(dir, 'source.mp4');
  fs.mkdirSync(SHOTS, { recursive: true });
  // A plain clip with an audio track, so the SFX mix has something to mix into.
  execFileSync(
    FFMPEG,
    [
      '-y',
      '-f', 'lavfi', '-i', `color=c=0x141414:s=1080x1920:d=${DURATION}`,
      '-f', 'lavfi', '-i', `sine=frequency=220:duration=${DURATION}`,
      '-shortest', '-pix_fmt', 'yuv420p', source,
    ],
    { env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` } },
  );
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const CASES: { name: string; at: number; plan: () => Promise<OverlayPlan> | OverlayPlan }[] = [
  {
    name: '1-layout-card-top',
    at: 3,
    plan: () => ({ layout: 'card-top', card: CARD, durationSec: DURATION }),
  },
  {
    name: '2-layout-continuous',
    at: 3,
    plan: () => ({ layout: 'continuous', card: CARD, durationSec: DURATION }),
  },
  {
    name: '3-sticker-fly-in',
    at: 1,
    plan: () => ({
      layout: 'multi',
      sticker: CARD,
      stickerWhere: ['intro'],
      fly: 'cheo',
      durationSec: DURATION,
    }),
  },
  {
    name: '4-signature-dvd',
    at: 4,
    plan: () => ({ layout: 'multi', dvd: '@desoul.posting', durationSec: DURATION }),
  },
  {
    name: '5-watermark',
    at: 3,
    plan: async () => ({
      layout: 'multi',
      watermark: await watermarkPng('@desoul.posting'),
      durationSec: DURATION,
    }),
  },
  {
    name: '6-outro',
    at: DURATION - 0.5,
    plan: () => ({ layout: 'multi', outro: CARD, durationSec: DURATION }),
  },
];

describe('every overlay renders', () => {
  for (const c of CASES) {
    it(`${c.name} produces a playable MP4 and a frame that shows it`, async () => {
      const mp4 = path.join(dir, `${c.name}.mp4`);
      fs.copyFileSync(source, mp4);
      const before = fs.statSync(mp4).size;

      expect(await applyOverlays(mp4, await c.plan())).toBe(true);
      // Replaced in place, and by something: an overlay that silently did nothing would
      // leave the file byte-identical, which is exactly the failure mode worth catching.
      expect(fs.statSync(mp4).size).not.toBe(before);

      frame(mp4, c.at, path.join(SHOTS, `${c.name}.png`));
      expect(fs.statSync(path.join(SHOTS, `${c.name}.png`)).size).toBeGreaterThan(5_000);
    }, 60_000);
  }

  it('mixes a transition sound in without losing the narration track', async () => {
    const mp4 = path.join(dir, 'sfx.mp4');
    fs.copyFileSync(source, mp4);
    // Any decodable file works as the sound; the point is the mix, not the sample.
    const sfx = path.join(dir, 'blip.wav');
    execFileSync(FFMPEG, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=0.2', sfx], {
      env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` },
    });

    expect(
      await applyOverlays(mp4, {
        layout: 'multi',
        durationSec: DURATION,
        sceneChars: [100, 100, 100],
        sfx,
      }),
    ).toBe(true);

    const streams = execFileSync(
      '/opt/homebrew/bin/ffprobe',
      ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', mp4],
      { encoding: 'utf8' },
    );
    expect(streams).toContain('audio');
    expect(streams).toContain('video');
  }, 60_000);

  it('leaves a silent clip alone rather than failing on -map 0:a', async () => {
    const silent = path.join(dir, 'silent.mp4');
    execFileSync(
      FFMPEG,
      ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=540x960:d=2', '-pix_fmt', 'yuv420p', silent],
      { env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` } },
    );
    // public/studio-demo/demo.mp4 has no audio stream, and the first version of this pass
    // mapped 0:a unconditionally — the whole overlay then failed and was swallowed.
    expect(await applyOverlays(silent, { layout: 'multi', dvd: '@x', durationSec: 2 })).toBe(true);
  }, 60_000);
});
