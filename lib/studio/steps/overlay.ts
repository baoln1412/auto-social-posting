/**
 * Everything composited AFTER make-reel.py — beside the engine, never inside it.
 *
 * deploy/make-reel.py is the measured $0 path and stays unedited (tests/unit/overlay.test.ts
 * pins its hash). This is one ffmpeg pass over its output: the layout's card, the sticker,
 * the drifting handle, the tiled watermark, the end card, and the transition sounds — chained
 * into a single filter_complex so a reel is re-encoded once rather than once per overlay.
 *
 * If the pass fails, the reel is still a finished reel, so a failure here is logged and
 * swallowed rather than losing a three-minute render.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { mediaById } from '../assets';
import { hashOf } from '../hash';
import {
  dvdAt,
  dvdSvg,
  layerAt,
  layerSvg,
  layoutAt,
  outroAt,
  sceneBoundaries,
  sfxMix,
  stickerAt,
  watermarkSvg,
  type FlyStyle,
  type Layout,
  type Where,
  sfxLegs,
  musicLeg,
  heroAt,
  insetAt,
  insetSize,
  SLOT,
  creditAt,
  eyebrowAt,
  numberAt,
  middleAt,
  MIDDLE_WIDTH,
  MIDDLE_RISE,
  MUSIC_LABELS,
  type MusicLevel,
} from './filters';
import type { Kit, Overrides } from './types';
import { inPaintOrder, toPixels, type Layer } from '../layers';
import { W, H } from './filters';

export { INTRO_SEC, STICKER_INSET, MUSIC_GAIN, MUSIC_LABELS, HERO_SEC, INSET_SEC, insetSize, type Where, type MusicLevel } from './filters';

const run = promisify(execFile);
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';
const CACHE = path.join(process.cwd(), 'data', 'studio-cache', 'overlay');

export interface StickerTab {
  set?: string;
  where?: Where[];
  fly?: FlyStyle;
  /** 'ai' lets a classifier choose among the owner's stickers for each reel. */
  pick?: 'fixed' | 'ai';
}
export interface SignatureTab {
  handle?: boolean;
  watermark?: boolean;
}

/** Where the kit wants a sticker at all. `reactions` is per-scene and is not built. */
export function stickerShows(where: Where[] | undefined): boolean {
  return Boolean(where?.includes('cover') || where?.includes('intro'));
}

/** The sticker PNG this kit composites, or null. Shared by the MP4 pass and the preview. */
export function stickerPath(kit: Kit): string | null {
  const tab = (kit.stickers ?? {}) as StickerTab;
  if (!stickerShows(tab.where) || !tab.set) return null;
  const row = mediaById(tab.set);
  return row && fs.existsSync(row.path) ? row.path : null;
}

/**
 * What goes behind the card, as media make-reel.py can fetch.
 *
 * Two kinds of answer. A media id names something the owner uploaded to Kho tài nguyên. The
 * literal `article` means this post's own picture — which is what stops an overlay layout
 * from drawing 570 of a reel's 1920 pixels in stage black, measured in
 * tests/unit/plate-background.test.ts. Before this, `card-top` could only ever have an
 * uploaded background, so every kit that shipped with one had bands of nothing.
 */
export function backgroundMedia(
  kit: Kit,
  picture?: string | null,
): { url: string; kind: 'image' | 'video' } | null {
  const id = ((kit.frame ?? {}) as { background?: string }).background;
  if (!id) return null;
  if (id === 'article') return picture ? { url: picture, kind: 'image' } : null;
  const row = mediaById(id);
  if (!row || !fs.existsSync(row.path)) return null;
  return {
    url: `file://${row.path}`,
    kind: /\.mp4$/i.test(path.extname(row.path)) ? 'video' : 'image',
  };
}

/**
 * Which layout the reel is in.
 *
 * `multi` is what make-reel already produces — one plate per scene — so it needs no overlay
 * and the card stays in the media list. The other two place the card themselves, which is
 * why reel.ts withholds it from `media` for those: overlaying a card that is also a plate
 * would show it twice.
 */
export function layoutOf(kit: Kit, ov: Overrides): Layout {
  const f = (kit.frame ?? {}) as { layout?: string };
  const l = (ov.frame as { layout?: string } | undefined)?.layout ?? f.layout;
  return l === 'card-top' || l === 'continuous' ? l : 'multi';
}

/** True when the card is the overlay's to place, so the renderer must not also show it. */
export function cardIsOverlay(kit: Kit, ov: Overrides): boolean {
  return layoutOf(kit, ov) !== 'multi';
}

/**
 * Whether this file has an audio stream at all.
 *
 * make-reel.py always produces one, but `-map 0:a` on a silent input fails the whole pass —
 * and a pass that cannot run leaves the reel unchanged, which looks like the overlay
 * silently doing nothing. Asking is cheaper than debugging that.
 */
export async function hasAudio(file: string): Promise<boolean> {
  try {
    const { stdout } = await run(FFPROBE, [
      '-v', 'error',
      '-select_streams', 'a',
      '-show_entries', 'stream=index',
      '-of', 'csv=p=0',
      file,
    ]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function pngSize(file: string): Promise<{ w: number; h: number }> {
  const m = await sharp(file).metadata();
  return { w: m.width ?? 0, h: m.height ?? 0 };
}

/** A generated PNG, written once per distinct content. */
async function cachedPng(key: string, make: () => Promise<Buffer>): Promise<string> {
  const file = path.join(CACHE, `${key}.png`);
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, await make());
  return file;
}

/** The owner's own layers for this frame, ready to composite. */
export interface PlacedLayer {
  file: string;
  left: number;
  top: number;
}

/**
 * Rasterise each layer at exactly the pixels the editor showed.
 *
 * The editor multiplies the same 0..1 numbers out at canvas size; this multiplies them out
 * at frame size. That is the whole agreement, and tests/unit/layer-render.test.ts measures
 * it on a rendered MP4 rather than trusting it.
 */
export async function placeLayers(layers: Layer[]): Promise<PlacedLayer[]> {
  const out: PlacedLayer[] = [];
  for (const l of inPaintOrder(layers.filter((x) => !x.locked))) {
    const box = toPixels(l, W, H);
    let file: string | null = null;

    if (l.type === 'image') {
      const row = l.props?.media ? mediaById(l.props.media) : undefined;
      if (!row || !fs.existsSync(row.path)) continue;
      // Resized to the box the owner drew, so the frame and the canvas agree on its bounds
      // even when the upload is a different shape.
      file = await cachedPng(`ly-${hashOf(row.path, box.width, box.height)}`, async () =>
        sharp(row.path).resize(box.width, box.height, { fit: 'fill' }).png().toBuffer(),
      );
    } else {
      const svg = layerSvg(l.type, box.width, box.height, l.props ?? {}, H);
      file = await cachedPng(`ly-${hashOf(svg)}`, async () =>
        sharp(Buffer.from(svg)).png().toBuffer(),
      );
    }
    if (file) out.push({ file, left: box.left, top: box.top });
  }
  return out;
}

export interface OverlayPlan {
  /** Absolute path of the card PNG, when the layout places it. */
  card?: string | null;
  sticker?: string | null;
  stickerWhere?: Where[];
  fly?: FlyStyle;
  layout: Layout;
  /** The drifting handle's text, or null. */
  dvd?: string | null;
  watermark?: string | null;
  /** Absolute path of an end-card PNG. */
  outro?: string | null;
  durationSec: number;
  /** Characters per scene, used to place the transition sounds. */
  sceneChars?: number[];
  sfx?: string | null;
  /**
   * The story frame: the card sharp for the opening, then an inset, then gone — with the
   * top-left slot carrying the source credit and then the eyebrow. When off, the card is
   * pinned for the whole reel the way it always was.
   */
  story?: boolean;
  /** Pre-rendered PNGs for the story frame. */
  inset?: string | null;
  credit?: string | null;
  eyebrow?: string | null;
  /** The big-number card and the window it is up for. */
  number?: string | null;
  numberFrom?: number;
  numberUntil?: number;
  /**
   * The middle band's other tenants — the pull-quote and the causal chain — each already
   * scheduled against the number and each other, so no two are ever enabled at once.
   */
  middle?: { file: string; from: number; until: number }[];
  /** Absolute path of the background music bed, or null. */
  music?: string | null;
  /** How loud that bed sits under the voice. */
  musicLevel?: MusicLevel;
  /** The owner's own layers, already rasterised and placed. */
  layers?: PlacedLayer[];
}

export interface Built {
  inputs: string[];
  filter: string;
  /** The label carrying the finished video, or null when nothing changed it. */
  vOut: string | null;
  aOut: string | null;
}

/**
 * The whole chain, as inputs plus one filter_complex.
 *
 * Exported so the argument list can be asserted without rendering — the same bargain
 * `overlayFilter` struck and the reason nothing here has ever needed a render to debug.
 */
export async function buildChain(plan: OverlayPlan): Promise<Built> {
  const inputs: string[] = [];
  const legs: string[] = [];
  let v = '[0:v]';
  let n = 1;

  let videoLegs = 0;
  const chain = async (file: string, filter: (w: number, h: number) => string | null) => {
    const { w, h } = await pngSize(file);
    const f = filter(w, h);
    if (!f) return;
    inputs.push(file);
    const out = `[v${n}]`;
    legs.push(`${v}[${n}:v]${f}${out}`);
    v = out;
    n += 1;
    videoLegs += 1;
  };

  if (plan.card && plan.layout !== 'multi') {
    if (plan.story) {
      // Three windows that never overlap: sharp where the layout puts it, then the inset,
      // then nothing — the bed and the type carry the rest.
      await chain(plan.card, (w, h) => heroAt(w, h));
      if (plan.inset) await chain(plan.inset, (w, h) => insetAt(w, h));
    } else {
      await chain(plan.card, (w, h) => layoutAt(plan.layout, w, h));
    }
  }
  // One corner, two tenants. The credit is over the hero only, so a viewer sees where the
  // story came from — until now that lived in a comment under the post, which is not the
  // same as being in the video.
  if (plan.credit) await chain(plan.credit, () => creditAt());
  if (plan.eyebrow) await chain(plan.eyebrow, () => eyebrowAt());
  if (plan.number && plan.numberUntil !== undefined) {
    await chain(plan.number, () => numberAt(plan.numberFrom ?? 0, plan.numberUntil!));
  }
  // Centred on its own height, so a two-line quote and a three-box chain both sit balanced
  // in the band. middle.ts has already proved the windows do not overlap.
  for (const m of plan.middle ?? []) {
    await chain(m.file, (_w, h) => middleAt(h, m.from, m.until));
  }
  if (plan.sticker) {
    await chain(plan.sticker, (w, h) => stickerAt(plan.stickerWhere ?? [], plan.fly, w, h));
  }
  if (plan.watermark) {
    await chain(plan.watermark, () => 'overlay=0:0');
  }
  if (plan.outro) {
    await chain(plan.outro, (w, h) => outroAt(plan.durationSec, w, h));
  }
  if (plan.dvd) {
    await chain(await dvdPng(plan.dvd), (w, h) => dvdAt(w, h));
  }
  // The owner's layers last, so they sit above everything the kit put there. What the
  // engine drew — the card, the subtitle — is burned in before this pass runs at all.
  for (const l of plan.layers ?? []) {
    await chain(l.file, () => layerAt(l.left, l.top));
  }

  // One mix, never two. The bed and the whooshes both ride under the same narration, and a
  // second amix stage would re-level the first one's output — the voice would duck under
  // its own transition sounds.
  const aLegs: string[] = [];
  const aLabels: string[] = [];

  if (plan.sfx && fs.existsSync(plan.sfx)) {
    const at = sceneBoundaries(plan.sceneChars ?? [], plan.durationSec);
    const parts = sfxLegs(at, inputs.length + 1);
    if (parts) {
      inputs.push(plan.sfx);
      aLegs.push(parts.legs);
      aLabels.push(...parts.labels);
    }
  }

  if (plan.music && fs.existsSync(plan.music)) {
    const bed = musicLeg(inputs.length + 1, plan.durationSec, plan.musicLevel ?? 'default');
    // Null at Tắt: mixing a silent leg costs an input and an encode for nothing.
    if (bed) {
      inputs.push(plan.music);
      aLegs.push(bed.leg);
      aLabels.push(bed.label);
    }
  }

  let aOut: string | null = null;
  if (aLabels.length) {
    legs.push(...aLegs);
    // `longest` and not `first`: a whoosh near the end must not be clipped, and the
    // narration is always the longest leg anyway.
    legs.push(`[0:a]${aLabels.join('')}amix=inputs=${aLabels.length + 1}:duration=longest:normalize=0[aout]`);
    aOut = '[aout]';
  }

  // Null when nothing touched the video: `-map [0:v]` names a filter label that does not
  // exist, and ffmpeg fails the whole pass for it. An audio-only chain maps 0:v directly.
  return { inputs, filter: legs.join(';'), vOut: videoLegs ? v : null, aOut };
}

/**
 * The ffmpeg argv for a built chain. Exported so it can be asserted without rendering —
 * "is the audio copied or re-encoded" is not a question worth a three-minute answer.
 */
export function overlayArgs(input: string, out: string, built: Built, audio = true): string[] {
  const args = ['-y', '-i', input, ...built.inputs.flatMap((f) => ['-i', f])];
  args.push('-filter_complex', built.filter);
  args.push('-map', built.vOut ?? '0:v');
  if (audio) {
    args.push('-map', built.aOut ?? '0:a');
    // Audio is copied unless something mixed into it — re-encoding it for a video-only
    // overlay would cost quality for nothing.
    args.push('-c:a', built.aOut ? 'aac' : 'copy');
  }
  args.push('-movflags', '+faststart', out);
  return args;
}

/** True if the file at `mp4` was replaced by an overlaid version. */
export async function applyOverlays(mp4: string, plan: OverlayPlan): Promise<boolean> {
  const audio = await hasAudio(mp4);
  const built = await buildChain(audio ? plan : { ...plan, sfx: null });
  if (!built.vOut && !built.aOut) return false;

  const out = path.join(os.tmpdir(), `studio-overlay-${hashOf(mp4, Date.now())}.mp4`);
  const args = overlayArgs(mp4, out, built, audio);

  try {
    await run(FFMPEG, args, {
      env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` },
      maxBuffer: 16 * 1024 * 1024,
    });
    fs.renameSync(out, mp4);
    return true;
  } catch (e) {
    // A failed overlay must not lose the render it was going on top of.
    console.warn('[studio/overlay] pass failed:', e instanceof Error ? e.message : e);
    fs.rmSync(out, { force: true });
    return false;
  }
}

/** The layers stored on this kit for a given frame. */
export function layersOf(kit: Kit, frame: 'hook' | 'body' = 'body'): Layer[] {
  const all = (kit.layers ?? {}) as Record<string, Layer[]>;
  return Array.isArray(all[frame]) ? all[frame] : [];
}

/** The tiled watermark PNG for this handle, generated once. */
export async function watermarkPng(handle: string): Promise<string> {
  return cachedPng(`wm-${hashOf(handle)}`, async () =>
    sharp(Buffer.from(watermarkSvg(handle))).png().toBuffer(),
  );
}

/** The drifting handle as a PNG — this ffmpeg has no drawtext to draw it with. */
export async function dvdPng(handle: string): Promise<string> {
  return cachedPng(`dvd-${hashOf(handle)}`, async () =>
    sharp(Buffer.from(dvdSvg(handle))).png().toBuffer(),
  );
}

/**
 * The picture this run is using — what the owner picked on the Ảnh step, or the article's
 * own first image. The same one the card draws, so the card and the space around it can
 * never disagree about which photo this post is about.
 */
export function articlePicture(kit: Kit, item: { images?: string[] } | null | undefined): string | null {
  const bgUrl = ((kit.card ?? {}) as { bgUrl?: string }).bgUrl;
  if (bgUrl) return bgUrl;
  const first = item?.images?.find((u) => /^https?:/.test(u));
  return first ?? null;
}

/** Text with the diacritics kept but the markup gone, safe inside an SVG. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The top-left chip, in the two forms that corner takes.
 *
 * `eyebrow` is what the story is, white on black, held for the whole reel after the hero.
 * `credit` is where it came from, over the hero only. Both are drawn here rather than by
 * the card renderer because they belong to the reel's timeline, not to the card.
 */
export async function chipPng(
  kind: 'eyebrow' | 'credit',
  lines: string[],
  font = 'BeVietnamPro-Bold',
): Promise<string | null> {
  const rows = lines.map((l) => l.trim()).filter(Boolean).slice(0, 2);
  if (!rows.length) return null;

  const size = kind === 'eyebrow' ? 27 : 24;
  const padX = 14;
  const padY = 9;
  const lh = Math.round(size * 1.26);
  // Vietnamese sets wider than Latin at the same length, and an uppercase eyebrow wider
  // still, so the box is measured off the glyph count rather than a remembered width.
  const wide = Math.max(...rows.map((r) => r.length));
  const w = Math.min(W - SLOT.left * 2, Math.round(wide * size * 0.56) + padX * 2);
  const h = rows.length * lh + padY * 2;
  const bg = kind === 'eyebrow' ? '#FFFFFF' : '#101010';
  const fg = kind === 'eyebrow' ? '#101010' : '#FFFFFF';
  const style = kind === 'credit' ? 'font-style="italic"' : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" rx="6" fill="${bg}"/>
    ${rows
      .map(
        (r, i) =>
          `<text x="${padX}" y="${padY + lh * (i + 1) - Math.round(size * 0.28)}" font-family="${font}, sans-serif" font-size="${size}" font-weight="700" ${style} fill="${fg}">${esc(r)}</text>`,
      )
      .join('')}
  </svg>`;
  return cachedPng(`chip-${hashOf(kind, svg)}`, async () => sharp(Buffer.from(svg)).png().toBuffer());
}

/** The card again, smaller and with its corners taken off, for the inset window. */
export async function insetPng(card: string): Promise<string | null> {
  if (!fs.existsSync(card)) return null;
  const meta = await sharp(card).metadata();
  const cw = meta.width ?? 1080;
  const ch = meta.height ?? 1350;
  const { w, h } = insetSize(cw, ch);
  const r = 24;
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="#fff"/></svg>`,
  );
  return cachedPng(`inset-${hashOf(card, w, h)}`, async () =>
    sharp(card)
      .resize(w, h, { fit: 'fill' })
      .composite([{ input: mask, blend: 'dest-in' }])
      .png()
      .toBuffer(),
  );
}

/* ------------------------------------------------- the middle band's tenants */

/** The Desoul card, as every drawn surface in this product wears it. */
const PEN = '#1F1D18';
const CREAM = '#FFFEFB';
const ACCENT = '#2F6B4F';
/**
 * The pen and its hard offset shadow, scaled for video.
 *
 * The brand says 2.5px and `4px 4px 0`, and those are CSS pixels in a browser. A 1080-wide
 * frame is shown on a ~390pt phone, so a literal 2.5px pen lands under one device pixel and
 * the card reads as the flat admin rectangle the brand file warns about. 7 and 11 are those
 * same values multiplied through the 2.8x the frame is scaled down by.
 */
const PEN_W = 7;
const DROP = 11;

/**
 * The big number, as the reference draws it: black on brand yellow, a block rather than a
 * caption. The unit rides under it at a fraction of the size — "6,92" is the thing you
 * read, "đô la một pound" is what it means, and setting them equal makes neither land.
 */
export async function numberPng(n: { value: string; unit: string }): Promise<string | null> {
  if (!n?.value) return null;
  const size = n.value.length > 6 ? 150 : n.value.length > 4 ? 190 : 230;
  const padX = Math.round(size * 0.18);
  const padY = Math.round(size * 0.10);
  const unitSize = Math.round(size * 0.26);
  // Measured off the glyph count: Vietnamese digits set wide and a comma is not a digit.
  const w = Math.round(n.value.length * size * 0.62) + padX * 2;
  const h = size + padY * 2 + (n.unit ? Math.round(unitSize * 1.5) : 0);
  // The pen and its hard shadow, the same as the quote and the chain wear. Three objects
  // share this band and take turns in it; one of them arriving as a flat rectangle reads
  // as a different product rather than a different beat.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w + DROP}" height="${h + DROP}">
    <rect x="${DROP}" y="${DROP}" width="${w}" height="${h}" rx="14" fill="${PEN}"/>
    <rect x="${PEN_W / 2}" y="${PEN_W / 2}" width="${w - PEN_W}" height="${h - PEN_W}" rx="14"
          fill="#F8EF63" stroke="${PEN}" stroke-width="${PEN_W}"/>
    <text x="${padX}" y="${padY + size * 0.82}" font-family="BeVietnamPro-Black, sans-serif"
          font-size="${size}" font-weight="900" fill="#101010">${esc(n.value)}</text>
    ${
      n.unit
        ? `<text x="${padX}" y="${padY + size + unitSize * 1.05}" font-family="BeVietnamPro-Bold, sans-serif"
             font-size="${unitSize}" font-weight="700" fill="#101010">${esc(n.unit)}</text>`
        : ''
    }
  </svg>`;
  return cachedPng(`num-${hashOf(svg)}`, async () => sharp(Buffer.from(svg)).png().toBuffer());
}

/**
 * Wrap by glyph count, because there are no font metrics in this process.
 *
 * `per` is measured off the face rather than guessed: Vietnamese sets wider than Latin at
 * the same length and the stacked diacritics do not change the advance width, so a factor
 * of the point size is accurate enough for a box that has padding either side.
 */
function wrapTo(text: string, chars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > chars && line) {
      out.push(line);
      line = w;
      if (out.length === maxLines) break;
    } else {
      line = (line + ' ' + w).trim();
    }
  }
  if (line && out.length < maxLines) out.push(line);
  const lines = out.slice(0, maxLines);
  // An ellipsis is honest; a sentence that stops mid-word is a bug.
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[\s,;:]+$/, '')}…`;
  }
  return lines;
}

/** One cream card with the pen outline and its hard shadow, at 0,0 of a w+4 × h+4 canvas. */
function plateSvg(w: number, h: number, r = 18): string {
  const i = PEN_W / 2;
  return (
    `<rect x="${DROP}" y="${DROP}" width="${w}" height="${h}" rx="${r}" fill="${PEN}"/>` +
    `<rect x="${i}" y="${i}" width="${w - PEN_W}" height="${h - PEN_W}" rx="${r}" fill="${CREAM}" stroke="${PEN}" stroke-width="${PEN_W}"/>`
  );
}

/**
 * The pull-quote: the quoted words, and under them who said them.
 *
 * The attribution is the reason this is not the caption again — the karaoke band reads the
 * sentence, this card says whose sentence it is and holds still while the words scroll. So
 * the speaker is set in the accent, not in grey: it is the new information, not a footnote.
 */
export async function quotePng(q: { text: string; who: string }): Promise<string | null> {
  const text = (q?.text ?? '').trim();
  const who = (q?.who ?? '').trim();
  if (!text || !who) return null;

  const w = MIDDLE_WIDTH;
  const size = text.length <= 60 ? 62 : text.length <= 100 ? 54 : 46;
  const pad = 46;
  const lh = Math.round(size * 1.3);
  const lines = wrapTo(text, Math.floor((w - pad * 2) / (size * 0.54)), 4);
  const whoSize = 34;
  const markSize = Math.round(size * 1.8);
  const top = pad + Math.round(markSize * 0.48);
  const h = top + lines.length * lh + Math.round(whoSize * 2.2) + pad;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w + DROP}" height="${h + DROP}">
    ${plateSvg(w, h)}
    <text x="${pad}" y="${pad + markSize * 0.74}" font-family="BeVietnamPro-Black, sans-serif"
          font-size="${markSize}" font-weight="900" fill="${ACCENT}">“</text>
    ${lines
      .map(
        (l, i) =>
          `<text x="${pad}" y="${top + lh * (i + 1) - Math.round(size * 0.28)}" font-family="BeVietnamPro-Bold, sans-serif" font-size="${size}" font-weight="700" fill="${PEN}">${esc(l)}</text>`,
      )
      .join('')}
    <text x="${pad}" y="${top + lines.length * lh + Math.round(whoSize * 1.5)}"
          font-family="BeVietnamPro-Bold, sans-serif" font-size="${whoSize}" font-weight="700"
          letter-spacing="1.5" fill="${ACCENT}">— ${esc(who.toUpperCase())}</text>
  </svg>`;
  return cachedPng(`quote-${hashOf(svg)}`, async () => sharp(Buffer.from(svg)).png().toBuffer());
}

/**
 * The causal chain: two or three boxes, an accent chevron between them.
 *
 * Stacked and not side by side because the frame is 9:16 — three boxes across 968px would
 * each hold about eight characters, and Vietnamese does not fit in eight characters. Down
 * the page each box gets the full width and the chevrons read as the arrows they are.
 *
 * `only` draws one box (and the chevron above it) on the full-stack canvas, leaving the
 * rest transparent. That is how the diagram draws itself in the reel: the same layout,
 * emitted as one layer per box, each with its own entrance. Every layer shares the canvas
 * size, so they share one position and only their timing differs. Omit `only` for the
 * finished diagram, which is what a still has to show.
 */
export async function flowPng(steps: string[], only?: number): Promise<string | null> {
  const boxes = (steps ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 3);
  if (boxes.length < 2) return null;

  const w = MIDDLE_WIDTH;
  const longest = Math.max(...boxes.map((b) => b.length));
  const size = longest <= 22 ? 48 : longest <= 32 ? 42 : 34;
  const pad = 26;
  const lh = Math.round(size * 1.24);
  const perLine = Math.floor((w - pad * 2) / (size * 0.54));
  const rows = boxes.map((b) => wrapTo(b, perLine, 2));
  // The arrow is a gap plus a chevron; the gap is what makes two boxes read as a sequence.
  const gap = 68;
  const chev = { w: 64, h: 36 };

  const heights = rows.map((r) => r.length * lh + pad * 2);
  const h = heights.reduce((a, b) => a + b, 0) + gap * (boxes.length - 1);

  let y = 0;
  const parts: string[] = [];
  rows.forEach((lines, i) => {
    const bh = heights[i];
    const mine = only === undefined || only === i;
    if (mine) {
      parts.push(`<g transform="translate(0,${y})">${plateSvg(w, bh, 16)}</g>`);
      lines.forEach((l, j) => {
        const ty = y + pad + lh * (j + 1) - Math.round(size * 0.3);
        parts.push(
          `<text x="${Math.round(w / 2)}" y="${ty}" text-anchor="middle" font-family="BeVietnamPro-Bold, sans-serif" font-size="${size}" font-weight="700" fill="${PEN}">${esc(l)}</text>`,
        );
      });
    }
    y += bh;
    if (i < rows.length - 1) {
      // The chevron belongs to the box it points AT, so it arrives with that box rather
      // than hanging in the air waiting for it.
      if (only === undefined || only === i + 1) {
        const cx = Math.round(w / 2);
        // Below the box's own hard shadow, or the chevron reads as sitting on a dark smear.
        const cy = y + DROP + Math.round((gap - DROP - chev.h) / 2);
        parts.push(
          `<polygon points="${cx - chev.w / 2},${cy} ${cx + chev.w / 2},${cy} ${cx},${cy + chev.h}" fill="${ACCENT}" stroke="${PEN}" stroke-width="${PEN_W}" stroke-linejoin="round"/>`,
        );
      }
      y += gap;
    }
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w + DROP}" height="${h + DROP}">${parts.join('')}</svg>`;
  return cachedPng(`flow-${hashOf(svg)}`, async () => sharp(Buffer.from(svg)).png().toBuffer());
}

/**
 * The chain as one layer per box, with the delay each waits before arriving.
 *
 * A diagram that appears whole is a picture of a conclusion; one that builds is the
 * argument. The delays shorten as it goes — a batch entrance that accelerates is the
 * difference between a sequence and a list, and an even cadence reads as a slideshow.
 */
export const FLOW_BEATS = [0, 0.5, 0.9];

/**
 * `room` is the window the chain has, in seconds. A box is dropped when it could not
 * finish arriving inside it — a layer that lands 0.1s before the window shuts is a
 * flicker, and two boxes that land beat two that blink.
 */
export function flowBeats(room?: number): number[] {
  if (room === undefined) return [...FLOW_BEATS];
  return FLOW_BEATS.filter((d) => d + MIDDLE_RISE < room);
}

export async function flowLayers(steps: string[], room?: number): Promise<{ file: string; delay: number }[]> {
  const n = Math.min(3, (steps ?? []).filter((s) => s?.trim()).length);
  if (n < 2) return [];
  const beats = flowBeats(room);
  const out: { file: string; delay: number }[] = [];
  for (let i = 0; i < Math.min(n, beats.length); i += 1) {
    const file = await flowPng(steps, i);
    if (file) out.push({ file, delay: beats[i] });
  }
  return out;
}

/* ------------------------------------------------------------- motion draft */

/** Small, fast and ugly on purpose: this is for judging timing, not quality. */
const DRAFT = { width: 540, fps: 15, crf: 32 } as const;

/**
 * The overlay choreography over a still bed, rendered in seconds instead of minutes.
 *
 * The still preview answers "what does one frame look like" and cannot answer "does the
 * card arrive too early, does the chain still hold when the line ends, does the quote
 * collide with the figure". Those are timing questions, and until now the only way to see
 * a timing mistake was to spend a three-minute make-reel.py render on it.
 *
 * What it is NOT: the reel. There is no narration, so no caption band, and the bed does
 * not move. Everything this pass itself places — the card's three treatments, the corner
 * chip, the middle band, the sticker, the end card — is on its real clock.
 *
 * Audio is dropped rather than mixed: a still base has no `[0:a]` to mix into, and a
 * silent draft is the honest answer for a pass whose job is to show motion.
 */
export async function draftOverlay(plan: OverlayPlan, bed: string | null, out: string): Promise<boolean> {
  const d = Math.max(1, plan.durationSec);
  const built = await buildChain({ ...plan, sfx: null, music: null });
  if (!built.vOut) return false;

  const base =
    bed && fs.existsSync(bed)
      ? ['-loop', '1', '-framerate', String(DRAFT.fps), '-t', d.toFixed(2), '-i', bed]
      : ['-f', 'lavfi', '-i', `color=c=0x141414:s=${W}x${H}:r=${DRAFT.fps}:d=${d.toFixed(2)}`];

  // Scaled at the end, never at the start: every overlay's geometry is written against the
  // 1080x1920 frame, so the composite happens full size and only the output is small.
  const filter = `${built.filter};${built.vOut}scale=${DRAFT.width}:-2[vd]`;

  try {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await run(FFMPEG, [
      '-y',
      ...base,
      ...built.inputs.flatMap((f) => ['-i', f]),
      '-filter_complex', filter,
      '-map', '[vd]',
      '-an',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(DRAFT.crf),
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      out,
    ]);
    return fs.existsSync(out);
  } catch (e) {
    // Same bargain as applyOverlays: a draft that fails costs the owner nothing but a
    // message, and must never take the run down with it.
    console.error('[studio] draft overlay failed', e);
    return false;
  }
}
