/**
 * The scene plate — what the engine is handed for a scene, composed the way the reel will
 * actually look.
 *
 * make-reel.py cover-scales any plate to 1080×1920 (`force_original_aspect_ratio=increase,
 * crop`); its preview does the same. For `card-top` / `continuous` the card is NOT a plate
 * at all — the S12 overlay pass draws it at a fixed place over the background — so the
 * preview must draw it there too, or it lies. For `multi` the card IS the plate, and this
 * returns it untouched: if it is not 9:16 the engine crops it, and the fidelity gate says so
 * in numbers rather than hiding it.
 *
 * Server only: renders card routes in-process (the way image.ts does) and writes to
 * data/studio-cache/. Every output is cached by the hash of its inputs.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { NextRequest } from 'next/server';
import { GET as renderClassic } from '@/app/api/image/card/route';
import { GET as renderStudio } from '@/app/api/studio/card/route';
import { hashOf } from './hash';
import { cardBox, H, W, type Layout } from './steps/filters';

const CACHE = path.join(process.cwd(), 'data', 'studio-cache');
/** make-reel.py's own neutral plate colour, so an empty background matches the engine's. */
const STAGE = { r: 18, g: 18, b: 18 };

/** A relative card URL — the kit editor sends the card it is drawing, unsaved values and all. */
export function isCardUrl(plate: string): boolean {
  return plate.startsWith('/api/studio/card?') || plate.startsWith('/api/image/card?');
}

/** The card a card URL draws, as a PNG on disk (rendered in-process, cached). */
export async function cardPngFor(cardUrl: string): Promise<string> {
  const dir = path.join(CACHE, 'cards');
  const file = path.join(dir, `${hashOf(cardUrl)}.png`);
  if (fs.existsSync(file)) return file;
  const render = cardUrl.startsWith('/api/studio/card') ? renderStudio : renderClassic;
  const res = await render(new NextRequest(`http://127.0.0.1${cardUrl}`));
  if (!res.ok) throw new Error(`Trình dựng ảnh trả về ${res.status}.`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

/**
 * The plate for one scene: for the overlay layouts, the card placed where the pass places
 * it over the background (or the neutral stage); for `multi`, the card itself, or the
 * background when there is no card. Returns a file path, or null when there is nothing.
 */
export async function scenePlate(opts: {
  card: string | null;
  background: string | null;
  layout: Layout;
}): Promise<string | null> {
  const bg = opts.background && fs.existsSync(opts.background) ? opts.background : null;
  if (opts.layout === 'multi') return opts.card ?? bg;
  if (!opts.card) return bg;

  const dir = path.join(CACHE, 'plates');
  const stat = fs.statSync(opts.card);
  const file = path.join(dir, `${hashOf(opts.card, stat.mtimeMs, stat.size, bg, opts.layout)}.png`);
  if (fs.existsSync(file)) return file;

  const meta = await sharp(opts.card).metadata();
  const cw = meta.width ?? W;
  const ch = meta.height ?? H;
  const box = cardBox(opts.layout, cw, ch);

  const canvas = bg
    ? sharp(bg).resize(W, H, { fit: 'cover' })
    : sharp({ create: { width: W, height: H, channels: 3, background: STAGE } });
  // The overlay pass draws the card at its natural size and ffmpeg shows whatever part is
  // inside the frame. Same here: the part that fits is drawn, nothing is scaled to hide a
  // card that is too big — the gate reports that in numbers, the preview shows it.
  const left = Math.max(0, box.x);
  const top = Math.max(0, box.y);
  const vw = Math.min(cw - (left - box.x), W - left);
  const vh = Math.min(ch - (top - box.y), H - top);
  const input =
    vw === cw && vh === ch
      ? opts.card
      : await sharp(opts.card).extract({ left: left - box.x, top: top - box.y, width: vw, height: vh }).png().toBuffer();
  const png = await canvas.composite([{ input, left, top }]).png().toBuffer();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, png);
  return file;
}
