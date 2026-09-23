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
import { getJob, outputPath, startRenderJob } from '@/app/lib/videoJobs';
import { STEP_ORDER } from '@/app/lib/videoSteps';
import { scenesFor } from '../scenes';
import { setRunJob } from '../progress';
import { captionStyle, effectiveFrame, voiceId } from '../kits/load';
import {
  applyOverlays,
  backgroundMedia,
  cardIsOverlay,
  layoutOf,
  layersOf,
  placeLayers,
  stickerPath,
  watermarkPng,
  type SignatureTab,
  type StickerTab,
} from './overlay';
import { renderCardTo } from './image';
import { pickSticker, stickerChoices } from './pick';
import { mediaById } from '../assets';
import type { OverlayPlan } from './overlay';
import { frameUrl } from '../frame';
import { budgetFindings, probeDuration, type BudgetKit, type DurationBand } from '../gates/budget';
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
function plateFor(ctx: RunCtx): string | null {
  const card = ctx.outputs.image as CardAsset | undefined;
  if (card?.path) return card.path;
  const bg = backgroundMedia(ctx.kit);
  // A video background has no still to show; the neutral plate is the honest answer.
  return bg && bg.kind === 'image' ? bg.url.replace(/^file:\/\//, '') : null;
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

  const outroText = typeof ctx.overrides.outro === 'string' ? ctx.overrides.outro.trim() : '';
  const outro = outroText
    ? await renderCardTo(`${ctx.runId}-outro.png`, outroText, ctx).catch(() => null)
    : null;

  return {
    card: card?.path ?? null,
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
    layers: await placeLayers(layersOf(ctx.kit, 'body')),
  };
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
        firstFrameUrl: frameUrl({
          text: scenes[i]?.text ?? draft.title,
          style: captionStyle(ctx.kit),
          plate: plateFor(ctx),
          sticker: stickerPath(ctx.kit),
        }),
        steps: STEP_ORDER,
      },
      // make-reel.py is the measured $0 path: local edge-tts, local whisper, local ffmpeg.
      cost: { usd: 0, note: 'make-reel.py — dựng tại máy' },
    };
  },

  async run(draft, ctx) {
    const card = ctx.outputs.image as CardAsset | undefined;
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
          backgroundMedia(ctx.kit),
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
        await applyOverlays(file, await overlayPlan(draft, ctx, card, durationSec));
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
