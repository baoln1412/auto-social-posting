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
  TEMPLATES,
  canContinue,
  type Channel,
  type GateResult,
  type Kit,
  type Mode,
  type Money,
  type Overrides,
  type RunCtx,
  type Selection,
  type StepName,
} from './steps/types';
import { tierOf } from './tier-of';

export type RunStatus = 'new' | 'running' | 'blocked' | 'done' | 'error';

export interface StepRecord {
  name: StepName;
  status: 'ok' | 'error';
  /** The step's output, JSON. `output_ref` is TEXT and this is what it holds. */
  output: unknown;
  cost: Money;
  gate: GateResult | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface RunRecord {
  run: {
    id: string;
    channel_id: string;
    item_ref: string | null;
    mode: Mode;
    status: RunStatus;
    current_step: StepName;
    overrides: Overrides;
    selection: Selection;
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
  mode: Mode;
  itemRef?: string;
  overrides?: Overrides;
  selection?: Selection;
}): string {
  const template = TEMPLATES[opts.mode];
  if (!template) throw new Error(`Chế độ không hợp lệ: ${opts.mode}`);
  const id = randomUUID();
  studioDb()
    .prepare(
      `INSERT INTO studio_runs (id, channel_id, item_ref, mode, status, current_step,
                                overrides_json, selection_json)
       VALUES (?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      opts.channelId,
      opts.itemRef ?? null,
      opts.mode,
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
      started_at: s.started_at,
      finished_at: s.finished_at,
    };
  }

  return {
    run: {
      id: row.id,
      channel_id: row.channel_id,
      item_ref: row.item_ref,
      mode: row.mode,
      status: row.status,
      current_step: row.current_step,
      overrides,
      selection: parse<Selection>(row.selection_json, EMPTY_SELECTION),
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    steps,
    template: TEMPLATES[row.mode as Mode] ?? [],
    channel,
    kit,
  };
}

/** Build the ctx a step sees. `outputs` carries what earlier steps produced this run. */
function ctxFor(rec: RunRecord): RunCtx {
  const outputs: Partial<Record<StepName, unknown>> = {};
  for (const [name, s] of Object.entries(rec.steps)) {
    if (s && s.status === 'ok') outputs[name as StepName] = s.output;
  }
  return {
    runId: rec.run.id,
    channel: rec.channel,
    kit: rec.kit,
    tier: tierOf(rec.channel),
    overrides: rec.run.overrides,
    selection: rec.run.selection,
    outputs,
  };
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
  if (opts.editDraft !== undefined && rec.steps.draft) {
    const edited = { ...(rec.steps.draft.output as object), text: opts.editDraft };
    d.prepare('UPDATE studio_steps SET output_ref=? WHERE id=?').run(
      JSON.stringify(edited),
      `${id}:draft`,
    );
  }
  if (opts.selection || opts.overrides || opts.step || opts.editDraft !== undefined) {
    rec = getRun(id)!;
  }

  const name = rec.run.current_step;
  const step = resolveStep(name, rec.channel);
  const ctx = ctxFor(rec);
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
       (id, run_id, name, status, input_ref, output_ref, cost_usd, gate_json, error, started_at, finished_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
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

  return getRun(id)!;
}

/** The current step's preview — what the owner sees before anything is spent. */
export async function previewStep(rec: RunRecord, name: StepName) {
  try {
    const step = resolveStep(name, rec.channel);
    return await step.preview(inputFor(rec, name, step), ctxFor(rec));
  } catch (e) {
    return {
      kind: 'text' as const,
      data: { text: e instanceof Error ? e.message : String(e), error: true },
      cost: { usd: 0, note: '' },
    };
  }
}

/** Does this step declare a gate? The run page needs it to apply the checked===0 rule. */
export function declaresGate(rec: RunRecord, name: StepName): boolean {
  try {
    return Boolean(resolveStep(name, rec.channel).gate);
  } catch {
    return false;
  }
}
