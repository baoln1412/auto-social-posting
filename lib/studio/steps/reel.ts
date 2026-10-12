/**
 * reel — the video, through deploy/make-reel.py exactly as it stands.
 *
 * `startRenderJob` from app/lib/videoJobs.ts is called, not reimplemented: it already owns
 * the /opt/homebrew/bin PATH, the ::step: progress markers and the stdout drain that keeps a
 * 64KB pipe from looking like a hung render.
 *
 * The card reaches the renderer as a file:// URL. urllib opens those directly, so nothing
 * has to guess this server's origin, and the Cloudflare Access sign-in page that once came
 * back instead of a JPEG cannot happen at all.
 */
import path from 'node:path';
import { getJob, outputPath, startRenderJob } from '@/app/lib/videoJobs';
import { STEP_ORDER } from '@/app/lib/videoSteps';
import { scenesFor } from '../scenes';
import { setRunJob } from '../progress';
import { captionStyle, effectiveFrame, voiceId } from '../kits/load';
import {
  applyOverlays,
  articlePicture,
  backgroundMedia,
  cardIsOverlay,
  layoutOf,
  layersOf,
  placeLayers,
  stickerPath,
  watermarkPng,
  chipPng,
  insetPng,
  numberPng,
  quotePng,
  draftOverlay,
  flowLayers,
  type MusicLevel,
  type SignatureTab,
  type StickerTab,
} from './overlay';
import { cardFor, renderCardTo } from './image';
import { pickSticker, stickerChoices } from './pick';
import { mediaById } from '../assets';
import type { OverlayPlan } from './overlay';
import { frameUrl, type FrameSpec } from '../frame';
import { bedFrom, scenePlate } from '../plate';
import { fillWindows, middleFills, type MiddleFill } from './middle';
import { budgetFindings, probeDuration, type BudgetKit, type DurationBand } from '../gates/budget';
import { estimateSeconds } from '../estimate';
import type { Draft } from '../gold';
import type { CardAsset } from './image';
import type { RunCtx, SourceItem, Step } from './types';

export interface ReelAsset {
  url: string;
  file: string;
  /** Absolute path on disk — what delivery sends and what the library sizes. */
  path: string;
  kind: 'mp4';
  durationSec: number;
}


/** The eyebrow: what the story is, in two short uppercase lines. */
export function eyebrowLines(title: string): string[] {
  const t = (title || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  if (!t) return [];
  // Two lines of roughly 34, broken on a space, because the reference's eyebrow is a
  // standfirst and not the headline again — a third line turns it into a wall.
  const words = t.split(' ');
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    if (out.length === 2) break;
    if ((line + ' ' + w).trim().length > 34) {
      if (line) out.push(line);
      line = w;
    } else {
      line = (line + ' ' + w).trim();
    }
  }
  if (line && out.length < 2) out.push(line);
  const lines = out.slice(0, 2);
  // Say that it was cut. Stopping mid-phrase reads as a bug; an ellipsis reads as a
  // standfirst, which is what the slot is for.
  const used = lines.join(' ').length;
  if (lines.length && used < t.length) lines[lines.length - 1] = `${lines[lines.length - 1]}…`;
  return lines;
}

/** Where it came from, as a reader would say it: the host, not the whole url. */
export function creditLine(url?: string | null): string[] {
  if (!url) return [];
  try {
    return [`NGUỒN: ${new URL(url).hostname.replace(/^www\./, '')}`];
  } catch {
    return [];
  }
}


/**
 * What the reel shows behind everything, for its whole length.
 *
 * With the story frame on this is the bed: the article's own photo, blurred and darkened
 * until type can sit on it. One continuous backdrop is what stops a reel reading as a
 * slideshow — the reference scores zero hard cuts across 31 seconds and still never feels
 * static, because only the foreground changes. A video background is left alone: it is
 * already moving, and blurring it would waste the one asset that does not need help.
 */
async function backdrop(ctx: RunCtx): Promise<{ url: string; kind: 'image' | 'video' } | null> {
  const bg = backgroundMedia(ctx.kit, articlePicture(ctx.kit, ctx.outputs.fetch as { images?: string[] }));
  const story = effectiveFrame(ctx.kit, ctx.overrides).story;
  if (!bg) {
    // No article photo. With the story frame on, the card itself becomes the bed — a flat
    // colour behind the type is the one thing worse than a blurred photo.
    if (!story) return null;
    const card = ctx.outputs.image as CardAsset | undefined;
    const bed = card ? await bedFrom(card.path) : null;
    return bed ? { url: `file://${bed}`, kind: 'image' as const } : null;
  }
  if (bg.kind !== 'image' || !story) return bg;
  const bed = await bedFrom(bg.url.replace(/^file:\/\//, ''));
  return bed ? { url: `file://${bed}`, kind: 'image' } : bg;
}


/**
 * The one middle tenant the still draws.
 *
 * A reel can hold a number, a quote and a chain, at three different seconds; a still holds
 * one. `mid` cycles through them — the Nền chữ chip advances it — and wraps, so the screen
 * never has to know how many the script turned out to supply.
 */
export function fillSpec(fills: MiddleFill[], mid: unknown): Partial<FrameSpec> {
  if (!fills.length) return {};
  const n = Number(mid);
  const f = fills[(Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0) % fills.length];
  if (f.kind === 'number') return { num: f.number?.value ?? null, numUnit: f.number?.unit ?? null };
  if (f.kind === 'quote') return { quote: f.quote?.text ?? null, quoteWho: f.quote?.who ?? null };
  return { flow: f.flow ?? null };
}

/** Which treatment the still shows. The owner picks it; the hero is where a reel starts. */
export type Moment = 'hero' | 'inset' | 'bed';
export function momentOf(ctx: RunCtx): Moment {
  const at = ctx.overrides.at;
  return at === 'inset' || at === 'bed' ? at : 'hero';
}

/**
 * The still for the Video screen.
 *
 * With the story frame on, the frame route is handed the card and the raw photo separately
 * and composes the moment itself — the card sharp, the inset, or neither — because the
 * three never share the screen and a still that showed all of them would be a picture of
 * no moment in the reel. With it off, the old composed plate is exactly what it was.
 */
export async function storyFrameUrl(
  draft: Draft,
  ctx: RunCtx,
  text: string,
  fallbackCard: string | null = null,
): Promise<string> {
  const common = { text, style: captionStyle(ctx.kit), sticker: stickerPath(ctx.kit) };
  if (!effectiveFrame(ctx.kit, ctx.overrides).story) {
    return frameUrl({ ...common, plate: await plateFor(draft, ctx) });
  }
  const card = await cardNow(draft, ctx, fallbackCard);
  const scenes = scenesFor(draft.text, (ctx.outputs.fetch as SourceItem | undefined)?.comments ?? [], ctx.selection);
  const bg = backgroundMedia(ctx.kit, articlePicture(ctx.kit, ctx.outputs.fetch as { images?: string[] }));
  const item = ctx.outputs.fetch as SourceItem | undefined;
  return frameUrl({
    ...common,
    plate: card?.path ?? null,
    // No article photo? Blur the card into the bed. A flat colour behind the type is the
    // one thing worse than a blurred photo, and the card is always there.
    background: bg && bg.kind === 'image' ? bg.url.replace(/^file:\/\//, '') : (card?.path ?? null),
    at: momentOf(ctx),
    title: draft.title,
    source: item?.url ?? null,
    ...fillSpec(middleFills(scenes.map((sc) => sc.text)), ctx.overrides.mid),
  });
}

function narrationFor(draft: Draft, ctx: RunCtx): string {
  const item = ctx.outputs.fetch as SourceItem | undefined;
  const scenes = scenesFor(draft.text, item?.comments ?? [], ctx.selection)
    .map((s) => s.text)
    .join('\n');
  // "Đọc tiêu đề trước caption": the title is on the card either way, so reading it is a
  // choice rather than the default.
  return ctx.overrides.readTitle && draft.title ? `${draft.title}\n${scenes}` : scenes;
}

/** What this scene shows behind the caption: the card if it exists, else the background. */
/**
 * The scene as the reel will show it: for the overlay layouts the card placed over the
 * background where the S12 pass puts it; for `multi` the card itself. Composed by
 * lib/studio/plate.ts, the same numbers ffmpeg gets — the fidelity gate measures that.
 */
async function plateFor(draft: Draft, ctx: RunCtx): Promise<string | null> {
  const card = await cardNow(draft, ctx);
  const bg = await backdrop(ctx);
  // A video background has no still to show; the neutral plate is the honest answer.
  const background = bg && bg.kind === 'image' ? bg.url.replace(/^file:\/\//, '') : null;
  return scenePlate({ card: card?.path ?? null, background, layout: layoutOf(ctx.kit, ctx.overrides) });
}

/** The card controls the placement surface owns. Moving one makes the stored card stale. */
const PLACED = ['y', 'width', 'logoX', 'logoY'] as const;

/**
 * The card this scene shows: the one the Ảnh step wrote, unless a placement handle has been
 * moved on this screen — then the stored PNG no longer shows what the kit now says, and
 * redrawing it is the difference between a control and a control that appears to do nothing.
 */
export async function cardNow(draft: Draft, ctx: RunCtx, fallback: string | null = null): Promise<CardAsset | null> {
  const stored =
    (ctx.outputs.image as CardAsset | undefined) ??
    (fallback ? ({ url: '', path: fallback, kind: 'png' } as CardAsset) : null);
  const moved = (ctx.overrides.card ?? {}) as Record<string, unknown>;
  if (!PLACED.some((k) => moved[k] !== undefined)) return stored;
  const file = await cardFor(draft, ctx);
  return { url: `/studio-runs/${path.basename(file)}`, path: file, kind: 'png' };
}

function budgetKit(ctx: RunCtx): BudgetKit {
  const caps = captionStyle(ctx.kit) as { maxLines?: number; size?: number; wordsPerCue?: number };
  // deploy/caption_style.py's DEFAULTS, which is what the renderer falls back to.
  return {
    durationBand: effectiveFrame(ctx.kit, ctx.overrides).durationBand as DurationBand,
    maxLines: caps.maxLines ?? 2,
    size: caps.size ?? 72,
    wordsPerCue: caps.wordsPerCue ?? 5,
  };
}

/**
 * Everything the overlay pass needs, gathered once.
 *
 * The sticker can be chosen by a classifier when the kit asks — one call over the narration
 * against the names of the owner's own uploads. It is the only thing in this pass that
 * spends, and it is skipped whenever the kit names a sticker outright.
 */
async function overlayPlan(
  draft: Draft,
  ctx: RunCtx,
  card: CardAsset | undefined,
  durationSec: number,
): Promise<OverlayPlan> {
  const st = (ctx.kit.stickers ?? {}) as StickerTab;
  const sig = (ctx.kit.signature ?? {}) as SignatureTab;
  const handle = String((ctx.kit.identity as { handle?: string } | undefined)?.handle ?? '');
  const item = ctx.outputs.fetch as SourceItem | undefined;
  const scenes = scenesFor(draft.text, item?.comments ?? [], ctx.selection);

  const sticker =
    st.pick === 'ai'
      ? (await pickSticker(scenes.map((s) => s.text).join('\n'), stickerChoices()))?.path ?? null
      : stickerPath(ctx.kit);

  const sfxId = typeof ctx.overrides.sfx === 'string' ? ctx.overrides.sfx : undefined;
  const sfx = sfxId ? (mediaById(sfxId)?.path ?? null) : null;

  // The bed is a kit choice and its volume is a per-run one, which is the split the
  // reference draws too: the channel has a sound, this post can be quieter than usual.
  const musicTab = (ctx.kit.music ?? {}) as { track?: string; tier?: MusicLevel };
  const music = musicTab.track ? (mediaById(musicTab.track)?.path ?? null) : null;
  const musicLevel = (ctx.overrides.music as MusicLevel | undefined) ?? musicTab.tier ?? 'default';

  const outroText = typeof ctx.overrides.outro === 'string' ? ctx.overrides.outro.trim() : '';
  const outro = outroText
    ? await renderCardTo(`${ctx.runId}-outro.png`, outroText, ctx).catch(() => null)
    : null;

  // The story frame. One photo, three treatments — the card sharp for the opening, an
  // inset after it, then the bed and the type. Off puts the card back on screen for the
  // whole reel, which is what every reel looked like before this.
  const story = effectiveFrame(ctx.kit, ctx.overrides).story;
  const inset = story && card?.path ? await insetPng(card.path) : null;

  // What fills the middle once the inset has gone: a figure, an attributed quote, a causal
  // chain — each on the line that says it, scheduled so no two share a second. Skipped
  // entirely when the script supplies none, which is most of the point: a card showing the
  // only number in a sentence about nothing is worse than no card.
  const chars = scenes.map((sc) => sc.text.length);
  const placed = story ? fillWindows(middleFills(scenes.map((sc) => sc.text)), chars, durationSec) : [];
  const num = placed.find((f) => f.kind === 'number');
  const number = num?.number ? await numberPng(num.number) : null;

  const middle: { file: string; from: number; until: number }[] = [];
  for (const f of placed) {
    if (f.kind === 'quote' && f.quote) {
      const file = await quotePng(f.quote);
      if (file) middle.push({ file, from: f.from, until: f.until });
    } else if (f.kind === 'flow' && f.flow) {
      // One layer per box, each arriving on its own beat, so the diagram builds rather
      // than appears. flowLayers drops a box the window cannot hold, which is why it is
      // handed the room: three crammed into the last half second is worse than two landing.
      for (const { file, delay } of await flowLayers(f.flow, f.until - f.from)) {
        middle.push({ file, from: f.from + delay, until: f.until });
      }
    }
  }
  const credit = story ? await chipPng('credit', creditLine(item?.url)) : null;
  const eyebrow = story ? await chipPng('eyebrow', eyebrowLines(draft.title)) : null;

  return {
    card: card?.path ?? null,
    story,
    inset,
    credit,
    eyebrow,
    number,
    numberFrom: num?.from,
    numberUntil: num?.until,
    middle,
    layout: layoutOf(ctx.kit, ctx.overrides),
    sticker,
    stickerWhere: st.where ?? [],
    fly: st.fly,
    dvd: sig.handle && handle ? handle : null,
    watermark: sig.watermark && handle ? await watermarkPng(handle) : null,
    outro,
    durationSec,
    sceneChars: scenes.map((s) => s.text.length),
    sfx,
    music,
    musicLevel,
    layers: await placeLayers(layersOf(ctx.kit, 'body')),
  };
}

/** Where the draft lands, beside the card the Ảnh step wrote. */
const DRAFT_DIR = path.join(process.cwd(), 'public', 'studio-runs');

/**
 * A motion draft of this run, built from exactly what the controls currently say.
 *
 * The duration is estimated rather than measured, because the audio that would settle it
 * does not exist until make-reel.py has run — and the whole point is to see the timing
 * before paying for that. CHARS_PER_SECOND came off a real render, so the windows land
 * within a second or so of where the reel will put them, which is the accuracy a timing
 * judgement needs.
 */
export async function motionDraft(draft: Draft, ctx: RunCtx): Promise<{ url: string; durationSec: number } | null> {
  const item = ctx.outputs.fetch as SourceItem | undefined;
  const scenes = scenesFor(draft.text, item?.comments ?? [], ctx.selection);
  const durationSec = Math.max(8, estimateSeconds(scenes.reduce((n, sc) => n + sc.text.length, 0)));

  const card = (await cardNow(draft, ctx)) ?? undefined;
  const plan = await overlayPlan(draft, ctx, card, durationSec);
  const bg = await backdrop(ctx);
  const bed = bg?.kind === 'image' ? bg.url.replace(/^file:\/\//, '') : null;

  const file = `${ctx.runId}-draft.mp4`;
  const ok = await draftOverlay(plan, bed, path.join(DRAFT_DIR, file));
  // Cache-busted: the draft is rebuilt in place every time a control changes, and a
  // browser that remembers the last one makes the button look broken.
  return ok ? { url: `/studio-runs/${file}?v=${Date.now()}`, durationSec } : null;
}

const POLL_MS = 1500;
const MAX_WAIT_MS = 15 * 60_000;

export const reelStep: Step<Draft, ReelAsset> = {
  name: 'reel',
  from: 'draft',

  async preview(draft, ctx) {
    if (!draft?.text) throw new Error('Chưa có lời đọc để dựng video.');
    const item = ctx.outputs.fetch as SourceItem | undefined;
    const scenes = scenesFor(draft.text, item?.comments ?? [], ctx.selection);
    const i = Math.max(0, Math.min(Number(ctx.overrides.sceneIndex ?? 0) || 0, scenes.length - 1));
    return {
      kind: 'scenes',
      data: {
        scenes,
        sceneIndex: i,
        // Not the bare card: the frame as the reel will show it, caption band and sticker
        // included, so choosing a preset is choosing something the owner can see. One
        // composed still, never an ffmpeg pass over the whole reel — a preview that costs
        // three minutes is a preview nobody waits for.
        firstFrameUrl: await storyFrameUrl(draft, ctx, scenes[i]?.text ?? draft.title),
        /** Which of the three treatments the still is showing. */
        at: momentOf(ctx),
        steps: STEP_ORDER,
      },
      // make-reel.py is the measured $0 path: local edge-tts, local whisper, local ffmpeg.
      cost: { usd: 0, note: 'make-reel.py — dựng tại máy' },
    };
  },

  async run(draft, ctx) {
    const card = await cardNow(draft, ctx);
    const frame = effectiveFrame(ctx.kit, ctx.overrides);
    // ctx.kit already carries the drawer (effectiveKit in ctxFor), so the style the frame
    // preview drew and the style the renderer is handed come from the same place.
    const style = captionStyle(ctx.kit);

    // make-reel.py reads the voice from REEL_VOICE, not a flag, and startRenderJob passes
    // no per-job env. spawn() happens synchronously inside it, so set-call-restore in one
    // tick cannot race another render. `rate` is hardcoded at +25% there and is not a knob.
    const prevVoice = process.env.REEL_VOICE;
    const wanted = voiceId(ctx.kit);
    if (wanted) process.env.REEL_VOICE = wanted;
    let jobId: string;
    try {
      jobId = startRenderJob({
        emojiTitle: draft.title,
        narration: narrationFor(draft, ctx),
          // The owner's own background leads when the kit names one; the card follows it —
          // unless the layout places the card itself, in which case handing it to the
          // renderer as well would show it twice.
        media: [
          await backdrop(ctx),
          card && !cardIsOverlay(ctx.kit, ctx.overrides)
            ? ({ url: `file://${card.path}`, kind: 'image' } as const)
            : null,
        ].filter(Boolean) as { url: string; kind: 'image' | 'video' }[],
        includeIntro: frame.includeIntro,
        includeLayout: frame.includeLayout,
        style: Object.keys(style).length ? JSON.stringify(style) : undefined,
      });
    } finally {
      if (prevVoice === undefined) delete process.env.REEL_VOICE;
      else process.env.REEL_VOICE = prevVoice;
    }
    setRunJob(ctx.runId, jobId);

    const until = Date.now() + MAX_WAIT_MS;
    for (;;) {
      const job = getJob(jobId);
      if (job?.status === 'done' && job.file) {
        const file = outputPath(job.file);
        // The duration is read BEFORE the overlay pass: the end card and the transition
        // sounds are placed against the reel's real length, and the pass does not change it.
        const durationSec = await probeDuration(file).catch(() => NaN);
        // One ffmpeg pass beside the engine, never inside it.
        await applyOverlays(file, await overlayPlan(draft, ctx, card ?? undefined, durationSec));
        return {
          url: `/api/video/file?f=${job.file}`,
          file: job.file,
          path: file,
          kind: 'mp4' as const,
          durationSec,
        };
      }
      if (job?.status === 'error') throw new Error(job.error ?? 'Dựng video thất bại.');
      if (Date.now() > until) throw new Error('Dựng video quá 15 phút — bỏ chờ.');
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  },

  async gate(reel, ctx) {
    const draft = ctx.outputs.draft as Draft | undefined;
    const narration = draft ? narrationFor(draft, ctx) : '';
    return {
      checked: 2,
      findings: Number.isNaN(reel.durationSec)
        ? ['Không đọc được độ dài video — ffprobe thất bại.']
        : budgetFindings(reel.durationSec, narration, budgetKit(ctx)),
    };
  },
};
