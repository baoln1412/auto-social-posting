'use client';

/**
 * The editorial run page, laid out as the HTML plan draws it.
 *
 * Dense on purpose: a numbered gutter, one-line step headers carrying their own state and
 * price, finished steps collapsed to a single row, scene actions inline, and the comment pool
 * as chips rather than a column. The first version gave every step a full-height card, which
 * pushed the scene list — the thing the owner actually works in — below the fold.
 *
 * The scene list is computed with the same scenesFor() the reel engine calls, so ticking a
 * comment changes the list the renderer receives rather than a picture of it.
 */
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PRESETS } from '@/app/lib/captionPresets';
import { poolFor, scenesFor, type Scene } from '@/lib/studio/scenes';
import { useStepPreview, type LivePreview } from './useStepPreview';
import { estimateSeconds, mmss } from '@/lib/studio/estimate';
import { STEP_LABELS as RENDER_LABELS, STEP_ORDER as RENDER_STEPS } from '@/app/lib/videoSteps';
import {
  STEP_LABELS,
  canContinue,
  type GateResult,
  type Money,
  type Overrides,
  type Selection,
  type SourceItem,
  type StepName,
  type StepOptions,
  type StepPreview,
} from '@/lib/studio/steps/types';
import { OverrideDrawer, type KitOption } from './OverrideDrawer';

export interface StepView {
  status: 'ok' | 'error';
  output: any;
  cost: Money;
  gate: GateResult | null;
  error: string | null;
  /** True when the stored result came from options that have since changed. */
  stale?: boolean;
}

export interface RunViewProps {
  runId: string;
  /** Which source this run reads — the thing v1 decided silently. */
  sourceLabel: string;
  status: string;
  currentStep: StepName;
  template: StepName[];
  steps: Partial<Record<StepName, StepView>>;
  gateDeclared: Partial<Record<StepName, boolean>>;
  preview: LivePreview | null;
  /** Per-step controls as last previewed, so the screen returns with its knobs in place. */
  options: Partial<Record<StepName, StepOptions>>;
  item: SourceItem | null;
  itemRef: string | null;
  channelName: string;
  kitName: string;
  /** The kit's edge-tts voice, so a sample sounds like the reel will. */
  voiceId?: string;
  /** The kit's caption style, so the controls open showing what is actually set. */
  captionDefaults: Record<string, unknown>;
  kits: KitOption[];
  overrides: Overrides;
  selection: Selection;
  canSpend: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  new: 'mới',
  running: 'đang chạy',
  blocked: 'bị chặn',
  done: 'xong',
  error: 'lỗi',
};

const money = (m?: Money) => `$${(m?.usd ?? 0).toFixed(2)}`;

/** Steps whose body is editable content rather than a result to glance at. */
const EDITABLE = new Set<StepName>(['draft', 'reel']);

/** The one line a step header carries: what it is, how it went, what it cost. */
function headline(
  name: StepName,
  s: StepView | undefined,
  preview: StepPreview | null,
  scenes: Scene[],
  itemRef: string | null,
  title?: string,
): string {
  const bits: string[] = [];
  if (s?.status === 'error') bits.push('lỗi');
  else if (s?.gate) {
    bits.push(
      s.gate.checked === 0
        ? 'cổng chưa chạy'
        : s.gate.findings.length
          ? `${s.gate.checked} quy tắc · ${s.gate.findings.length} vấn đề`
          : `${s.gate.checked} quy tắc · đạt`,
    );
  }
  if (!s) {
    if (name === 'fetch') bits.push(itemRef ?? 'chọn bài');
    if (name === 'draft') bits.push('viết bài');
    if (name === 'image') bits.push('ảnh thẻ PNG');
    if (name === 'reel') bits.push(`${scenes.length} cảnh`);
  } else if (name === 'fetch') bits.unshift(title ?? itemRef ?? 'đã lấy');
  else if (name === 'image') bits.unshift('ảnh thẻ PNG');
  else if (name === 'reel') bits.unshift(`${scenes.length} cảnh`);

  bits.push(money(s?.cost ?? preview?.cost));
  if (name === 'reel') {
    const secs = s?.output?.durationSec ?? estimateSeconds(scenes.reduce((n, x) => n + x.text.length, 0));
    bits.push(s ? mmss(secs) : `~${mmss(secs)}`);
  }
  return bits.join(' · ');
}

export function RunView(p: RunViewProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(p.selection);
  const [overrides, setOverrides] = useState<Overrides>(p.overrides);
  const [draftEdit, setDraftEdit] = useState<string | null>(null);
  const [open, setOpen] = useState<StepName | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [render, setRender] = useState<{ step?: string; pct?: number; done: string[] } | null>(null);
  // The controls this step is being previewed with, live and unsaved until something runs.
  const [opts, setOpts] = useState<StepOptions>(p.options[p.currentStep] ?? {});

  // A step change brings its own stored controls; carrying the last step's over would show
  // the Video step's caption size on the card step.
  useEffect(() => {
    setOpts(p.options[p.currentStep] ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.currentStep]);

  const live = useStepPreview(p.runId, p.currentStep, opts, p.preview);

  const draft = draftEdit ?? (p.steps.draft?.output?.text as string | undefined) ?? '';

  useEffect(() => {
    if (busy !== 'reel' && busy !== 're-reel') {
      setRender(null);
      return;
    }
    let live = true;
    const tick = async () => {
      const res = await fetch(`/api/studio/runs/${p.runId}/advance`).catch(() => null);
      const b = (await res?.json().catch(() => null)) as any;
      if (live && b?.status) setRender({ step: b.step, pct: b.pct, done: b.done ?? [] });
    };
    void tick();
    const t = setInterval(tick, 1500);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [busy, p.runId]);

  async function post(body: Record<string, unknown>, label: string) {
    setBusy(label);
    setErr(null);
    try {
      const res = await fetch(`/api/studio/runs/${p.runId}/advance`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          selection,
          overrides,
          options: opts,
          editDraft: draftEdit ?? undefined,
          ...body,
        }),
      });
      if (!res.ok) setErr(((await res.json().catch(() => ({}))) as any).error ?? `HTTP ${res.status}`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const narration = draft || p.item?.text || '';
  const scenes = p.item ? scenesFor(narration, p.item.comments, selection) : [];
  const pool = p.item ? poolFor(p.item, selection) : [];
  const card = p.steps.image?.output?.url as string | undefined;
  const video = p.steps.reel?.output?.url as string | undefined;
  const unpicked = pool.filter((c) => !selection.commentIds.includes(c.id)).length;

  const toggle = (id: string) =>
    setSelection((s) => ({
      ...s,
      commentIds: s.commentIds.includes(id)
        ? s.commentIds.filter((x) => x !== id)
        : [...s.commentIds, id],
    }));

  const editScene = (id: string, text: string) =>
    setSelection((s) => ({ ...s, edits: { ...(s.edits ?? {}), [id]: text } }));

  const ovSummary = [
    `kit: ${p.overrides.kitId ?? p.kitName}`,
    `thời lượng: ${p.overrides.durationBand ?? 'theo kit'}`,
    `intro: ${p.overrides.includeIntro === false ? 'tắt' : 'bật'}`,
    `nhạc: ${p.overrides.music ?? 'theo kit'}`,
    `duyệt trước: ${p.overrides.reviewBeforeRender === false ? 'tắt' : 'bật'}`,
  ];

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <div className="min-w-0 flex-1">
        <header className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h1 className="text-xl font-bold">{p.channelName}</h1>
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {p.sourceLabel} · {p.kitName} · {STATUS_LABEL[p.status] ?? p.status} ·{' '}
            {p.runId.slice(0, 8)}
          </span>
        </header>

        {err && (
          <p data-testid="run-error" className="pen-line-sm mb-3 rounded-md bg-card px-3 py-1.5 text-sm text-[hsl(var(--destructive))]">
            {err}
          </p>
        )}

        <ol className="flex flex-col gap-2">
          {p.template.map((name, i) => {
            const s = p.steps[name];
            const isCurrent = name === p.currentStep && p.status !== 'done';
            const future = !s && !isCurrent;
            const gateOk = s ? canContinue(s, Boolean(p.gateDeclared[name])) : false;
            // Collapsed by default, EXCEPT the two steps whose body is the thing the owner
            // edits. The drawing has it this way too: fetch and image are one-liners, the
            // draft and the scene list stay open. Collapsing the draft hid the editor the
            // moment it produced anything.
            const editable =
              EDITABLE.has(name) && (Boolean(s) || (name === 'reel' && Boolean(p.item)));
            const expanded = isCurrent || open === name || editable;

            return (
              <li
                key={name}
                data-testid={`step-${name}`}
                data-state={s?.status === 'error' ? 'error' : s ? 'done' : isCurrent ? 'current' : 'future'}
                data-open={expanded}
                className="flex gap-2.5"
              >
                <span
                  className={`mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[11px] ${
                    s?.status === 'error'
                      ? 'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]'
                      : s
                        ? 'bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]'
                        : isCurrent
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {i + 1}
                </span>

                <div
                  className={`min-w-0 flex-1 rounded-[var(--radius)] px-3 py-2 ${
                    future && !expanded
                      ? 'border-2 border-dashed border-border bg-transparent'
                      : 'pen-line-static bg-card'
                  } ${future ? 'opacity-80' : ''}`}
                >
                  <button
                    type="button"
                    data-testid={`head-${name}`}
                    onClick={() => !isCurrent && s && setOpen(open === name ? null : name)}
                    className="flex w-full items-baseline gap-2 text-left"
                  >
                    <span className="text-sm font-semibold">{STEP_LABELS[name]}</span>
                    <span
                      data-testid={`cost-${name}`}
                      className="min-w-0 flex-1 truncate font-mono text-[11px] uppercase tracking-wider text-muted-foreground"
                    >
                      {headline(name, s, isCurrent ? live.preview : null, scenes, p.itemRef, p.item?.title)}
                    </span>
                    {s?.stale && (
                      <span
                        data-testid={`stale-${name}`}
                        className="shrink-0 rounded-md bg-secondary px-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                      >
                        đã đổi tuỳ chọn
                      </span>
                    )}
                  </button>

                  {s?.error && (
                    <p className="mt-1 font-mono text-[11px] text-[hsl(var(--destructive))]">{s.error}</p>
                  )}
                  {s?.gate?.findings.map((f) => (
                    <p key={f} className="mt-1 text-xs text-[hsl(var(--destructive))]">
                      {f}
                    </p>
                  ))}

                  {expanded && (
                    <div className="mt-2 flex flex-col gap-2">
                      {name === 'fetch' && s?.status === 'ok' && p.item && (
                        <p className="text-sm">
                          <span className="font-medium">{p.item.title}</span>
                          {p.item.source && (
                            <span className="ml-2 text-xs text-muted-foreground">{p.item.source}</span>
                          )}
                        </p>
                      )}

                      {name === 'draft' && s?.status === 'ok' && (
                        <textarea
                          id="draft-editor"
                          data-testid="draft-text"
                          value={draft}
                          onChange={(e) => setDraftEdit(e.target.value)}
                          rows={4}
                          className="pen-line-static w-full resize-y rounded-md bg-background p-2 text-sm outline-none"
                        />
                      )}

                      {name === 'image' && card && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={card} alt="" data-testid="card-preview" className="pen-line-static w-32 rounded-md" />
                      )}

                      {name === 'reel' && (
                        <SceneBoard
                          scenes={scenes}
                          pool={pool}
                          unpicked={unpicked}
                          selection={selection}
                          editing={editing}
                          showOriginal={showOriginal}
                          onToggle={toggle}
                          onEdit={editScene}
                          setEditing={setEditing}
                          setShowOriginal={setShowOriginal}
                          onHide={(v) => setSelection((s2) => ({ ...s2, hideUnselected: v }))}
                        />
                      )}

                      {name === 'reel' && render && (
                        <ol data-testid="render-rail" className="flex flex-wrap gap-1.5">
                          {RENDER_STEPS.map((r) => (
                            <li
                              key={r}
                              data-testid={`render-${r}`}
                              data-done={render.done.includes(r) ? 'true' : 'false'}
                              data-current={render.step === r ? 'true' : 'false'}
                              className={`rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                                render.done.includes(r)
                                  ? 'bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]'
                                  : render.step === r
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-secondary text-muted-foreground'
                              }`}
                            >
                              {RENDER_LABELS[r] ?? r}
                              {render.step === r && render.pct !== undefined ? ` ${render.pct}%` : ''}
                            </li>
                          ))}
                        </ol>
                      )}

                      {isCurrent && (
                        <StepControls
                          step={name}
                          opts={opts}
                          scenes={scenes}
                          voiceId={p.voiceId}
                          captionDefaults={p.captionDefaults}
                          onChange={setOpts}
                        />
                      )}

                      {isCurrent && !s && live.preview && (
                        <Preview preview={live.preview} stale={live.stale} />
                      )}
                      {isCurrent && live.error && (
                        <p data-testid="preview-error" className="text-xs text-[hsl(var(--destructive))]">
                          {live.error}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-1.5">
                        {isCurrent && (
                          <button
                            type="button"
                            data-testid={`continue-${name}`}
                            disabled={busy !== null || (Boolean(s) && !gateOk && s?.status !== 'error')}
                            onClick={() => post({}, name)}
                            className="pen-line-sm rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                          >
                            {busy === name ? 'Đang chạy…' : s ? 'Thử lại' : 'Tiếp tục'}
                          </button>
                        )}
                        {s && (
                          <button
                            type="button"
                            data-testid={`rerun-${name}`}
                            disabled={busy !== null}
                            onClick={() => post({ step: name }, `re-${name}`)}
                            className="pen-line-sm rounded-md bg-card px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
                          >
                            Chạy lại bước này
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <aside className="w-full shrink-0 lg:sticky lg:top-8 lg:w-64 lg:self-start">
        <div className="flex flex-col gap-2">
          {video ? (
            <video data-testid="run-player" src={video} controls className="pen-line-static w-full rounded-[var(--radius)] bg-black" />
          ) : card ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card} alt="" data-testid="rail-card" className="pen-line-static w-full rounded-[var(--radius)]" />
          ) : (
            <div className="pen-line-static grid aspect-[9/16] place-items-center rounded-[var(--radius)] bg-card text-xs text-muted-foreground">
              Chưa có kết quả
            </div>
          )}

          <p
            data-testid="run-status"
            className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground"
          >
            <span>{STATUS_LABEL[p.status] ?? p.status}</span>
            {video && (
              <>
                <span>·</span>
                <a href={video} download data-testid="run-download" className="underline">
                  tải về
                </a>
              </>
            )}
          </p>

          <div className="pen-line-static rounded-[var(--radius)] bg-card p-2.5">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Tuỳ chỉnh video này
            </div>
            <ul data-testid="ov-summary" className="mb-2 flex flex-col gap-0.5 font-mono text-[10px] text-muted-foreground">
              {ovSummary.map((l) => (
                <li key={l}>· {l}</li>
              ))}
            </ul>
            <button
              type="button"
              data-testid="ov-edit"
              onClick={() => setDrawerOpen((v) => !v)}
              className="pen-line-sm rounded-md bg-card px-2.5 py-1 text-xs font-semibold"
            >
              Sửa
            </button>
            {drawerOpen && (
              <div className="mt-2">
                <OverrideDrawer value={overrides} onChange={setOverrides} kits={p.kits} open />
              </div>
            )}
          </div>

          {!p.canSpend && (
            <p className="text-[11px] text-muted-foreground">
              Chế độ xem thử — mọi bước dùng dữ liệu mẫu và không tốn phí.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

/**
 * The controls that redraw this step, beside the thing they redraw.
 *
 * v1 put every knob in one drawer that only took effect on the next advance. These write to
 * the preview's options, so the picture answers within a debounce — the whole point of the
 * step screens.
 */
function StepControls({
  step,
  opts,
  scenes,
  voiceId,
  captionDefaults,
  onChange,
}: {
  step: StepName;
  opts: StepOptions;
  scenes: Scene[];
  voiceId?: string;
  captionDefaults: Record<string, unknown>;
  onChange: (o: StepOptions) => void;
}) {
  // Seeded from the kit, not from a constant: a control showing "classic" over a kit set to
  // "dam" tells the owner the wrong thing, and picking the value it already claimed to have
  // then changes nothing at all.
  const caps = { ...captionDefaults, ...((opts.captions ?? {}) as Record<string, unknown>) };
  const set = (tab: 'captions', patch: Record<string, unknown>) =>
    onChange({ ...opts, [tab]: { ...((opts[tab] ?? {}) as object), ...patch } });

  if (step === 'reel') {
    return (
      <div data-testid="controls-reel" className="flex flex-wrap items-center gap-2">
        <label className={CTRL}>
          mẫu phụ đề
          <select
            data-testid="ctl-caption-preset"
            value={String(caps.preset ?? 'classic')}
            onChange={(e) => set('captions', { preset: e.target.value })}
            className={SEL}
          >
            {Object.entries(PRESETS).map(([id, v]) => (
              <option key={id} value={id}>
                {String((v as { label?: string }).label ?? id)}
              </option>
            ))}
          </select>
        </label>
        <label className={CTRL}>
          cỡ chữ
          <input
            data-testid="ctl-caption-size"
            type="number"
            min={24}
            max={160}
            value={Number(caps.size ?? 64)}
            onChange={(e) => set('captions', { size: Number(e.target.value) })}
            className={`${SEL} w-16`}
          />
        </label>
        <label className={CTRL}>
          cảnh
          <select
            data-testid="ctl-scene"
            value={String(opts.sceneIndex ?? 0)}
            onChange={(e) => onChange({ ...opts, sceneIndex: Number(e.target.value) })}
            className={SEL}
          >
            {scenes.map((_, i) => (
              <option key={i} value={i}>
                #{i + 1}
              </option>
            ))}
          </select>
        </label>
        <Listen
          text={scenes[Number(opts.sceneIndex ?? 0)]?.text ?? ''}
          voice={voiceId}
          testId="ctl-listen"
        />
      </div>
    );
  }

  return null;
}

/**
 * One sentence through the same edge-tts the render uses. Mounted only on click: an <audio>
 * per scene would fire a request to Microsoft for every scene of every run just by opening
 * the page.
 */
function Listen({ text, voice, testId }: { text: string; voice?: string; testId: string }) {
  const [on, setOn] = useState(false);
  if (!text) return null;
  const q = new URLSearchParams({ text: text.slice(0, 300) });
  if (voice) q.set('voice', voice);
  return on ? (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio data-testid={`${testId}-audio`} src={`/api/studio/tts-sample?${q}`} controls autoPlay className="h-7" />
  ) : (
    <button type="button" data-testid={testId} onClick={() => setOn(true)} className={ACT}>
      ▷ nghe thử
    </button>
  );
}

const CTRL = 'flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground';
const SEL = 'pen-line-sm rounded-md bg-card px-1.5 py-0.5 font-sans text-xs font-semibold text-foreground';

function Preview({ preview, stale }: { preview: StepPreview; stale?: boolean }) {
  const d = preview.data as any;
  if (preview.kind === 'items') {
    return (
      <ul data-testid="preview-items" className="flex flex-col gap-1 text-sm">
        {(d as any[]).slice(0, 3).map((it) => (
          <li key={it.id} className="truncate rounded-md bg-secondary px-2 py-1">
            {it.title}
            {it.source && <span className="ml-2 text-xs text-muted-foreground">{it.source}</span>}
          </li>
        ))}
      </ul>
    );
  }
  if (preview.kind === 'png') {
    return (
      <Veil stale={stale}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={d.url} alt="" data-testid="preview-png" className="pen-line-static w-32 rounded-md" />
      </Veil>
    );
  }
  if (preview.kind === 'scenes') {
    if (!d.firstFrameUrl) return null;
    return (
      <Veil stale={stale}>
        {/* The frame as the reel will show it: plate, caption band, sticker. Every control
            is in the URL, so a changed preset is a different picture, not a re-render. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={d.firstFrameUrl}
          alt=""
          data-testid="preview-frame"
          className="pen-line-static w-28 rounded-md"
        />
      </Veil>
    );
  }
  return (
    <p data-testid="preview-text" className={`text-sm ${d.error ? 'text-[hsl(var(--destructive))]' : ''}`}>
      {d.title && <span className="mr-2 font-semibold">{d.title}</span>}
      {d.text}
    </p>
  );
}

/** The last good picture stays up while the next one is in flight, dimmed rather than gone. */
function Veil({ stale, children }: { stale?: boolean; children: React.ReactNode }) {
  return (
    <div
      data-testid="preview-veil"
      data-stale={stale ? 'true' : 'false'}
      className={stale ? 'w-fit animate-pulse opacity-50 transition-opacity' : 'w-fit transition-opacity'}
    >
      {children}
    </div>
  );
}

const ACT = 'font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-primary';

function SceneBoard({
  scenes,
  pool,
  unpicked,
  selection,
  editing,
  showOriginal,
  onToggle,
  onEdit,
  setEditing,
  setShowOriginal,
  onHide,
}: {
  scenes: Scene[];
  pool: { id: string; text: string; score: number | null; depth: number }[];
  unpicked: number;
  selection: Selection;
  editing: string | null;
  showOriginal: string | null;
  onToggle: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  setEditing: (v: string | null) => void;
  setShowOriginal: (v: string | null) => void;
  onHide: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <ol data-testid="scene-list" className="flex flex-col gap-1">
        {scenes.map((s) => (
          <li
            key={s.commentId ?? `post-${s.n}`}
            data-testid="scene"
            className={`rounded-md px-2 py-1 text-[13px] leading-snug ${
              s.kind === 'post' ? 'bg-secondary' : 'bg-sidebar-accent'
            }`}
            style={{ marginLeft: s.kind === 'comment' ? 14 : 0 }}
          >
            <span className="mr-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {s.kind === 'comment' ? '↳ ' : ''}Cảnh #{s.n} ·{' '}
              {s.kind === 'post' ? 'bài gốc' : `${s.score ?? '—'} likes`}
            </span>
            {editing === s.commentId && s.commentId ? (
              <textarea
                autoFocus
                data-testid={`scene-edit-${s.commentId}`}
                defaultValue={s.text}
                onBlur={(e) => {
                  onEdit(s.commentId!, e.target.value);
                  setEditing(null);
                }}
                rows={2}
                className="pen-line-static mt-1 w-full resize-y rounded-md bg-background p-1.5 text-[13px] outline-none"
              />
            ) : (
              <span>{showOriginal === s.commentId ? (s.original ?? s.text) : s.text}</span>
            )}
            <span className="ml-1.5 inline-flex gap-2">
              {s.kind === 'comment' && s.commentId && (
                <>
                  <button
                    type="button"
                    data-testid={`orig-${s.commentId}`}
                    onClick={() => setShowOriginal(showOriginal === s.commentId ? null : s.commentId!)}
                    className={ACT}
                  >
                    Text gốc
                  </button>
                  <button
                    type="button"
                    data-testid={`edit-${s.commentId}`}
                    onClick={() => setEditing(s.commentId!)}
                    className={ACT}
                  >
                    sửa
                  </button>
                </>
              )}
              {s.kind === 'post' && (
                <a href="#draft-editor" data-testid={`edit-post-${s.n}`} className={ACT}>
                  sửa
                </a>
              )}
            </span>
          </li>
        ))}
      </ol>

      {pool.length > 0 && (
        <div data-testid="comment-pool">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Comment khác · {unpicked}</span>
            <label className="flex cursor-pointer items-center gap-1">
              <input
                type="checkbox"
                data-testid="hide-unselected"
                checked={selection.hideUnselected}
                onChange={(e) => onHide(e.target.checked)}
                className="h-3 w-3 accent-[hsl(var(--primary))]"
              />
              Ẩn không chọn
            </label>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {pool
              .filter((c) => !selection.hideUnselected || selection.commentIds.includes(c.id))
              .map((c) => (
                <label
                  key={c.id}
                  data-testid="pool-comment"
                  title={c.text}
                  className={`pen-line-sm flex max-w-[15rem] cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] ${
                    selection.commentIds.includes(c.id) ? 'bg-sidebar-accent' : 'bg-card'
                  }`}
                >
                  <input
                    type="checkbox"
                    data-testid={`pick-${c.id}`}
                    checked={selection.commentIds.includes(c.id)}
                    onChange={() => onToggle(c.id)}
                    className="h-3 w-3 shrink-0 accent-[hsl(var(--primary))]"
                  />
                  <span className="font-mono text-[10px] text-muted-foreground">{c.score ?? '—'}</span>
                  <span className="truncate">{c.text}</span>
                </label>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
