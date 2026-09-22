/**
 * The step contract. One shape for every engine Studio drives, so the run page can show a
 * preview and a price for something it knows nothing about.
 *
 * The rule that earns the contract: `preview()` is cheap and never spends, `run()` may.
 * Nothing is paid for that the owner has not seen first.
 */
import type { Tier } from '../tier';

export type StepName = 'fetch' | 'draft' | 'image' | 'reel' | 'publish';
export type Mode = 'read-post' | 'write-narration' | 'voice-over-media' | 'text-to-reel';

/** 0 is a valid, honest estimate — it is not "unknown". */
export type Money = { usd: number; note: string };

export interface StepPreview {
  kind: 'items' | 'text' | 'png' | 'scenes';
  data: unknown;
  cost: Money;
}

export interface GateResult {
  /** How many rules actually ran. 0 means the gate did not run — never a pass. */
  checked: number;
  findings: string[];
}

export interface Step<I = any, O = any> {
  name: StepName;
  /**
   * Which finished step's output this one consumes. Omitted for the first step, which gets
   * the run's item_ref.
   *
   * Not "the previous step in the template": `image` and `reel` both consume the draft, and
   * chaining positionally handed `reel` the card — so `draft.text` was undefined and the
   * scene list silently fell back to the raw source.
   */
  from?: StepName;
  preview(input: I, ctx: RunCtx): Promise<StepPreview>;
  gate?(output: O, ctx: RunCtx): Promise<GateResult>;
  run(input: I, ctx: RunCtx): Promise<O>;
}

export interface RunCtx {
  runId: string;
  channel: Channel;
  kit: Kit;
  tier: Tier;
  overrides: Overrides;
  selection: Selection;
  /** Output of each step already finished this run, keyed by step name. */
  outputs: Partial<Record<StepName, unknown>>;
}

export interface Channel {
  id: string;
  name: string;
  market_id: string | null;
  kit_id: string | null;
  sources_json: string;
  auto_continue: number;
  tier_min: Tier;
}

export interface Kit {
  id: string;
  name: string;
  [tab: string]: unknown;
}

/**
 * The per-run drawer. Merged over the kit at run time and never written back — the kit is
 * the channel's standing look, this is one video's exception to it.
 */
export interface Overrides {
  kitId?: string;
  durationBand?: 'short' | 'medium' | 'long';
  commentMode?: 'auto' | 'manual';
  reviewBeforeRender?: boolean;
  includeIntro?: boolean;
  includeLayout?: boolean;
  music?: 'none' | 'soft' | 'groove';
  style?: string;
  /** Demo channels only: force a step to fail, or a gate to find something. Nothing else reads it. */
  demo?: { boom?: StepName; gateFail?: boolean; cost?: number };
  [tab: string]: unknown;
}

export interface Selection {
  /** Comment ids promoted to scenes, in scene order. */
  commentIds: string[];
  hideUnselected: boolean;
}

/** A source item and the comment pool that came with it. Every source returns this. */
export interface SourceItem {
  id: string;
  title: string;
  text: string;
  url?: string;
  source?: string;
  comments: Comment[];
}

export interface Comment {
  id: string;
  text: string;
  /** Likes / upvotes. null where the source has no score (gold rows). */
  score: number | null;
  /** 0 = top level, 1 = a reply to one. */
  depth: number;
}

/** Which steps a mode runs, in order. `publish` records intent only and is not wired yet. */
export const TEMPLATES: Record<Mode, StepName[]> = {
  'read-post': ['fetch', 'draft', 'image', 'reel'],
  'write-narration': ['fetch', 'draft', 'image', 'reel'],
  // Narration over the owner's own media — there is no card to make.
  'voice-over-media': ['fetch', 'draft', 'reel'],
  // The owner's own text: nothing to fetch.
  'text-to-reel': ['draft', 'reel'],
};

/**
 * The steps this run actually needs: the mode's sequence, narrowed by what the channel is
 * for.
 *
 * `makes` was collected by the wizard and stored since slice 2 with nothing reading it, so
 * every channel ran the full sequence — a post-only channel still rendered a video nobody
 * asked for. §6's "post-only run (stops after image)" is this.
 *
 * fetch and draft always survive: there is no run without text. A Facebook post here is the
 * text AND its card, so `post` keeps the image step.
 */
export function templateFor(mode: Mode, makes: readonly string[]): StepName[] {
  const wanted = new Set(makes);
  const known = ['post', 'image', 'reel'].some((k) => wanted.has(k));
  if (!known) return [...TEMPLATES[mode]];

  return TEMPLATES[mode].filter((step) => {
    if (step === 'image') return wanted.has('image') || wanted.has('post');
    if (step === 'reel') return wanted.has('reel');
    return true;
  });
}

export function makesOf(sourceJson: string | null | undefined): string[] {
  try {
    const v = JSON.parse(sourceJson || '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export const MODE_LABELS: Record<Mode, string> = {
  'read-post': 'Đọc bài',
  'write-narration': 'Viết lời đọc',
  'voice-over-media': 'Lồng tiếng',
  'text-to-reel': 'Video dọc',
};

export const STEP_LABELS: Record<StepName, string> = {
  fetch: 'Lấy nguồn',
  draft: 'Viết bài',
  image: 'Ảnh thẻ',
  reel: 'Dựng video',
  publish: 'Đăng',
};

/**
 * May the owner move past this step?
 *
 * A gate that never ran is not a pass — `checked === 0` blocks just as findings do. That is
 * the whole reason `checked` exists: a compliance gate that silently no-ops would otherwise
 * read as green.
 */
export function canContinue(
  step: { status: 'ok' | 'error'; gate: GateResult | null },
  declaresGate: boolean,
): boolean {
  if (step.status !== 'ok') return false;
  if (!declaresGate) return true;
  if (!step.gate || step.gate.checked === 0) return false;
  return step.gate.findings.length === 0;
}

/** auto_continue skips the button only where the preview costs nothing. Spending always stops. */
export function shouldAutoContinue(channel: Channel, cost: Money): boolean {
  return channel.auto_continue === 1 && cost.usd === 0;
}

/** Kit + this run's drawer, one tab deep. Returns a copy; the kit argument is not touched. */
export function effectiveKit(kit: Kit, overrides: Overrides): Kit {
  const out: Kit = { ...kit };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined || k === 'demo' || k === 'kitId') continue;
    const base = out[k];
    out[k] =
      base && typeof base === 'object' && !Array.isArray(base) && typeof v === 'object' && v !== null && !Array.isArray(v)
        ? { ...(base as object), ...(v as object) }
        : v;
  }
  return out;
}
