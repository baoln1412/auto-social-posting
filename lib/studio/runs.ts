/**
 * The run state machine: create → preview → run → gate → continue, resumable from whichever
 * step failed.
 *
 * `advance()` is the only verb. It executes the run's current step — which is also what a
 * resume is, and what "Re-run this step" is with `step` passed. One path, so a retry cannot
 * behave differently from a first attempt.
 *
 * A step row is written on success AND on failure. A step that vanished without a row is the
 * failure mode this table exists to prevent.
 */
import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { studioDb } from './db';
import { resolveStep } from './steps/registry';
import {
  canContinue,
  effectiveKit,
  makesOf,
  shouldAutoContinue,
  templateFor,
  type Channel,
  type GateResult,
  type Kit,
  type Money,
  type Overrides,
  type RunCtx,
  type Selection,
  type StepName,
  type StepOptions,
} from './steps/types';
import { hashOf } from './hash';
import { tierOf } from './tier-of';
import { deliverFailure, deliverReel } from './deliver';
import { getSetting, setSetting } from './settings';
import { loadPipeline } from './pipeline/config';
import { enqueue, rowsFor, tick } from './publish/queue';
import { sendRow } from './publish/send';
import type { Where } from './steps/publish';

export type RunStatus = 'new' | 'running' | 'blocked' | 'done' | 'error';

export interface StepRecord {
  name: StepName;
  status: 'ok' | 'error';
  /** The step's output, JSON. `output_ref` is TEXT and this is what it holds. */
  output: unknown;
  cost: Money;
  gate: GateResult | null;
  error: string | null;
  /** The options hash this result came from; compared with the live one to spot staleness. */
  previewHash: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface RunRecord {
  run: {
    id: string;
    channel_id: string;
    item_ref: string | null;
    status: RunStatus;
    current_step: StepName;
    overrides: Overrides;
    selection: Selection;
    /** Per-step controls as last previewed, so a screen returns with its knobs in place. */
    options: Partial<Record<StepName, StepOptions>>;
    created_at: string;
    updated_at: string;
  };
  steps: Partial<Record<StepName, StepRecord>>;
  template: StepName[];
  channel: Channel;
  kit: Kit;
}

const EMPTY_SELECTION: Selection = { commentIds: [], hideUnselected: false };

function parse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function createRun(opts: {
  channelId: string;
  itemRef?: string;
  overrides?: Overrides;
  selection?: Selection;
}): string {
  const chan = studioDb()
    .prepare('SELECT makes_json FROM studio_channels WHERE id=?')
    .get(opts.channelId) as { makes_json: string } | undefined;
  const template = templateFor(makesOf(chan?.makes_json));
  const id = randomUUID();
  studioDb()
    .prepare(
      `INSERT INTO studio_runs (id, channel_id, item_ref, status, current_step,
                                overrides_json, selection_json)
       VALUES (?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      opts.channelId,
      opts.itemRef ?? null,
      'new',
      template[0],
      JSON.stringify(opts.overrides ?? {}),
      JSON.stringify(opts.selection ?? EMPTY_SELECTION),
    );
  return id;
}

export function getRun(id: string): RunRecord | null {
  const d = studioDb();
  const row = d.prepare('SELECT * FROM studio_runs WHERE id=?').get(id) as any;
  if (!row) return null;

  const channel = d.prepare('SELECT * FROM studio_channels WHERE id=?').get(row.channel_id) as
    | Channel
    | undefined;
  if (!channel) throw new Error(`Kênh "${row.channel_id}" không còn tồn tại.`);

  const overrides = parse<Overrides>(row.overrides_json, {});
  const kitRow = d
    .prepare('SELECT id, name, json FROM studio_kits WHERE id=?')
    .get(overrides.kitId ?? channel.kit_id) as
    | { id: string; name: string; json: string }
    | undefined;
  const kit: Kit = kitRow
    ? { ...parse<Record<string, unknown>>(kitRow.json, {}), id: kitRow.id, name: kitRow.name }
    : { id: 'none', name: 'Không có bộ nhận diện' };

  const steps: Partial<Record<StepName, StepRecord>> = {};
  for (const s of d
    .prepare('SELECT * FROM studio_steps WHERE run_id=? ORDER BY rowid')
    .all(id) as any[]) {
    steps[s.name as StepName] = {
      name: s.name,
      status: s.status,
      output: parse<unknown>(s.output_ref, null),
      cost: { usd: s.cost_usd ?? 0, note: parse<{ note?: string }>(s.input_ref, {}).note ?? '' },
      gate: parse<GateResult | null>(s.gate_json, null),
      error: s.error ?? null,
      previewHash: s.preview_hash ?? null,
      started_at: s.started_at,
      finished_at: s.finished_at,
    };
  }

  return {
    run: {
      id: row.id,
      channel_id: row.channel_id,
      item_ref: row.item_ref,
      status: row.status,
      current_step: row.current_step,
      overrides,
      selection: parse<Selection>(row.selection_json, EMPTY_SELECTION),
      options: parse<Partial<Record<StepName, StepOptions>>>(row.options_json, {}),
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    steps,
    template: templateFor(makesOf((channel as any).makes_json)),
    channel,
    kit,
  };
}

/**
 * Build the ctx a step sees. `outputs` carries what earlier steps produced this run, and
 * `opts` is whatever the screen is holding unsaved — merged for this call only.
 */
function ctxFor(rec: RunRecord, opts: StepOptions = {}): RunCtx {
  const outputs: Partial<Record<StepName, unknown>> = {};
  for (const [name, s] of Object.entries(rec.steps)) {
    if (s && s.status === 'ok') outputs[name as StepName] = s.output;
  }
  const overrides = { ...rec.run.overrides, ...opts };
  return {
    runId: rec.run.id,
    channel: rec.channel,
    // The drawer reaches every step through the kit it hands them, rather than each step
    // remembering to merge it. effectiveKit() was written in slice 2 and had no caller, so
    // a caption chosen in the drawer never reached the renderer at all.
    kit: effectiveKit(rec.kit, overrides),
    tier: tierOf(rec.channel),
    overrides,
    selection: rec.run.selection,
    outputs,
  };
}

/** The options a step runs with: what was stored for it, plus anything passed in now. */
export function optionsFor(rec: RunRecord, name: StepName, opts?: StepOptions): StepOptions {
  return { ...(rec.run.options[name] ?? {}), ...(opts ?? {}) };
}

/** What the screen last previewed this step with, written by the preview route. */
export function saveOptions(runId: string, name: StepName, opts: StepOptions): void {
  const d = studioDb();
  const row = d.prepare('SELECT options_json FROM studio_runs WHERE id=?').get(runId) as
    | { options_json: string }
    | undefined;
  const all = parse<Record<string, StepOptions>>(row?.options_json, {});
  all[name] = opts;
  d.prepare('UPDATE studio_runs SET options_json=? WHERE id=?').run(JSON.stringify(all), runId);
}

/** A step's input is the output of the step it declares; the first step gets the item_ref. */
function inputFor(rec: RunRecord, name: StepName, step?: { from?: StepName }): unknown {
  const from = step?.from;
  if (!from) return rec.run.item_ref;
  return rec.steps[from]?.output ?? rec.run.item_ref;
}

/**
 * Execute the run's current step. Pass `step` to rewind and re-run an earlier one; pass
 * `selection` / `overrides` to save the drawer and the scene picks in the same call that
 * continues, so neither needs a route of its own.
 */
export async function advance(
  id: string,
  opts: {
    step?: StepName;
    selection?: Selection;
    overrides?: Overrides;
    /** The owner's edit of the draft text, applied to the stored draft before the next step. */
    editDraft?: string;
    /** The controls the screen is showing, saved before the step runs on them. */
    options?: StepOptions;
    /** False for a tier that may not spend: a step whose preview costs money refuses to run. */
    allowSpend?: boolean;
  } = {},
): Promise<RunRecord> {
  const d = studioDb();
  let rec = getRun(id);
  if (!rec) throw new Error(`Không tìm thấy lượt chạy ${id}`);

  if (opts.selection) {
    d.prepare('UPDATE studio_runs SET selection_json=? WHERE id=?').run(
      JSON.stringify(opts.selection),
      id,
    );
  }
  if (opts.overrides) {
    d.prepare('UPDATE studio_runs SET overrides_json=? WHERE id=?').run(
      JSON.stringify(opts.overrides),
      id,
    );
  }
  if (opts.step) {
    if (!rec.template.includes(opts.step)) throw new Error(`"${opts.step}" không có trong chế độ này.`);
    d.prepare('UPDATE studio_runs SET current_step=? WHERE id=?').run(opts.step, id);
  }
  if (opts.options) saveOptions(id, opts.step ?? rec.run.current_step, opts.options);
  if (opts.editDraft !== undefined && rec.steps.draft) {
    const edited = { ...(rec.steps.draft.output as object), text: opts.editDraft };
    d.prepare('UPDATE studio_steps SET output_ref=? WHERE id=?').run(
      JSON.stringify(edited),
      `${id}:draft`,
    );
  }
  if (opts.selection || opts.overrides || opts.step || opts.options || opts.editDraft !== undefined) {
    rec = getRun(id)!;
  }

  const name = rec.run.current_step;
  const step = resolveStep(name, rec.channel);
  // The same options the screen previewed with, so the price quoted and the price booked
  // come from one call to one function.
  const stepOpts = optionsFor(rec, name);
  const previewHash = hashOf(stepOpts, rec.run.overrides, rec.run.selection);
  const ctx = ctxFor(rec, stepOpts);
  const input = inputFor(rec, name, step);

  const startedAt = new Date().toISOString();
  let cost: Money = { usd: 0, note: '' };
  try {
    // preview() is the contract's cheap half — it is also where the recorded price comes
    // from, so what the owner was shown and what the run booked cannot drift apart.
    cost = (await step.preview(input, ctx)).cost;
  } catch {
    /* a preview that cannot be built must not stop the step from recording its own failure */
  }

  let output: unknown = null;
  let gate: GateResult | null = null;
  let error: string | null = null;
  try {
    // The money guard, before run() and not in the route: a queue and a test reach this same
    // path, and a boundary check that only one caller performs is not a boundary.
    if (cost.usd > 0 && opts.allowSpend === false) {
      throw new Error(
        `Bước "${name}" tốn $${cost.usd.toFixed(2)} và tài khoản này không được phép chi.`,
      );
    }
    output = await step.run(input, ctx);
    if (step.gate) gate = await step.gate(output, ctx);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  // One row per run+step, replaced on a re-run — that is what makes run() idempotent per
  // run+step rather than accumulating a row per attempt.
  d.prepare(
    `INSERT OR REPLACE INTO studio_steps
       (id, run_id, name, status, input_ref, output_ref, cost_usd, gate_json, error,
        preview_hash, started_at, finished_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    `${id}:${name}`,
    id,
    name,
    error ? 'error' : 'ok',
    JSON.stringify({ note: cost.note }),
    JSON.stringify(output ?? null),
    cost.usd,
    gate ? JSON.stringify(gate) : null,
    error,
    previewHash,
    startedAt,
    new Date().toISOString(),
  );

  // One place records artefacts, so no step has to remember to. Keyed run+step, so a
  // re-run replaces its asset instead of stacking a second row next to a deleted file.
  const asset = output as { kind?: string; url?: string; path?: string } | null;
  if (!error && asset && typeof asset === 'object' && asset.kind && asset.url) {
    let bytes: number | null = null;
    try {
      if (asset.path) bytes = statSync(asset.path).size;
    } catch {
      /* the file may be served from elsewhere; size is a nicety, not a reason to fail */
    }
    d.prepare(
      `INSERT OR REPLACE INTO studio_assets (id, run_id, kind, path, meta_json)
       VALUES (?,?,?,?,?)`,
    ).run(`${id}:${name}`, id, asset.kind, asset.path ?? null, JSON.stringify({ url: asset.url }));
    if (bytes !== null) {
      d.prepare('UPDATE studio_assets SET bytes=? WHERE id=?').run(bytes, `${id}:${name}`);
    }
  }

  let status: RunStatus;
  let current: StepName = name;
  if (error) {
    status = 'error';
  } else if (!canContinue({ status: 'ok', gate }, Boolean(step.gate))) {
    status = 'blocked';
  } else {
    const next = rec.template[rec.template.indexOf(name) + 1];
    if (next) {
      status = 'running';
      current = next;
    } else {
      status = 'done';
    }
  }

  d.prepare(
    `UPDATE studio_runs SET status=?, current_step=?,
       updated_at=(strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id=?`,
  ).run(status, current, id);

  const out = getRun(id)!;
  await notify(out, name, status, error);
  if (!error && name === 'reel') await autoPublish(out);

  // `Duyệt trước khi dựng` off: walk the rail without asking, and stop at the first step
  // that would cost something. auto_continue has been a column since slice 0 with nothing
  // reading it, so every channel stopped at every step however it was configured.
  if (status === 'running') {
    const nextCost = (await previewStep(out, out.run.current_step)).cost;
    if (shouldAutoContinue(out.channel, nextCost, out.run.overrides)) {
      return advance(id, { allowSpend: opts.allowSpend });
    }
  }
  return out;
}

/**
 * `Tự đăng khi render xong`, if the market's dây chuyền has it on.
 *
 * It queues; it does not send by itself. The row goes in with `at = now`, the same loop that
 * handles a scheduled post picks it up, and a failure lands on the row rather than on the run
 * — the video is rendered and in the library either way.
 */
async function autoPublish(rec: RunRecord): Promise<void> {
  try {
    const marketId = rec.channel.market_id;
    if (!marketId) return;
    const { config } = loadPipeline(marketId);
    if (!config.publish.auto) return;
    const already = new Set(rowsFor(rec.run.id).map((r) => r.where));
    const now = new Date().toISOString();
    for (const w of config.publish.to as Where[]) {
      if (!already.has(w)) enqueue({ runId: rec.run.id, where: w, at: now });
    }
    await tick(sendRow);
  } catch (e) {
    console.error('[studio] tự đăng lỗi:', e);
  }
}

/**
 * Telegram, if the owner switched it on. Awaited rather than fired and forgotten so a
 * failure lands in the log next to the step that caused it — and fully guarded, because a
 * notification is never a reason for a run to fail.
 *
 * The delivered marker is per run, so re-running a finished run's card does not re-send the
 * video the owner already has.
 */
async function notify(
  rec: RunRecord,
  name: StepName,
  status: RunStatus,
  error: string | null,
): Promise<void> {
  const id = rec.run.id;
  if (error) {
    await deliverFailure(name, error, id);
    return;
  }
  if (status !== 'done') return;

  const mp4 = rec.steps.reel?.output as { path?: string } | null;
  if (!mp4?.path) return;
  if (getSetting(`delivered.${id}`, null)) return;

  const title = (rec.steps.draft?.output as { title?: string } | null)?.title ?? 'Video mới';
  setSetting(`delivered.${id}`, '1');
  await deliverReel(mp4.path, title, id);
}

/**
 * A step's preview — what the owner sees before anything is spent, with whatever the screen
 * is currently holding. Never writes: the options are merged for this call only.
 */
export async function previewStep(rec: RunRecord, name: StepName, opts?: StepOptions) {
  const merged = optionsFor(rec, name, opts);
  const hash = hashOf(merged, rec.run.overrides, rec.run.selection);
  try {
    const step = resolveStep(name, rec.channel);
    const out = await step.preview(inputFor(rec, name, step), ctxFor(rec, merged));
    return { ...out, hash };
  } catch (e) {
    return {
      kind: 'text' as const,
      data: { text: e instanceof Error ? e.message : String(e), error: true },
      cost: { usd: 0, note: '' },
      hash,
    };
  }
}

/** True when a finished step's result no longer matches the options now on screen. */
export function isStale(rec: RunRecord, name: StepName): boolean {
  const s = rec.steps[name];
  if (!s?.previewHash) return false;
  return s.previewHash !== hashOf(optionsFor(rec, name), rec.run.overrides, rec.run.selection);
}

/** Does this step declare a gate? The run page needs it to apply the checked===0 rule. */
export function declaresGate(rec: RunRecord, name: StepName): boolean {
  try {
    return Boolean(resolveStep(name, rec.channel).gate);
  } catch {
    return false;
  }
}
