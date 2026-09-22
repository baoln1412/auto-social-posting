'use client';

/**
 * The editorial run page. Steps top to bottom, each showing what it produced (or is about to
 * produce) and what it cost, with Continue disabled until its gate has actually run.
 *
 * The scene list is computed here with the same `scenesFor` the reel engine uses, so ticking
 * a comment changes the list the renderer will receive — not a mock of it.
 */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { poolFor, scenesFor } from '@/lib/studio/scenes';
import {
  STEP_LABELS,
  MODE_LABELS,
  canContinue,
  type GateResult,
  type Money,
  type Mode,
  type Overrides,
  type Selection,
  type SourceItem,
  type StepName,
  type StepPreview,
} from '@/lib/studio/steps/types';
import { OverrideDrawer, type KitOption } from './OverrideDrawer';

export interface StepView {
  status: 'ok' | 'error';
  output: any;
  cost: Money;
  gate: GateResult | null;
  error: string | null;
}

export interface RunViewProps {
  runId: string;
  mode: Mode;
  status: string;
  currentStep: StepName;
  template: StepName[];
  steps: Partial<Record<StepName, StepView>>;
  gateDeclared: Partial<Record<StepName, boolean>>;
  preview: StepPreview | null;
  item: SourceItem | null;
  channelName: string;
  kitName: string;
  kits: KitOption[];
  overrides: Overrides;
  selection: Selection;
  canSpend: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  new: 'Mới',
  running: 'Đang chạy',
  blocked: 'Bị chặn',
  done: 'Xong',
  error: 'Lỗi',
};

function money(m: Money | undefined): string {
  return `$${(m?.usd ?? 0).toFixed(2)}`;
}

function Chip({ tone, children }: { tone: 'ok' | 'bad' | 'warn' | 'mute'; children: React.ReactNode }) {
  const bg = {
    ok: 'bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]',
    bad: 'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]',
    warn: 'bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]',
    mute: 'bg-secondary text-muted-foreground',
  }[tone];
  return (
    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${bg}`}>
      {children}
    </span>
  );
}

export function RunView(p: RunViewProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(p.selection);
  const [overrides, setOverrides] = useState<Overrides>(p.overrides);
  // null = untouched. Deriving the displayed value from props keeps the editor correct across
  // router.refresh(); mirroring props into state pinned it to the first render, i.e. empty.
  const [draftEdit, setDraftEdit] = useState<string | null>(null);
  const draft = draftEdit ?? (p.steps.draft?.output?.text as string | undefined) ?? '';

  async function post(body: Record<string, unknown>, label: string) {
    setBusy(label);
    setErr(null);
    try {
      const res = await fetch(`/api/studio/runs/${p.runId}/advance`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ selection, overrides, editDraft: draftEdit ?? undefined, ...body }),
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

  const toggle = (id: string) =>
    setSelection((s) => ({
      ...s,
      commentIds: s.commentIds.includes(id)
        ? s.commentIds.filter((x) => x !== id)
        : [...s.commentIds, id],
    }));

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1">
        <header className="mb-5">
          <h1 className="text-2xl font-bold">{p.channelName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{MODE_LABELS[p.mode]}</span>
            <span>·</span>
            <span>{p.kitName}</span>
            <span>·</span>
            <Chip tone={p.status === 'error' || p.status === 'blocked' ? 'bad' : p.status === 'done' ? 'ok' : 'mute'}>
              {STATUS_LABEL[p.status] ?? p.status}
            </Chip>
            <span className="font-mono text-[11px]">{p.runId.slice(0, 8)}</span>
          </div>
        </header>

        {err && (
          <p data-testid="run-error" className="pen-line-sm mb-4 rounded-md bg-[hsl(var(--destructive))/0.1] px-3 py-2 text-sm">
            {err}
          </p>
        )}

        <ol className="flex flex-col gap-4">
          {p.template.map((name, i) => {
            const s = p.steps[name];
            const isCurrent = name === p.currentStep && p.status !== 'done';
            const future = !s && !isCurrent;
            const gateOk = s ? canContinue(s, Boolean(p.gateDeclared[name])) : false;

            return (
              <li
                key={name}
                data-testid={`step-${name}`}
                data-state={s?.status === 'error' ? 'error' : s ? 'done' : isCurrent ? 'current' : 'future'}
                className={`pen-line-static rounded-[var(--radius)] bg-card p-4 ${future ? 'opacity-45' : ''}`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
                  <h2 className="font-semibold">{STEP_LABELS[name]}</h2>
                  {s?.status === 'ok' && <Chip tone="ok">xong</Chip>}
                  {s?.status === 'error' && <Chip tone="bad">lỗi</Chip>}
                  {isCurrent && !s && <Chip tone="warn">chờ duyệt</Chip>}
                  {future && <Chip tone="mute">chưa tới</Chip>}
                  <span
                    data-testid={`cost-${name}`}
                    className="ml-auto font-mono text-xs text-muted-foreground"
                  >
                    {money(s?.cost ?? (isCurrent ? p.preview?.cost : undefined))}
                  </span>
                </div>

                {s?.error && <p className="mb-2 font-mono text-xs text-[hsl(var(--destructive))]">{s.error}</p>}

                {s?.gate && (
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Chip tone={s.gate.findings.length ? 'bad' : s.gate.checked ? 'ok' : 'warn'}>
                      {s.gate.checked === 0
                        ? 'cổng chưa chạy'
                        : s.gate.findings.length
                          ? `${s.gate.findings.length} vấn đề`
                          : `${s.gate.checked} quy tắc · đạt`}
                    </Chip>
                    {s.gate.findings.map((f) => (
                      <span key={f} className="text-xs text-[hsl(var(--destructive))]">
                        {f}
                      </span>
                    ))}
                  </div>
                )}

                {/* ── what this step shows ── */}
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
                    data-testid="draft-text"
                    value={draft}
                    onChange={(e) => setDraftEdit(e.target.value)}
                    rows={5}
                    className="pen-line-static w-full resize-y rounded-md bg-background p-2 text-sm outline-none"
                  />
                )}

                {name === 'image' && card && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card} alt="" data-testid="card-preview" className="pen-line-static w-40 rounded-md" />
                )}

                {name === 'reel' && (
                  <SceneBoard
                    scenes={scenes}
                    pool={pool}
                    selection={selection}
                    onToggle={toggle}
                    onHide={(v) => setSelection((s2) => ({ ...s2, hideUnselected: v }))}
                  />
                )}

                {isCurrent && !s && p.preview && <Preview preview={p.preview} />}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {isCurrent && (
                    <button
                      type="button"
                      data-testid={`continue-${name}`}
                      disabled={busy !== null || (Boolean(s) && !gateOk && s?.status !== 'error')}
                      onClick={() => post({}, name)}
                      className="pen-line-sm rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
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
                      className="pen-line-sm rounded-md bg-card px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                    >
                      Chạy lại bước này
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* ── right rail ── */}
      <aside className="w-full shrink-0 lg:sticky lg:top-8 lg:w-72 lg:self-start">
        <div className="flex flex-col gap-4">
          {video ? (
            <video
              data-testid="run-player"
              src={video}
              controls
              className="pen-line-static w-full rounded-[var(--radius)] bg-black"
            />
          ) : card ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card} alt="" className="pen-line-static w-full rounded-[var(--radius)]" />
          ) : (
            <div className="pen-line-static grid h-48 place-items-center rounded-[var(--radius)] bg-card text-xs text-muted-foreground">
              Chưa có kết quả
            </div>
          )}

          {video && (
            <a
              href={video}
              download
              data-testid="run-download"
              className="pen-line-sm rounded-md bg-card px-3 py-1.5 text-center text-xs font-semibold"
            >
              Tải về
            </a>
          )}

          <OverrideDrawer value={overrides} onChange={setOverrides} kits={p.kits} />
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

function Preview({ preview }: { preview: StepPreview }) {
  const d = preview.data as any;
  if (preview.kind === 'items') {
    return (
      <ul data-testid="preview-items" className="flex flex-col gap-1 text-sm">
        {(d as any[]).slice(0, 3).map((it) => (
          <li key={it.id} className="rounded-md bg-secondary px-2 py-1">
            <span className="font-medium">{it.title}</span>
            {it.source && <span className="ml-2 text-xs text-muted-foreground">{it.source}</span>}
          </li>
        ))}
      </ul>
    );
  }
  if (preview.kind === 'png') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={d.url} alt="" data-testid="preview-png" className="pen-line-static w-40 rounded-md" />;
  }
  return (
    <p data-testid="preview-text" className={`text-sm ${d.error ? 'text-[hsl(var(--destructive))]' : ''}`}>
      {d.title && <span className="mr-2 font-semibold">{d.title}</span>}
      {d.text}
    </p>
  );
}

function SceneBoard({
  scenes,
  pool,
  selection,
  onToggle,
  onHide,
}: {
  scenes: ReturnType<typeof scenesFor>;
  pool: { id: string; text: string; score: number | null; depth: number }[];
  selection: Selection;
  onToggle: (id: string) => void;
  onHide: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <ol data-testid="scene-list" className="flex flex-col gap-1.5">
        {scenes.map((s) => (
          <li
            key={s.n}
            title={s.text}
            data-testid="scene"
            className={`rounded-md px-2 py-1.5 text-sm ${s.kind === 'post' ? 'bg-secondary' : 'bg-sidebar-accent'}`}
            style={{ marginLeft: s.kind === 'comment' ? 12 : 0 }}
          >
            <span className="mr-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Cảnh #{s.n}
              {s.score !== null && ` · ${s.score} likes`}
            </span>
            {s.text}
          </li>
        ))}
      </ol>

      {pool.length > 0 && (
        <details data-testid="comment-pool" className="rounded-md bg-background">
          <summary className="cursor-pointer select-none font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Comment khác · {pool.filter((c) => !selection.commentIds.includes(c.id)).length}
          </summary>
          <label className="mt-2 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              data-testid="hide-unselected"
              checked={selection.hideUnselected}
              onChange={(e) => onHide(e.target.checked)}
              className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
            />
            Ẩn không chọn
          </label>
          <ul className="mt-2 flex flex-col gap-1">
            {pool
              .filter((c) => !selection.hideUnselected || selection.commentIds.includes(c.id))
              .map((c) => (
                <li
                  key={c.id}
                  data-testid="pool-comment"
                  className="flex items-start gap-2 text-sm"
                  style={{ marginLeft: c.depth * 14 }}
                >
                  <input
                    type="checkbox"
                    data-testid={`pick-${c.id}`}
                    checked={selection.commentIds.includes(c.id)}
                    onChange={() => onToggle(c.id)}
                    className="mt-1 h-3.5 w-3.5 shrink-0 accent-[hsl(var(--primary))]"
                  />
                  <span className="font-mono text-[10px] text-muted-foreground">{c.score ?? '—'}</span>
                  <span>{c.text}</span>
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
