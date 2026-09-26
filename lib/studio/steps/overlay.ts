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
} from './filters';
import type { Kit, Overrides } from './types';
import { inPaintOrder, toPixels, type Layer } from '../layers';
import { W, H } from './filters';

export { INTRO_SEC, STICKER_INSET, type Where } from './filters';

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
    await chain(plan.card, (w, h) => layoutAt(plan.layout, w, h));
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

  let aOut: string | null = null;
  if (plan.sfx && fs.existsSync(plan.sfx)) {
    const mix = sfxMix(sceneBoundaries(plan.sceneChars ?? [], plan.durationSec), inputs.length + 1);
    if (mix) {
      inputs.push(plan.sfx);
      legs.push(mix);
      aOut = '[aout]';
    }
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
