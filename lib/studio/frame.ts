/**
 * One composed frame of the reel: the plate the scene shows, the caption band as the render
 * will draw it, and the sticker where the overlay pass puts it.
 *
 * The caption is NOT drawn here. `deploy/make-reel.py --preview-frame` draws it with the
 * same `render_cue` the real render calls, and its own docstring says why: "if this ever
 * forks into its own drawing code, the preview starts lying". So this composes around that
 * PNG rather than beside it — the route is imported in-process, the way image.ts imports the
 * card renderer, because a round trip over HTTP would only buy a base-URL guess and, on
 * posting.desoul.dev, a Cloudflare Access page instead of an image.
 *
 * The URL half lives in frame-url.ts so the browser can build it; this half draws it.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { NextRequest } from 'next/server';
import { POST as drawPreviewFrame } from '@/app/api/video/preview/route';
import { STICKER_INSET } from './steps/overlay';
import { cardPngFor, isCardUrl, scenePlate } from './plate';
import { hashOf } from './hash';
import type { FrameSpec } from './frame-url';

export { frameQuery, frameUrl, type FrameSpec } from './frame-url';

const CACHE_DIR = path.join(process.cwd(), 'data', 'studio-cache', 'frames');
const W = 1080;
const H = 1920;
/** A week. Long enough that a caption slider never re-renders, short enough to not grow. */
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/** Drop frames nothing has asked for in a week. Cheap: one readdir per miss, never per hit. */
function sweep(): void {
  const cutoff = Date.now() - KEEP_MS;
  try {
    for (const f of fs.readdirSync(CACHE_DIR)) {
      const p = path.join(CACHE_DIR, f);
      if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, { force: true });
    }
  } catch {
    /* a cache that cannot be swept is still a cache */
  }
}

async function stickerOn(base: Uint8Array, sticker: string): Promise<Uint8Array> {
  if (!fs.existsSync(sticker)) return base;
  const meta = await sharp(sticker).metadata();
  const sw = meta.width ?? 0;
  const sh = meta.height ?? 0;
  if (!sw || !sh) return base;
  // The same inset overlayFilter() gives ffmpeg, so the still and the MP4 agree on where
  // the sticker sits rather than each carrying its own numbers.
  return sharp(base)
    .composite([
      {
        input: sticker,
        left: Math.max(0, W - sw - STICKER_INSET.right),
        top: Math.max(0, H - sh - STICKER_INSET.bottom),
      },
    ])
    .png()
    .toBuffer();
}

/** The composed PNG, rendered once per distinct set of inputs and kept on disk. */
export async function renderFrame(spec: FrameSpec): Promise<Uint8Array> {
  const key = hashOf(spec.text, spec.style, spec.plate ?? null, spec.sticker ?? null, spec.layout ?? null, spec.background ?? null);
  const file = path.join(CACHE_DIR, `${key}.png`);
  if (fs.existsSync(file)) return fs.readFileSync(file);

  // The plate the engine gets is the scene as the reel will show it: a card URL is drawn
  // first (in-process), and for the overlay layouts the card is placed over the background
  // where the S12 pass puts it — so the engine's cover-scale of a 1080×1920 plate is identity.
  let plate: string | null = spec.plate ?? null;
  if (plate && isCardUrl(plate)) plate = await cardPngFor(plate);
  if (spec.layout) plate = await scenePlate({ card: plate, background: spec.background ?? null, layout: spec.layout });

  const res = await drawPreviewFrame(
    new NextRequest('http://127.0.0.1/api/video/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: spec.text ?? '', style: spec.style ?? {}, plate }),
    }),
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Trình dựng khung trả về ${res.status}.`);
  }

  let png: Uint8Array = Buffer.from(await res.arrayBuffer());
  if (spec.sticker) png = await stickerOn(png, spec.sticker);

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  sweep();
  fs.writeFileSync(file, png);
  return png;
}
