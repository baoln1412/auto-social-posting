/**
 * The step contract. One shape for every engine Studio drives, so the run page can show a
 * preview and a price for something it knows nothing about.
 *
 * The rule that earns the contract: `preview()` is cheap and never spends, `run()` may.
 * Nothing is paid for that the owner has not seen first.
 */
import type { Tier } from '../tier';

export type StepName = 'fetch' | 'draft' | 'image' | 'reel' | 'publish';

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
  /** Which treatment of the story frame the still preview is showing. */
  at?: 'hero' | 'inset' | 'bed';
  /**
   * Which of the bed's middle objects the still is showing, counted round. The script
   * decides how many there are, so the screen cycles rather than offering a list it would
   * have to be told the length of.
   */
  mid?: number;
  /** How loud the bed sits under the voice, for this run only. */
  music?: 'none' | 'soft' | 'default' | 'loud';
  /** Read the post's title as the first line of narration. */
  readTitle?: boolean;
  /** A call-to-action end card, faded over the last seconds. Empty means none. */
  outro?: string;
  /** A media id from Kho tài nguyên, played at each scene change. */
  sfx?: string;
  /** Where the finished run goes. The library is always one of them. A `facebook:<channelId>`
   *  names a row in page_channels — the table FacebookConnect writes, not a page id. */
  publishTo?: ('library' | 'telegram' | `facebook:${string}`)[];
  /** ISO, local-input shape. A row in studio_publish; the server's loop acts on it. */
  publishAt?: string;
  /** Which control set publishAt — 'slot' means it came from the cadence, 'at' from the field. */
  publishWhen?: 'at' | 'slot';
  /** Posted under the post once it is up. Defaults to `Nguồn: <link>`. */
  firstComment?: string;
  style?: string;
  /** Demo channels only: force a step to fail, or a gate to find something. Nothing else reads it. */
  demo?: { boom?: StepName; gateFail?: boolean; cost?: number };
  [tab: string]: unknown;
}

/**
 * The controls a step is being previewed with — the kit, the run's drawer, and whatever the
 * screen is holding unsaved.
 *
 * Overrides-shaped on purpose, and merged over the run's own overrides for the length of one
 * preview call, never written back. That is what lets `advance` book its price from the same
 * `preview()` the screen just drew: one function, one set of options, so the number shown and
 * the number charged cannot drift apart. A separate third argument would have been a second
 * channel for the same thing.
 */
export type StepOptions = Partial<Overrides>;

export interface Selection {
  /** Comment ids promoted to scenes, in scene order. */
  commentIds: string[];
  hideUnselected: boolean;
  /**
   * Per-comment rewrites, keyed by comment id. Post scenes are not here: they come from the
   * draft, so editing one means editing the draft, and an index key would move the moment
   * the draft changed.
   */
  edits?: Record<string, string>;
}

/** A source item and the comment pool that came with it. Every source returns this. */
export interface SourceItem {
  id: string;
  title: string;
  text: string;
  url?: string;
  source?: string;
  /** The article's own pictures, newest source first. The Ảnh step picks among them. */
  images?: string[];
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

/**
 * The rail, in order. One sequence, not four: v1's four "modes" were a misreading of the
 * reference's `Đọc bài · Viết lời đọc · Lồng tiếng · Video dọc` chips, which are that
 * product's step rail — what will happen to the link — and not four kinds of video.
 *
 * `publish` is the last screen and always on the rail: a run is not finished when the file
 * exists, it is finished when the owner has said where it goes.
 */
export const ALL_STEPS: StepName[] = ['fetch', 'draft', 'image', 'reel', 'publish'];

/**
 * The steps this run actually needs: the rail, narrowed by what the channel is for.
 *
 * `makes` was collected by the wizard and stored since slice 2 with nothing reading it, so
 * every channel ran the full sequence — a post-only channel still rendered a video nobody
 * asked for.
 *
 * fetch and draft always survive: there is no run without text. A Facebook post here is the
 * text AND its card, so `post` keeps the image step.
 */
export function templateFor(makes: readonly string[]): StepName[] {
  const wanted = new Set(makes);
  const known = ['post', 'image', 'reel'].some((k) => wanted.has(k));
  if (!known) return [...ALL_STEPS];

  return ALL_STEPS.filter((step) => {
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

export const STEP_LABELS: Record<StepName, string> = {
  fetch: 'Đọc bài',
  draft: 'Viết bài',
  image: 'Ảnh',
  reel: 'Video',
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

/**
 * May the run walk past this step on its own?
 *
 * Spending always stops, whatever anything else says — that is the promise the whole preview
 * contract rests on. Otherwise the per-run drawer's `Duyệt trước khi dựng` wins where it was
 * set, and the channel's standing `auto_continue` decides where it was not.
 */
export function shouldAutoContinue(channel: Channel, cost: Money, ov: Overrides = {}): boolean {
  if (cost.usd !== 0) return false;
  if (ov.reviewBeforeRender === false) return true;
  if (ov.reviewBeforeRender === true) return false;
  return channel.auto_continue === 1;
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

/** A run's status, as the header and the run page say it. Pure: a server page imports it. */
export const RUN_STATUS_LABELS: Record<string, string> = {
  new: 'mới',
  running: 'đang chạy',
  blocked: 'bị chặn',
  done: 'xong',
  error: 'lỗi',
};
