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
import { budgetFindings, probeDuration, type BudgetKit, type DurationBand } from '../gates/budget';
import type { Draft } from '../gold';
import type { CardAsset } from './image';
import type { RunCtx, SourceItem, Step } from './types';

export interface ReelAsset {
  url: string;
  file: string;
  kind: 'mp4';
  durationSec: number;
}

function narrationFor(draft: Draft, ctx: RunCtx): string {
  const item = ctx.outputs.fetch as SourceItem | undefined;
  return scenesFor(draft.text, item?.comments ?? [], ctx.selection)
    .map((s) => s.text)
    .join('\n');
}

function budgetKit(ctx: RunCtx): BudgetKit {
  const caps = (ctx.kit.captions ?? {}) as { maxLines?: number; size?: number; wordsPerCue?: number };
  const band = (ctx.overrides.durationBand ?? (ctx.kit.reel as any)?.durationBand ?? 'medium') as DurationBand;
  // deploy/caption_style.py's DEFAULTS, which is what the renderer falls back to.
  return {
    durationBand: band,
    maxLines: caps.maxLines ?? 2,
    size: caps.size ?? 72,
    wordsPerCue: caps.wordsPerCue ?? 5,
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
    const card = ctx.outputs.image as CardAsset | undefined;
    return {
      kind: 'scenes',
      data: {
        scenes: scenesFor(draft.text, item?.comments ?? [], ctx.selection),
        firstFrameUrl: card?.url ?? null,
        steps: STEP_ORDER,
      },
      // make-reel.py is the measured $0 path: local edge-tts, local whisper, local ffmpeg.
      cost: { usd: 0, note: 'make-reel.py — dựng tại máy' },
    };
  },

  async run(draft, ctx) {
    const card = ctx.outputs.image as CardAsset | undefined;
    const jobId = startRenderJob({
      emojiTitle: draft.title,
      narration: narrationFor(draft, ctx),
      media: card ? [{ url: `file://${card.path}`, kind: 'image' }] : [],
      includeIntro: ctx.overrides.includeIntro !== false,
      includeLayout: ctx.overrides.includeLayout !== false,
      style: ctx.overrides.style,
    });
    setRunJob(ctx.runId, jobId);

    const until = Date.now() + MAX_WAIT_MS;
    for (;;) {
      const job = getJob(jobId);
      if (job?.status === 'done' && job.file) {
        return {
          url: `/api/video/file?f=${job.file}`,
          file: job.file,
          kind: 'mp4' as const,
          durationSec: await probeDuration(outputPath(job.file)).catch(() => NaN),
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
