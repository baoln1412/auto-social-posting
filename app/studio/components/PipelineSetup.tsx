'use client';

/**
 * Door 1 — the crawler, set up in five screens.
 *
 * Every screen shows its own preview on real rows, and every `Tiếp` is gated the way a step
 * gate is: `checked === 0` blocks exactly as findings do, because a check that never ran is
 * not a pass.
 *
 * The rail itself is free to click. Gating arrival would only make the rule positional — the
 * rule that matters is that an output shape whose three drafts fail compliance must not be
 * scheduled, so that one sits on `Chạy ngay`, the button that actually sets the crawler off.
 *
 * The feeds are read and written through /api/feeds and the market's prompt through
 * /api/pages: the old Settings panel and this screen edit the same rows, so there is nothing
 * to drift. Studio's own half — ordering, output shape, which kit — is what studio_pipelines
 * holds.
 *
 * The rail is the same StepRail the run page uses: both flows are one idea — where am I,
 * what is behind me, what is ahead — and two copies of it would drift the first time either
 * grew a state.
 */
import { useCallback, useEffect, useState } from 'react';
import { TOPICS } from '@/app/lib/topics';
import { FORMATS, LENGTH_BANDS, TITLE_STYLES, outputPrompt } from '@/lib/studio/formats';
import type { PipelineConfig } from '@/lib/studio/pipeline/config';
import { upsertBlock } from '@/lib/studio/pipeline/prompt';
import { detectSource, SOURCE_LABELS } from '@/lib/studio/sources/detect';
import { StepRail } from './StepRail';
import type { SourceKind } from '@/lib/studio/sources';

export interface Feed {
  id: string;
  name: string;
  url: string;
  feedType: string;
  enabled: boolean;
}
export interface MarketRow {
  id: string;
  name: string;
  language: string;
  writingStyle: string;
  wordingRules: string;
  userPrompt: string;
}
export interface KitOpt {
  id: string;
  name: string;
}

const STEPS = ['Nguồn', 'Lọc & xếp', 'Đầu ra', 'Ảnh & video', 'Lịch'];

const CAPS = 'st-label text-muted-foreground';
const CARD = 'st-quiet p-3.5';
const BTN = 'st-btn st-sm';
const FIELD = 'st-field';

/** A pasted box → what to store in rss_feeds, or why it cannot be. */
function asFeed(raw: string): { kind: SourceKind; url: string; note?: string } | null {
  const hit = detectSource(raw);
  if (!hit) return null;
  if (hit.kind === 'reddit' && hit.cfg.url) {
    // A subreddit already publishes RSS, so it needs no adapter of its own — the crawler
    // that runs every six hours picks it up with no change at all.
    const base = hit.cfg.url.replace(/\/+$/, '').split('?')[0];
    return { kind: 'rss', url: /\.rss$/.test(base) ? base : `${base}/.rss` };
  }
  if (hit.kind === 'facebook' || hit.kind === 'instagram' || hit.kind === 'threads') {
    return { kind: hit.kind, url: hit.cfg.url ?? raw, note: SOURCE_LABELS[hit.kind] };
  }
  if (hit.cfg.url) return { kind: 'rss', url: hit.cfg.url };
  return null;
}

export function PipelineSetup({
  market,
  kits,
  initial,
  schedule,
}: {
  market: MarketRow;
  kits: KitOpt[];
  initial: PipelineConfig;
  /** Read off deploy/com.immigration.pipeline.plist, which is where the cadence lives. */
  schedule: string;
}) {
  const [step, setStep] = useState(0);
  const [cfg, setCfg] = useState<PipelineConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // The market's own userPrompt, kept here so each save rewrites only Studio's block in it.
  const [userPrompt, setUserPrompt] = useState(market.userPrompt);

  const patch = <K extends keyof PipelineConfig>(k: K, v: Partial<PipelineConfig[K]>) =>
    setCfg((c) => ({ ...c, [k]: { ...(c[k] as object), ...(v as object) } }) as PipelineConfig);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/studio/pipeline/${market.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ config: cfg }),
      });
      if (!res.ok) {
        setErr(((await res.json().catch(() => ({}))) as any).error ?? `HTTP ${res.status}`);
        return;
      }

      // And the half the pipeline actually reads. The 4-hourly run is a Claude Code skill
      // that pulls each market from /api/pages and applies its userPrompt on top of
      // CONTENT_SOP.md — so the output shape has to live there, or this screen would be
      // configuring something nothing consumes.
      //
      // userPrompt and not systemPrompt: article-processor.ts slices the first 500
      // characters of systemPrompt as the niche hint for the relevance filter, and a format
      // fragment there would quietly change which articles get classified at all.
      const next = upsertBlock(userPrompt, outputPrompt(cfg.output));
      const p = await fetch('/api/pages', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: market.id, userPrompt: next }),
      });
      if (!p.ok) setErr('Lưu được thiết lập nhưng chưa ghi được dạng bài vào thị trường.');
      else setUserPrompt(next);
    } finally {
      setSaving(false);
    }
  }

  const [gates, setGates] = useState<Record<number, { checked: number; findings: string[] }>>({});
  const gate = gates[step] ?? { checked: 0, findings: [] };
  const canNext = gate.checked > 0 && gate.findings.length === 0;
  const report = useCallback(
    (i: number, g: { checked: number; findings: string[] }) =>
      setGates((s) => (JSON.stringify(s[i]) === JSON.stringify(g) ? s : { ...s, [i]: g })),
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <StepRail
        testId="prail"
        items={STEPS.map((label, i) => ({
          id: String(i),
          label,
          state: i === step ? 'current' : i < step ? 'done' : 'future',
        }))}
        onGo={(_id, i) => setStep(i)}
      />

      {err && (
        <p data-testid="pipeline-error" className="text-sm text-[hsl(var(--destructive))]">
          {err}
        </p>
      )}

      {step === 0 && <SourcesStep market={market} cfg={cfg} patch={patch} report={(g) => report(0, g)} />}
      {step === 1 && <OrderStep market={market} cfg={cfg} patch={patch} report={(g) => report(1, g)} />}
      {step === 2 && <OutputStep market={market} cfg={cfg} patch={patch} report={(g) => report(2, g)} />}
      {step === 3 && <MediaStep kits={kits} cfg={cfg} patch={patch} report={(g) => report(3, g)} />}
      {step === 4 && (
        <ScheduleStep
          market={market}
          cfg={cfg}
          schedule={schedule}
          outputGate={gates[2] ?? { checked: 0, findings: [] }}
          report={(g) => report(4, g)}
        />
      )}

      <footer className="st-card sticky bottom-3 flex flex-wrap items-center gap-2 px-3.5 py-2.5">
        <span data-testid="pipeline-gate" className={`st-chip ${gate.checked === 0 ? 'st-soft' : gate.findings.length ? 'st-soft' : 'st-on'}`}>
          {gate.checked === 0
            ? 'chưa kiểm tra'
            : gate.findings.length
              ? `${gate.checked} kiểm tra · ${gate.findings.length} vấn đề`
              : `${gate.checked} kiểm tra · đạt`}
        </span>
        {gate.findings.map((f) => (
          <span key={f} className="text-xs text-[hsl(var(--destructive))]">
            {f}
          </span>
        ))}
        <button
          type="button"
          data-testid="pipeline-save"
          disabled={saving}
          onClick={save}
          className={`ml-auto ${BTN}`}
        >
          {saving ? 'Đang lưu…' : 'Lưu thiết lập'}
        </button>
        {step < STEPS.length - 1 && (
          <button
            type="button"
            data-testid="pipeline-next"
            disabled={!canNext}
            onClick={async () => {
              await save();
              setStep((s) => s + 1);
            }}
            className={`${BTN} st-primary`}
          >
            Tiếp
          </button>
        )}
      </footer>
    </div>
  );
}

type Patch = <K extends keyof PipelineConfig>(k: K, v: Partial<PipelineConfig[K]>) => void;
type Report = (g: { checked: number; findings: string[] }) => void;

/** 1 · Nguồn — the market's feeds, plus anything the owner pastes, fetch-tested first. */
function SourcesStep({
  market,
  cfg,
  patch,
  report,
}: {
  market: MarketRow;
  cfg: PipelineConfig;
  patch: Patch;
  report: Report;
}) {
  const [feeds, setFeeds] = useState<Feed[] | null>(null);
  const [paste, setPaste] = useState('');
  const [test, setTest] = useState<{ items?: { title: string }[]; error?: string; busy?: boolean } | null>(null);
  const [ready, setReady] = useState<{ name: string; url: string; feedType: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/feeds?pageId=${market.id}`);
    const b = (await res.json()) as { feeds?: Feed[] };
    setFeeds(b.feeds ?? []);
  }, [market.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const on = (feeds ?? []).filter((f) => f.enabled);
  useEffect(() => {
    if (feeds === null) return;
    report({
      checked: 1,
      findings: on.length === 0 ? ['Chưa bật nguồn nào — dây chuyền sẽ không có gì để đọc.'] : [],
    });
  }, [feeds, on.length, report]);

  const target = asFeed(paste);

  async function runTest() {
    if (!target) return;
    setTest({ busy: true });
    if (target.kind !== 'rss') {
      setTest({ error: `${target.note}: chưa nối. Thêm token rồi quay lại — nguồn vẫn được liệt kê ở đây.` });
      return;
    }
    // A site, not a feed: ask the crawler's own discovery what to subscribe to. It is the
    // same call the crawl's self-heal makes when a feed starts failing.
    let url = target.url;
    let feedType = 'rss';
    try {
      const d = await fetch('/api/feeds/discover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const found = ((await d.json()) as { feeds?: { url: string; feedType?: string }[] }).feeds ?? [];
      if (found[0]) {
        url = found[0].url;
        feedType = found[0].feedType ?? 'rss';
      }
    } catch {
      /* discovery is a convenience; the pasted URL may already be a feed */
    }

    const res = await fetch('/api/studio/sources/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'rss', config: { url, feedType } }),
    });
    const b = (await res.json()) as { items?: { title: string }[]; error?: string };
    if (!res.ok || !b.items?.length) {
      setTest({ error: b.error ?? 'Nguồn không trả về bài nào.' });
      setReady(null);
      return;
    }
    setTest({ items: b.items });
    setReady({ name: new URL(url).hostname.replace(/^www\./, ''), url, feedType });
  }

  async function saveFeed() {
    if (!ready) return;
    await fetch('/api/feeds', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pageId: market.id, ...ready }),
    });
    setPaste('');
    setTest(null);
    setReady(null);
    await load();
  }

  async function toggle(f: Feed) {
    // Optimistic: the box moves under the cursor, then the round trip confirms it. A
    // controlled checkbox that waits for the server snaps back to its old state for as long
    // as the PATCH takes, which reads as "the click did nothing".
    const next = !f.enabled;
    setFeeds((cur) => (cur ?? []).map((x) => (x.id === f.id ? { ...x, enabled: next } : x)));
    const res = await fetch('/api/feeds', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: f.id, enabled: next }),
    }).catch(() => null);
    // Reload either way: on success it confirms, on failure it puts the box back where the
    // database says it is rather than leaving a lie on screen.
    if (!res?.ok) await load();
  }

  return (
    <section className="flex flex-col gap-3">
      <div className={CARD}>
        <h2 className="mb-2 text-sm font-semibold">Nguồn của {market.name}</h2>
        {feeds === null ? (
          <p className={CAPS}>đang tải…</p>
        ) : feeds.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có nguồn nào. Dán một cái vào ô dưới.</p>
        ) : (
          <ul data-testid="feed-list" className="flex flex-col gap-1">
            {feeds.map((f) => (
              <li key={f.id} data-testid="feed-row" className="flex flex-wrap items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={f.enabled}
                  data-testid={`feed-on-${f.id}`}
                  onChange={() => void toggle(f)}
                />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className={CAPS}>{f.feedType}</span>
                <label className={CAPS}>
                  trọng số
                  <input
                    type="number"
                    min={0}
                    max={5}
                    step={0.5}
                    data-testid={`feed-weight-${f.id}`}
                    value={cfg.order.sourceWeights[f.name] ?? 1}
                    onChange={(e) =>
                      patch('order', {
                        sourceWeights: { ...cfg.order.sourceWeights, [f.name]: Number(e.target.value) },
                      })
                    }
                    className="st-field ml-1 w-14 px-1 py-0.5 text-xs"
                  />
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={CARD}>
        <h2 className="mb-2 text-sm font-semibold">Thêm nguồn</h2>
        <input
          value={paste}
          data-testid="src-paste"
          onChange={(e) => {
            setPaste(e.target.value);
            setTest(null);
            setReady(null);
          }}
          placeholder="Dán RSS · trang tin · subreddit · trang Facebook · tài khoản Instagram…"
          className={FIELD}
        />
        <p data-testid="src-detected" className={`mt-1 ${CAPS}`}>
          {target ? `sẽ lưu như: ${SOURCE_LABELS[target.kind]}` : 'chưa nhận ra nguồn'}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" data-testid="src-test" disabled={!target} onClick={runTest} className={`${BTN}`}>
            Thử lấy bài
          </button>
          <button
            type="button"
            data-testid="src-save"
            disabled={!ready}
            onClick={saveFeed}
            className={`${BTN} st-primary`}
          >
            Lưu nguồn
          </button>
        </div>
        {test?.error && (
          <p data-testid="src-error" className="mt-2 text-sm text-[hsl(var(--destructive))]">
            {test.error}
          </p>
        )}
        {test?.items && (
          <ul data-testid="src-items" className="mt-2 flex flex-col gap-1 text-sm">
            {test.items.map((i) => (
              <li key={i.title} className="truncate rounded-md bg-secondary px-2 py-1">
                {i.title}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** 2 · Lọc & xếp — boosts only. There is no gate here to configure, and that is measured. */
function OrderStep({
  market,
  cfg,
  patch,
  report,
}: {
  market: MarketRow;
  cfg: PipelineConfig;
  patch: Patch;
  report: Report;
}) {
  const [queue, setQueue] = useState<{ rows: any[]; total: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/studio/pipeline/${market.id}/queue?order=${encodeURIComponent(JSON.stringify(cfg.order))}`,
        );
        const b = (await res.json()) as { rows?: any[]; total?: number };
        if (live) setQueue({ rows: b.rows ?? [], total: b.total ?? 0 });
      } finally {
        if (live) setBusy(false);
      }
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [market.id, cfg.order]);

  useEffect(() => {
    if (!queue) return;
    report({
      checked: 1,
      findings: queue.total === 0 ? ['Hàng đợi trống — chạy thu thập trước khi xếp.'] : [],
    });
  }, [queue, report]);

  const boost = (key: 'topicBoost' | 'weightBoost' | 'recencyBoost' | 'relevanceBoost', label: string) => (
    <label key={key} className={CAPS}>
      {label}
      <input
        type="range"
        min={0}
        max={5}
        step={0.5}
        data-testid={`ord-${key}`}
        value={cfg.order[key]}
        onChange={(e) => patch('order', { [key]: Number(e.target.value) } as never)}
        className="ml-1 align-middle"
      />
      <span className="ml-1">{cfg.order[key]}</span>
    </label>
  );

  return (
    <section className="flex flex-col gap-3">
      <div className={CARD}>
        <p className="text-[13px] leading-snug text-muted-foreground">
          Đây là <strong>xếp hạng</strong>, không phải lọc. Mọi bài đã thu thập đều còn trong
          hàng đợi — các thanh dưới chỉ đẩy bài lên hay xuống. Lọc cứng theo từ khoá và ngưỡng
          điểm đã đo và <strong>không dùng</strong>: chúng bỏ mất 35–58% nguồn thực sự đăng được.
        </p>
      </div>

      <div className={CARD}>
        <h2 className="mb-2 text-sm font-semibold">Chủ đề được đẩy lên</h2>
        <div className="flex flex-wrap gap-1.5">
          {TOPICS.map((t) => {
            const on = cfg.order.topics.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                data-testid={`ord-topic-${t.id}`}
                aria-pressed={on}
                onClick={() =>
                  patch('order', {
                    topics: on ? cfg.order.topics.filter((x) => x !== t.id) : [...cfg.order.topics, t.id],
                  })
                }
                className={`${BTN} ${on ? 'st-primary' : 'st-ghost'}`}
              >
                {t.vi}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {boost('topicBoost', 'chủ đề')}
          {boost('weightBoost', 'nguồn')}
          {boost('recencyBoost', 'mới')}
          {boost('relevanceBoost', 'điểm lọc')}
        </div>
      </div>

      <div className={CARD}>
        <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold">
          Hàng đợi lần thu thập gần nhất
          <span className={CAPS}>{busy ? 'đang xếp lại…' : `${queue?.total ?? 0} bài`}</span>
        </h2>
        <ol data-testid="queue-list" className={`flex flex-col gap-1 ${busy ? 'opacity-50' : ''}`}>
          {(queue?.rows ?? []).slice(0, 12).map((r, i) => (
            <li key={r.id} data-testid="queue-row" className="flex flex-wrap items-baseline gap-2 text-sm">
              <span className={`${CAPS} w-5`}>{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{r.title}</span>
              <span className={CAPS}>{r.source}</span>
              <span className="st-num text-[12px]">{r.score}</span>
              <span data-testid="queue-parts" className={CAPS}>
                {r.parts.map((p: any) => `${p.label} ${p.value}`).join(' · ')}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** 3 · Đầu ra — the post shape, previewed on three real rows, each with its compliance chip. */
function OutputStep({
  market,
  cfg,
  patch,
  report,
}: {
  market: MarketRow;
  cfg: PipelineConfig;
  patch: Patch;
  report: Report;
}) {
  const [drafts, setDrafts] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const shape = outputPrompt(cfg.output);

  useEffect(() => {
    // Previewing here spends, so it is a button and not a debounce. Everything else on this
    // screen still updates the prompt below live.
    if (!drafts) {
      report({ checked: 0, findings: [] });
      return;
    }
    const bad = drafts.filter((d) => d.error || d.gate.checked === 0 || d.gate.findings.length);
    report({
      checked: drafts.length,
      findings: bad.map((d) => `${d.title || d.id}: ${d.error ?? d.gate.findings.join('; ') ?? 'cổng chưa chạy'}`),
    });
  }, [drafts, report]);

  async function preview() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/studio/pipeline/${market.id}/drafts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ output: cfg.output, order: cfg.order }),
      });
      const b = (await res.json()) as { drafts?: any[]; error?: string };
      if (!res.ok) {
        setError(b.error ?? `HTTP ${res.status}`);
        return;
      }
      setDrafts(b.drafts ?? []);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className={CARD}>
        <h2 className="mb-2 text-sm font-semibold">Dạng bài</h2>
        <div className="flex flex-wrap gap-1.5">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              title={f.hint}
              data-testid={`out-format-${f.id}`}
              aria-pressed={cfg.output.format === f.id}
              onClick={() => {
                patch('output', { format: f.id });
                setDrafts(null);
              }}
              className={`${BTN} ${cfg.output.format === f.id ? 'st-primary' : 'st-ghost'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className={CAPS}>
            độ dài
            <select
              data-testid="out-length"
              value={cfg.output.length}
              onChange={(e) => {
                patch('output', { length: e.target.value as never });
                setDrafts(null);
              }}
              className="st-field ml-1 w-auto px-1 py-0.5 text-xs font-semibold"
            >
              {Object.entries(LENGTH_BANDS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label} · {v.hint}
                </option>
              ))}
            </select>
          </label>
          <label className={CAPS}>
            tiêu đề
            <select
              data-testid="out-title"
              value={cfg.output.titleStyle}
              onChange={(e) => {
                patch('output', { titleStyle: e.target.value as never });
                setDrafts(null);
              }}
              className="st-field ml-1 w-auto px-1 py-0.5 text-xs font-semibold"
            >
              {Object.entries(TITLE_STYLES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className={`mt-3 block ${CAPS}`}>
          giọng
          <input
            data-testid="out-tone"
            value={cfg.output.tone}
            onChange={(e) => {
              patch('output', { tone: e.target.value });
              setDrafts(null);
            }}
            className={`${FIELD} mt-1 font-sans`}
          />
        </label>
        <label className={`mt-2 block ${CAPS}`}>
          câu kết kêu gọi (để trống nếu không cần)
          <input
            data-testid="out-cta"
            value={cfg.output.cta}
            onChange={(e) => {
              patch('output', { cta: e.target.value });
              setDrafts(null);
            }}
            className={`${FIELD} mt-1 font-sans`}
          />
        </label>
      </div>

      <div className={CARD}>
        <button type="button" data-testid="out-prompt-toggle" onClick={() => setShowPrompt((v) => !v)} className={CAPS}>
          {showPrompt ? '▾' : '▸'} câu lệnh sẽ gửi cho dây chuyền
        </button>
        {showPrompt && (
          <pre data-testid="out-prompt" className="mt-2 whitespace-pre-wrap text-[12px] leading-snug">
            {shape}
          </pre>
        )}
        <p className={`mt-2 ${CAPS}`}>
          dẫn nguồn và quy tắc Meta luôn bật — không tắt được
        </p>
      </div>

      <div className={CARD}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Xem thử ba bài</h2>
          <button type="button" data-testid="out-preview" disabled={busy} onClick={preview} className={`ml-auto ${BTN}`}>
            {busy ? 'Đang viết…' : 'Viết thử 3 bài'}
          </button>
        </div>
        {error && (
          <p data-testid="out-error" className="mt-2 text-sm text-[hsl(var(--destructive))]">
            {error}
          </p>
        )}
        {drafts && (
          <ul data-testid="out-drafts" className="mt-2 grid gap-2 md:grid-cols-3">
            {drafts.map((d) => (
              <li key={d.id} data-testid="out-draft" className="st-quiet p-2">
                <p className="text-xs font-semibold">{d.title}</p>
                <p className="mt-1 line-clamp-6 text-[11px] leading-snug text-muted-foreground">{d.text || d.error}</p>
                <p
                  data-testid="out-chip"
                  className={`mt-1 ${CAPS} ${d.gate.findings.length || d.error ? 'text-[hsl(var(--destructive))]' : ''}`}
                >
                  {d.error
                    ? 'lỗi'
                    : d.gate.checked === 0
                      ? 'cổng chưa chạy'
                      : d.gate.findings.length
                        ? `${d.gate.findings.length} vấn đề`
                        : `${d.gate.checked} quy tắc · đạt`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** 4 · Ảnh & video — which kit draws this market, and what the pipeline renders per post. */
function MediaStep({
  kits,
  cfg,
  patch,
  report,
}: {
  kits: KitOpt[];
  cfg: PipelineConfig;
  patch: Patch;
  report: Report;
}) {
  useEffect(() => {
    report({
      checked: 1,
      findings: cfg.media.renderCard && !cfg.media.kitId ? ['Đang dựng ảnh nhưng chưa chọn bộ nhận diện.'] : [],
    });
  }, [cfg.media, report]);

  return (
    <section className="flex flex-col gap-3">
      <div className={CARD}>
        <label className={CAPS}>
          bộ nhận diện
          <select
            data-testid="media-kit"
            value={cfg.media.kitId ?? ''}
            onChange={(e) => patch('media', { kitId: e.target.value || null })}
            className="st-field ml-1 w-auto px-1 py-0.5 text-xs font-semibold"
          >
            <option value="">— chưa chọn —</option>
            {kits.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-3 flex flex-col gap-1.5 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              data-testid="media-card"
              checked={cfg.media.renderCard}
              onChange={(e) => patch('media', { renderCard: e.target.checked })}
            />
            Dựng ảnh thẻ cho mỗi bài
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              data-testid="media-reel"
              checked={cfg.media.renderReel}
              onChange={(e) => patch('media', { renderReel: e.target.checked })}
            />
            Dựng video cho mỗi bài
          </label>
          <p className={CAPS}>
            hôm nay dây chuyền dựng ảnh, không dựng video — video làm theo yêu cầu từ kho bài
          </p>
        </div>
      </div>
    </section>
  );
}

/** 5 · Lịch — run it now, see when it runs by itself, watch Gold arrive. */
function ScheduleStep({
  market,
  cfg,
  schedule,
  outputGate,
  report,
}: {
  market: MarketRow;
  cfg: PipelineConfig;
  schedule: string;
  /** Step 3's gate. A shape nobody has previewed is a shape nobody has checked. */
  outputGate: { checked: number; findings: string[] };
  report: Report;
}) {
  const shapeChecked = outputGate.checked > 0 && outputGate.findings.length === 0;
  const [state, setState] = useState<{ running: boolean; since: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const read = async () => {
      try {
        const r = await fetch('/api/pipeline/run');
        if (live) setState(await r.json());
      } catch {
        /* the pipeline being unreachable is not a reason to break the screen */
      }
    };
    void read();
    const t = setInterval(read, 10_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    report({ checked: 1, findings: [] });
  }, [report]);

  async function runNow() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch('/api/pipeline/run', { method: 'POST' });
      const b = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) setErr(b.error ?? `HTTP ${r.status}`);
      else setState({ running: true, since: new Date().toISOString() });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className={CARD}>
        <h2 className="mb-1 text-sm font-semibold">Lịch chạy</h2>
        <p data-testid="pipeline-schedule" className="text-sm">
          {schedule}
        </p>
        <p className={`mt-1 ${CAPS}`}>
          giờ chạy nằm trong deploy/com.immigration.pipeline.plist — sửa ở đó rồi nạp lại launchd
        </p>
      </div>

      <div className={CARD}>
        <div className="flex flex-wrap items-center gap-2">
          <span data-testid="run-state" className={CAPS}>
            {state === null
              ? '…'
              : state.running
                ? `đang chạy · từ ${new Date(state.since ?? Date.now()).toLocaleTimeString('vi-VN')}`
                : 'không chạy'}
          </span>
          <button
            type="button"
            data-testid="pipeline-run-now"
            disabled={busy || !shapeChecked || Boolean(state?.running)}
            onClick={runNow}
            className={`ml-auto ${BTN} st-primary`}
          >
            {busy ? 'Đang gọi…' : 'Chạy ngay'}
          </button>
        </div>
        {!shapeChecked && (
          <p data-testid="run-blocked" className={`mt-2 ${CAPS}`}>
            {outputGate.findings.length
              ? `dạng bài chưa đạt: ${outputGate.findings.length} vấn đề — sửa ở bước Đầu ra`
              : 'chưa viết thử ba bài ở bước Đầu ra — chạy thử trước khi cho dây chuyền chạy thật'}
          </p>
        )}
        {err && <p className="mt-2 text-sm text-[hsl(var(--destructive))]">{err}</p>}
        <p className={`mt-2 ${CAPS}`}>
          một lượt chạy quét mọi thị trường và ghi vào kho bài; kết quả hiện ở trang Tạo mới
        </p>
      </div>

      <div className={CARD}>
        <label className={CAPS}>
          ghi chú cho chính bạn
          <textarea
            data-testid="schedule-note"
            defaultValue={cfg.scheduleNote}
            rows={2}
            className={`${FIELD} mt-1 resize-y font-sans`}
          />
        </label>
        <p className={`mt-1 ${CAPS}`}>thị trường: {market.name}</p>
      </div>
    </section>
  );
}
