'use client';

/**
 * The run page: one screen per step, the rail on top.
 *
 * The rail says where the run is and lets the owner walk back to any screen; the screen
 * itself is the thing that step is about, with its controls beside it and its price and
 * `Tiếp` underneath. v1 stacked all four steps as an accordion, which meant the scene
 * list — the thing the owner actually works in — competed for height with three results
 * they had already accepted.
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
  RUN_STATUS_LABELS,
} from '@/lib/studio/steps/types';
import { OverrideDrawer, type KitOption } from './OverrideDrawer';
import { StepRail, type RailItem } from './StepRail';

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
  /** Which step screen to open first; the library's Sửa ảnh / Đăng land here. */
  initialView?: StepName;
  item: SourceItem | null;
  itemRef: string | null;
  /** Which card renderer the kit uses — the classic one is the only one with an inset. */
  cardEngine: 'classic' | 'studio';
  /** The kit's own card ratio, so an untouched control shows what is actually drawn. */
  cardRatio: string;
  channelName: string;
  kitName: string;
  kitId: string;
  /** The kit's edge-tts voice, so a sample sounds like the reel will. */
  voiceId?: string;
  /** The kit's caption style, so the controls open showing what is actually set. */
  captionDefaults: Record<string, unknown>;
  /** Uploads that can be the transition sound. */
  sounds: { id: string; name: string }[];
  kits: KitOption[];
  overrides: Overrides;
  selection: Selection;
  canSpend: boolean;
}

const STATUS_LABEL = RUN_STATUS_LABELS;

const money = (m?: Money) => `$${(m?.usd ?? 0).toFixed(2)}`;

/** The one line a step carries on the rail: how it went, and what it cost. */
function note(name: StepName, s: StepView | undefined, preview: LivePreview | null, scenes: Scene[]): string {
  const bits: string[] = [];
  if (s?.status === 'error') bits.push('lỗi');
  else if (s?.gate) {
    bits.push(
      s.gate.checked === 0
        ? 'cổng chưa chạy'
        : s.gate.findings.length
          ? `${s.gate.findings.length} vấn đề`
          : `${s.gate.checked} quy tắc · đạt`,
    );
  }
  if (name === 'reel') bits.push(`${scenes.length} cảnh`);
  bits.push(money(s?.cost ?? preview?.cost));
  return bits.join(' · ');
}

export function RunView(p: RunViewProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(p.selection);
  const [overrides, setOverrides] = useState<Overrides>(p.overrides);
  const [draftEdit, setDraftEdit] = useState<string | null>(null);
  const [imgSaved, setImgSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [editing, setEditing] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [render, setRender] = useState<{ step?: string; pct?: number; done: string[] } | null>(null);
  const [opts, setOpts] = useState<StepOptions>(p.options[p.initialView ?? p.currentStep] ?? {});

  /** Which screen is open. Follows the run, until the owner walks back along the rail. */
  const [view, setView] = useState<StepName>(p.initialView ?? p.currentStep);
  useEffect(() => {
    setView(p.currentStep);
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
    let alive = true;
    const tick = async () => {
      const res = await fetch(`/api/studio/runs/${p.runId}/advance`).catch(() => null);
      const b = (await res?.json().catch(() => null)) as any;
      if (alive && b?.status) setRender({ step: b.step, pct: b.pct, done: b.done ?? [] });
    };
    void tick();
    const t = setInterval(tick, 1500);
    return () => {
      alive = false;
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

  const done = p.status === 'done';
  const s = p.steps[view];
  const onCurrent = view === p.currentStep && !done;
  const gateOk = s ? canContinue(s, Boolean(p.gateDeclared[view])) : false;
  const secs = p.steps.reel?.output?.durationSec
    ?? estimateSeconds(scenes.reduce((n, x) => n + x.text.length, 0));

  const rail: RailItem[] = p.template.map((name) => {
    const st = p.steps[name];
    return {
      id: name,
      label: STEP_LABELS[name],
      state:
        st?.status === 'error'
          ? 'error'
          : st
            ? 'done'
            : name === p.currentStep && !done
              ? 'current'
              : 'future',
      note: note(name, st, name === p.currentStep ? live.preview : null, scenes),
    };
  });

  const ovSummary = [
    `kit: ${p.overrides.kitId ?? p.kitName}`,
    `thời lượng: ${p.overrides.durationBand ?? 'theo kit'}`,
    `intro: ${p.overrides.includeIntro === false ? 'tắt' : 'bật'}`,
    `nhạc: ${p.overrides.music ?? 'theo kit'}`,
    `duyệt trước: ${p.overrides.reviewBeforeRender === false ? 'tắt' : 'bật'}`,
  ];

  return (
    <div className="flex flex-col gap-4">
      <StepRail items={rail} onGo={(id) => setView(id as StepName)} />

      {err && (
        <p data-testid="run-error" className="pen-line-sm rounded-md bg-card px-3 py-1.5 text-sm text-[hsl(var(--destructive))]">
          {err}
        </p>
      )}

      <div
        data-testid={`step-${view}`}
        data-state={s?.status === 'error' ? 'error' : s ? 'done' : onCurrent ? 'current' : 'future'}
        className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]"
      >
        <main className="st-card min-w-0 p-3.5">
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <h2 className="text-sm font-semibold">{STEP_LABELS[view]}</h2>
            {s?.stale && (
              <span data-testid={`stale-${view}`} className={CAPS}>
                đã đổi tuỳ chọn
              </span>
            )}
            {s?.error && (
              <span className="text-[12px] font-semibold text-[hsl(var(--destructive))]">{s.error}</span>
            )}
          </div>

          {s?.gate?.findings.map((f) => (
            <p key={f} className="mb-1 text-xs text-[hsl(var(--destructive))]">
              {f}
            </p>
          ))}

          {view === 'fetch' && (
            <>
              {/* What this run was pointed at. It used to ride in the step's one-line header
                  and had nowhere to go once the headers became screens. */}
              {p.itemRef && (
                <p data-testid="item-ref" className={`mb-1 ${CAPS}`}>
                  {p.sourceLabel} · {p.itemRef.length > 72 ? `${p.itemRef.slice(0, 72)}…` : p.itemRef}
                </p>
              )}
              {p.item ? (
                <p className="text-sm">
                  <span className="font-medium">{p.item.title}</span>
                  {p.item.source && <span className="ml-2 text-xs text-muted-foreground">{p.item.source}</span>}
                </p>
              ) : null}
              {onCurrent && !s && live.preview && <Preview preview={live.preview} stale={live.stale} />}
            </>
          )}

          {view === 'draft' && (
            <>
              <DraftHelp
                draft={draft}
                title={p.item?.title ?? ''}
                channelName={p.channelName}
                onApply={(text) => setDraftEdit(text)}
              />
              {s ? (
                <textarea
                  id="draft-editor"
                  data-testid="draft-text"
                  value={draft}
                  onChange={(e) => setDraftEdit(e.target.value)}
                  rows={12}
                  className="pen-line-static w-full resize-y rounded-md bg-background p-2 text-sm outline-none"
                />
              ) : (
                live.preview && <Preview preview={live.preview} stale={live.stale} />
              )}
            </>
          )}

          {view === 'image' && (
            <ImageScreen
              card={card ?? ((live.preview?.data as { url?: string } | undefined)?.url ?? null)}
              images={p.item?.images ?? []}
              engine={p.cardEngine}
              kitRatio={p.cardRatio}
              opts={opts}
              onChange={setOpts}
              saved={imgSaved}
              checks={imageChecks(p, opts, card ?? null)}
              onSave={async () => {
                // The old app's own write: PATCH /api/posts { id, imageUrl, insetUrl }, the
                // same call PostCard's saveCardImages makes. One write path, not two.
                const id = p.itemRef?.startsWith('gold:') ? p.itemRef.slice(5) : null;
                if (!id) return;
                setImgSaved('saving');
                const co = (opts.card ?? {}) as Record<string, unknown>;
                const res = await fetch('/api/posts', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    id,
                    imageUrl: String(co.bgUrl ?? p.item?.images?.[0] ?? ''),
                    insetUrl: String(co.insetUrl ?? p.item?.images?.[1] ?? ''),
                  }),
                }).catch(() => null);
                setImgSaved(res?.ok ? 'saved' : 'error');
              }}
            />
          )}

          {view === 'reel' && (
            <>
              <SceneBoard
                scenes={scenes}
                pool={pool}
                unpicked={unpicked}
                selection={selection}
                editing={editing}
                showOriginal={showOriginal}
                voiceId={p.voiceId}
                onToggle={toggle}
                onEdit={editScene}
                setEditing={setEditing}
                setShowOriginal={setShowOriginal}
                onEditPost={() => setView('draft')}
                onHide={(v) => setSelection((s2) => ({ ...s2, hideUnselected: v }))}
              />
              {render && (
                <ol data-testid="render-rail" className="mt-2 flex flex-wrap gap-1.5">
                  {RENDER_STEPS.map((r) => (
                    <li
                      key={r}
                      data-testid={`render-${r}`}
                      data-done={render.done.includes(r) ? 'true' : 'false'}
                      data-current={render.step === r ? 'true' : 'false'}
                      className={`rounded-md px-2 py-0.5 st-label ${
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
            </>
          )}

          {view === 'publish' && (
            <PublishScreen
              record={s?.output}
              preview={onCurrent && !s ? live.preview : null}
              overrides={overrides}
              onChange={setOverrides}
            />
          )}
        </main>

        <aside className="flex flex-col gap-2">
          {view === 'reel' && (
            // eslint-disable-next-line @next/next/no-img-element
            <>
              {video ? (
                <video data-testid="run-player" src={video} controls className="st-stage w-full" />
              ) : (
                live.preview?.kind === 'scenes' && <Preview preview={live.preview} stale={live.stale} />
              )}
            </>
          )}
          {view !== 'reel' &&
            (video ? (
              <video data-testid="run-player" src={video} controls className="st-stage w-full" />
            ) : card ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={card} alt="" data-testid="rail-card" className="st-card w-full rounded-[var(--radius)]" />
            ) : (
              // Not "Chưa có kết quả": on Đọc bài and Viết bài the result is in the main
              // column, and a box saying there is none was contradicting the screen beside it.
              <div className="st-quiet grid aspect-[9/16] place-items-center px-3 text-center text-xs text-muted-foreground">
                Ảnh và video hiện ở đây sau bước <b>Ảnh</b>.
              </div>
            ))}

          <p data-testid="run-status" className={`flex items-center gap-2 ${CAPS}`}>
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

          {onCurrent && (
            <StepControls
              step={view}
              opts={opts}
              scenes={scenes}
              voiceId={p.voiceId}
              captionDefaults={p.captionDefaults}
              onChange={setOpts}
            />
          )}
          {live.error && onCurrent && (
            <p data-testid="preview-error" className="text-xs text-[hsl(var(--destructive))]">
              {live.error}
            </p>
          )}

          <div className="st-quiet p-2.5">
            <div className="mb-1 text-[12px] font-bold">Tuỳ chỉnh video này</div>
            <ul data-testid="ov-summary" className={`mb-2 flex flex-col gap-0.5 ${CAPS}`}>
              {ovSummary.map((l) => (
                <li key={l}>· {l}</li>
              ))}
            </ul>
            <button
              type="button"
              data-testid="ov-edit"
              onClick={() => setDrawerOpen((v) => !v)}
              className="st-btn st-sm"
            >
              Sửa
            </button>
            {drawerOpen && (
              <div className="mt-2">
                <OverrideDrawer
                  value={overrides}
                  onChange={setOverrides}
                  kits={p.kits}
                  open
                  runId={p.runId}
                  kitId={p.overrides.kitId ?? p.kitId}
                  sounds={p.sounds}
                />
              </div>
            )}
          </div>

          {!p.canSpend && (
            <p className="text-[11px] text-muted-foreground">
              Chế độ xem thử — mọi bước dùng dữ liệu mẫu và không tốn phí.
            </p>
          )}
        </aside>
      </div>

      <footer className="st-card sticky bottom-3 flex flex-wrap items-center gap-2 px-3.5 py-2.5">
        <span data-testid={`cost-${view}`} className={CAPS}>
          {/* note() already ends with the price; printing money() first said it twice. */}
          {note(view, s, onCurrent ? live.preview : null, scenes)}
          {view === 'reel' && ` · ${s ? mmss(secs) : `~${mmss(secs)}`}`}
        </span>

        {s && (
          <button
            type="button"
            data-testid={`rerun-${view}`}
            disabled={busy !== null}
            onClick={() => post({ step: view }, `re-${view}`)}
            className="ml-auto st-btn st-sm"
          >
            {view === 'reel' ? 'Chỉnh tiếp & render lại' : 'Chạy lại bước này'}
          </button>
        )}

        {onCurrent && (
          <button
            type="button"
            data-testid={`continue-${view}`}
            disabled={busy !== null || (Boolean(s) && !gateOk && s?.status !== 'error')}
            onClick={() => post({}, view)}
            className={`${s ? '' : 'ml-auto'} st-btn st-sm st-primary`}
          >
            {busy === view ? 'Đang chạy…' : s ? 'Thử lại' : 'Tiếp tục'}
          </button>
        )}
      </footer>
    </div>
  );
}

const CAPS = 'st-label text-muted-foreground';

/**
 * Đăng — where the finished run goes.
 *
 * The library is stated, not offered: every run is already in it. "Đăng sau" records a time
 * and says plainly that nothing will act on it, because nothing will — a scheduler this repo
 * does not have is not something a button should imply.
 */
function PublishScreen({
  record,
  preview,
  overrides,
  onChange,
}: {
  record: any;
  preview: LivePreview | null;
  overrides: Overrides;
  onChange: (o: Overrides) => void;
}) {
  const d = (preview?.data ?? {}) as {
    title?: string;
    assets?: { kind: string; url?: string }[];
    destinations?: { id: string; label: string; blocked: string | null }[];
  };
  const to = overrides.publishTo ?? ['library'];
  const set = (id: 'library' | 'telegram', on: boolean) =>
    onChange({
      ...overrides,
      publishTo: on ? Array.from(new Set([...to, id])) : to.filter((x) => x !== id),
    });

  if (record) {
    return (
      <div data-testid="publish-done" className="flex flex-col gap-1 text-sm">
        <p>Đã lưu vào thư viện.</p>
        <p className={CAPS}>
          telegram: {record.telegram}
          {record.telegramNote ? ` — ${record.telegramNote}` : ''}
        </p>
        {record.scheduledAt && <p className={CAPS}>hẹn giờ ghi nhận: {record.scheduledAt}</p>}
      </div>
    );
  }

  return (
    <div data-testid="publish-screen" className="flex flex-col gap-2">
      {d.title && <p className="text-sm font-medium">{d.title}</p>}
      <div className="flex flex-col gap-1">
        {(d.destinations ?? []).map((dest) => (
          <label key={dest.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-testid={`pub-${dest.id}`}
              disabled={dest.id === 'library' || Boolean(dest.blocked)}
              checked={dest.id === 'library' || to.includes(dest.id as 'telegram')}
              onChange={(e) => set(dest.id as 'library' | 'telegram', e.target.checked)}
              className="h-4 w-4 accent-[hsl(var(--primary))]"
            />
            {dest.label}
            {dest.blocked && (
              <span data-testid={`pub-blocked-${dest.id}`} className={CAPS}>
                {dest.blocked}
              </span>
            )}
          </label>
        ))}
      </div>

      <label className={`flex items-center gap-2 ${CAPS}`}>
        đăng sau
        <input
          type="datetime-local"
          data-testid="pub-at"
          value={overrides.publishAt ?? ''}
          onChange={(e) => onChange({ ...overrides, publishAt: e.target.value || undefined })}
          className="pen-line-sm rounded-md bg-background px-1.5 py-0.5 font-sans text-xs text-foreground"
        />
      </label>
      <p className={CAPS}>
        giờ hẹn chỉ được ghi lại — chưa có bộ đặt lịch nào chạy nó
      </p>

      <ul className="flex flex-wrap gap-2">
        {(d.assets ?? []).map((a) => (
          <li key={a.url} data-testid="publish-asset" className={CAPS}>
            {a.kind}
          </li>
        ))}
      </ul>
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
function Listen({
  text,
  voice,
  testId,
  label = 'nghe thử',
}: {
  text: string;
  voice?: string;
  testId: string;
  label?: string;
}) {
  const [on, setOn] = useState(false);
  if (!text) return null;
  const q = new URLSearchParams({ text: text.slice(0, 300) });
  if (voice) q.set('voice', voice);
  return on ? (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio data-testid={`${testId}-audio`} src={`/api/studio/tts-sample?${q}`} controls autoPlay className="h-7 align-middle" />
  ) : (
    <button type="button" data-testid={testId} onClick={() => setOn(true)} className={ACT}>
      ▷ {label}
    </button>
  );
}

const CTRL = 'flex items-center gap-1 st-label text-muted-foreground';
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

const ACT = 'st-btn st-sm st-ghost';

function SceneBoard({
  scenes,
  pool,
  unpicked,
  selection,
  editing,
  showOriginal,
  voiceId,
  onToggle,
  onEdit,
  setEditing,
  setShowOriginal,
  onEditPost,
  onHide,
}: {
  scenes: Scene[];
  pool: { id: string; text: string; score: number | null; depth: number }[];
  unpicked: number;
  selection: Selection;
  editing: string | null;
  showOriginal: string | null;
  voiceId?: string;
  onToggle: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  setEditing: (v: string | null) => void;
  setShowOriginal: (v: string | null) => void;
  /** A post scene's words come from the draft, so editing one means going there. */
  onEditPost: () => void;
  onHide: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <ol data-testid="scene-list" className="flex flex-col gap-1">
        {scenes.map((s) => (
          <li
            key={s.commentId ?? `post-${s.n}`}
            data-testid="scene"
            className={`${s.kind === 'post' ? 'st-card' : 'st-quiet'} px-3 py-2 text-[14px] leading-snug`}
            style={{ marginLeft: s.kind === 'comment' ? 26 : 0 }}
          >
            <span className="mb-1 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
              <span className="st-badge st-green">CẢNH #{s.n}</span>
              {s.kind === 'post' ? (
                'bài gốc'
              ) : (
                <>
                  <span className="st-num">{s.score ?? '—'}</span> likes
                </>
              )}
              <span>· Text TTS</span>
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
            <span className="mt-1.5 flex flex-wrap gap-1.5">
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
                  {/* Nghe thoại — this scene's own line, in the voice that will read it. */}
                  <Listen text={s.text} voice={voiceId} testId={`hear-${s.commentId}`} label="Nghe thoại" />
                </>
              )}
              {s.kind === 'post' && (
                <>
                  <button type="button" data-testid={`edit-post-${s.n}`} onClick={onEditPost} className={ACT}>
                    sửa
                  </button>
                  <Listen text={s.text} voice={voiceId} testId={`hear-post-${s.n}`} label="Nghe thoại" />
                </>
              )}
            </span>
          </li>
        ))}
      </ol>

      {pool.length > 0 && (
        <div data-testid="comment-pool">
          <div className="flex items-center gap-2 st-label text-muted-foreground">
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

/**
 * What the Ảnh step checked. Three things that can be known here, each true or false, so the
 * screen can say "3/3" and mean it — a gate that says how many things it checked, the same
 * rule the steps follow.
 */
function imageChecks(p: RunViewProps, opts: StepOptions, card: string | null): { label: string; ok: boolean }[] {
  const co = (opts.card ?? {}) as Record<string, unknown>;
  const picture = String(co.bgUrl ?? p.item?.images?.[0] ?? '');
  return [
    { label: 'Đã dựng được ảnh', ok: Boolean(card) },
    { label: 'Bài có link nguồn', ok: Boolean(p.item?.url) },
    { label: 'Có ảnh nền (không phải nền trống)', ok: Boolean(picture) },
  ];
}

/**
 * Ảnh — the old app's News Card section, as a step.
 *
 * Every control PostCard has (tests/unit/postcard-parity.test.ts holds the list) and three
 * things it does not: what this one picture is used for, a check that says how many things
 * it checked, and the sentence that says where the STYLE lives. Ratio, picture and highlight
 * are this post's; theme, font and radius belong to the kit, because they are the channel's.
 */
function ImageScreen({
  card,
  images,
  engine,
  kitRatio,
  opts,
  onChange,
  onSave,
  saved,
  checks,
}: {
  card: string | null;
  images: string[];
  engine: 'classic' | 'studio';
  kitRatio: string;
  opts: StepOptions;
  onChange: (o: StepOptions) => void;
  onSave: () => void;
  saved: 'idle' | 'saving' | 'saved' | 'error';
  checks: { label: string; ok: boolean }[];
}) {
  const cardOpts = (opts.card ?? {}) as Record<string, unknown>;
  const set = (next: Record<string, unknown>) => onChange({ ...opts, card: { ...cardOpts, ...next } });
  // Unset means the kit's, not 4:5 — a chip that claimed 4:5 while the kit drew 9:16 was
  // the control lying about what is on screen beside it.
  const ratio = String(cardOpts.ratio ?? kitRatio);
  const chosen = cardOpts.bgUrl as string | undefined;
  const passed = checks.filter((c) => c.ok).length;

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {card ? (
          <a href={card} target="_blank" rel="noopener noreferrer" data-testid="img-open" title="Mở ảnh gốc" className="self-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card} alt="" data-testid="card-preview" className="st-card w-full max-w-[22rem] rounded-[var(--radius)]" />
          </a>
        ) : (
          <div className="st-quiet grid aspect-[4/5] w-full max-w-[22rem] place-items-center text-xs text-muted-foreground">
            Chưa dựng ảnh
          </div>
        )}
        <div className="st-quiet px-3.5 py-2.5 text-[13px]">
          <b>Ảnh này dùng ở đâu</b>
          <div className="st-help mt-1">
            Đăng Facebook (<span className="st-num">1200×630</span>) · ảnh bìa video · thẻ trong video. Sửa ở
            đây một lần, cả ba chỗ cùng đổi.
          </div>
        </div>
        <div data-testid="img-checks" className="st-quiet px-3.5 py-2.5 text-[13px]">
          <b>
            Kiểm tra <span className="st-num">{passed}/{checks.length}</span>
          </b>
          <ul className="st-help mt-1 flex flex-col gap-0.5">
            {checks.map((c) => (
              <li key={c.label}>
                {c.ok ? '✓' : '✗'} {c.label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <aside className="st-card flex w-full shrink-0 flex-col gap-3 px-4 py-3.5 lg:w-80">
        <h3 className="text-[17px] font-bold" style={{ fontFamily: "'Baloo 2', system-ui, sans-serif" }}>
          Sửa ảnh
        </h3>

        <div className="st-group">
          <div className="st-gt">Tỉ lệ</div>
          {/* Literal testids, not a template: tests/unit/postcard-parity.test.ts greps this
              file for the control the old card has, and a template hides it from that grep. */}
          <div className="flex gap-1.5">
            <button type="button" data-testid="img-ratio-4:5" aria-pressed={ratio === '4:5'} onClick={() => set({ ratio: '4:5' })} className={`st-chip flex-1 justify-center ${ratio === '4:5' ? 'st-on' : ''}`}>
              4:5 dọc
            </button>
            <button type="button" data-testid="img-ratio-1:1" aria-pressed={ratio === '1:1'} onClick={() => set({ ratio: '1:1' })} className={`st-chip flex-1 justify-center ${ratio === '1:1' ? 'st-on' : ''}`}>
              1:1 vuông
            </button>
            <button type="button" data-testid="img-ratio-9:16" aria-pressed={ratio === '9:16'} onClick={() => set({ ratio: '9:16' })} className={`st-chip flex-1 justify-center ${ratio === '9:16' ? 'st-on' : ''}`}>
              9:16 video
            </button>
          </div>
          {ratio === '9:16' && engine === 'classic' && (
            <div className="st-help">Thẻ cổ điển chỉ dựng 4:5 và 1:1 — 9:16 cần kiểu thẻ Studio.</div>
          )}
        </div>

        <div data-testid="img-main" className="st-group">
          <div className="st-gt">Ảnh chính</div>
          {images.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {images.map((u) => (
                <button
                  key={u}
                  type="button"
                  data-testid="img-pick"
                  aria-pressed={chosen === u}
                  onClick={() => set({ bgUrl: u })}
                  className={`h-11 w-16 overflow-hidden rounded-md border-2 ${chosen === u ? 'border-primary shadow-[2px_2px_0_hsl(var(--foreground))]' : 'border-[var(--st-pen2)]'}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : (
            <div className="st-help">Bài này không có ảnh nào — tải lên một tấm.</div>
          )}
          <Upload label="Tải ảnh chính lên" testId="img-upload" onDone={(url) => set({ bgUrl: url })} />
        </div>

        <div data-testid="img-inset" className="st-group">
          <div className="st-gt">Ảnh tròn</div>
          {engine === 'studio' ? (
            <div className="st-help">Kiểu thẻ Studio không có ảnh tròn — đổi sang thẻ cổ điển ở Bộ nhận diện.</div>
          ) : (
            <>
              <Upload label="Tải ảnh tròn lên" testId="img-upload-inset" onDone={(url) => set({ insetUrl: url })} />
              {cardOpts.insetUrl ? <div className="st-help">Đã chọn.</div> : <div className="st-help">Dùng khi bài không có ảnh nền riêng.</div>}
            </>
          )}
        </div>

        <label className="st-group">
          <div className="st-gt">Chữ nhấn</div>
          <select
            data-testid="img-highlight"
            value={String(cardOpts.highlight ?? '')}
            onChange={(e) => set({ highlight: e.target.value || undefined })}
            className="rounded-lg border-2 border-foreground bg-background px-2.5 py-1.5 text-[13px] font-semibold"
          >
            <option value="">(theo bộ nhận diện)</option>
            <option value="after-colon">Sau dấu hai chấm</option>
            <option value="first-clause">Mệnh đề đầu</option>
            <option value="none">Không nhấn</option>
          </select>
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="img-reset"
            onClick={() => onChange({ ...opts, card: {} })}
            className="st-btn st-sm st-ghost"
          >
            Dùng lại ảnh của bài
          </button>
          {card && (
            <a
              href={`/api/image/resize?url=${encodeURIComponent(card)}`}
              download="fb-post-image.jpg"
              data-testid="img-download"
              className="st-btn st-sm"
            >
              Tải <span className="st-num">1200×630</span>
            </a>
          )}
        </div>

        <button type="button" data-testid="img-save" disabled={saved === 'saving' || !card} onClick={onSave} className="st-btn st-primary">
          {saved === 'saving' ? 'Đang lưu…' : saved === 'saved' ? 'Đã lưu vào bài' : 'Lưu vào bài'}
        </button>
        {saved === 'error' && <p className="text-xs text-[hsl(var(--destructive))]">Không lưu được vào bài.</p>}
        <p className="st-help">
          Đổi kiểu thẻ, font, bo góc… ở <b>Bộ nhận diện → Ảnh chụp bài viết</b>. Ở đây chỉ sửa cho bài này.
        </p>
      </aside>
    </div>
  );
}

/** One file to Kho tài nguyên, through the old app's own upload route. */
function Upload({ label, testId, onDone }: { label: string; testId: string; onDone: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className={`st-btn st-sm st-ghost cursor-pointer ${busy ? 'opacity-50' : ''}`}>
      {busy ? 'Đang tải…' : label}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        data-testid={testId}
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setBusy(true);
          try {
            const fd = new FormData();
            fd.append('file', f);
            const res = await fetch('/api/image/upload', { method: 'POST', body: fd });
            const b = (await res.json().catch(() => ({}))) as { url?: string };
            if (b.url) onDone(b.url);
          } finally {
            setBusy(false);
          }
        }}
      />
    </label>
  );
}

/**
 * Sửa bằng AI and Tạo script — the old app's two writing helps, on the step that writes.
 *
 * Both call the routes the old app calls (`/api/ai/refine`, `/api/ai/video-script`) with the
 * bodies it sends; a second AI path would drift from the first the day either prompt changed.
 */
function DraftHelp({ draft, title, channelName, onApply }: { draft: string; title: string; channelName: string; onApply: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState<'refine' | 'script' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function call(what: 'refine' | 'script') {
    setBusy(what);
    setErr(null);
    try {
      const res =
        what === 'refine'
          ? await fetch('/api/ai/refine', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ draft, instruction: prompt }),
            })
          : await fetch('/api/ai/video-script', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title, draft, channelName }),
            });
      const b = (await res.json().catch(() => ({}))) as { refined?: string; script?: string; text?: string; error?: string };
      if (!res.ok) {
        setErr(b.error ?? `HTTP ${res.status}`);
        return;
      }
      setOut(b.refined ?? b.script ?? b.text ?? '');
      setOpen(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-testid="draft-ai" onClick={() => setOpen((v) => !v)} className="st-btn st-sm">
          Sửa bằng AI
        </button>
        <button type="button" data-testid="draft-script" disabled={busy !== null} onClick={() => call('script')} className="st-btn st-sm">
          {busy === 'script' ? 'Đang viết…' : 'Tạo script'}
        </button>
      </div>
      {open && (
        <div className="st-quiet flex flex-col gap-2 px-3 py-2.5">
          <input
            type="text"
            data-testid="draft-ai-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Viết lại mở bài, thêm số liệu…"
            className="rounded-lg border-2 border-foreground bg-background px-2.5 py-1.5 text-[13px]"
          />
          <button type="button" data-testid="draft-ai-run" disabled={busy !== null || !prompt.trim()} onClick={() => call('refine')} className="st-btn st-sm st-primary self-start">
            {busy === 'refine' ? 'Đang sửa…' : 'Nhờ AI sửa'}
          </button>
          {err && <p className="text-xs text-[hsl(var(--destructive))]">{err}</p>}
          {out && (
            <>
              <textarea data-testid="draft-ai-out" value={out} readOnly rows={6} className="w-full resize-y rounded-lg border-2 border-foreground bg-background p-2 text-[13px]" />
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid="draft-ai-apply"
                  onClick={() => {
                    onApply(out);
                    setOut('');
                    setOpen(false);
                  }}
                  className="st-btn st-sm st-primary"
                >
                  Áp dụng
                </button>
                <button type="button" data-testid="draft-ai-discard" onClick={() => setOut('')} className="st-btn st-sm st-ghost">
                  Bỏ
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
