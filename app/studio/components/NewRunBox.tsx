'use client';

/**
 * The create page's two doors, drawn as the reference draws them (mock-v3/01-create).
 *
 * MỘT BÀI is the one box: paste a link or write, and the bottom bar says what was read
 * (`nguồn: …`), which channel, and what is overridden. NGUỒN TỰ ĐỘNG is the crawler this
 * repo already runs; it is a status strip under the box — a fact about the channel with two
 * actions, not a second form beside the first. There are still no "kinds of video": the
 * five chips above the box are the run page's step rail, drawn idle.
 */
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { List, Rss, Video } from 'lucide-react';
import type { Overrides } from '@/lib/studio/steps/types';
import { SOURCE_LABELS, detectSource } from '@/lib/studio/sources/detect';
import { OverrideDrawer, type KitOption } from './OverrideDrawer';

// Declared here, not in the page: a 'use client' module must not import from a server
// file even for a type — see app/lib/videoSteps.ts for why this repo keeps that seam.
export interface ChannelRow {
  id: string;
  name: string;
  kit_id: string | null;
  tier_min: string;
}

export interface PipelineFacts {
  /** The gold channel's market, or null when the visible tier has none. */
  market: { id: string; name: string } | null;
  /** Read off the launchd plist on the server. */
  schedule: string;
  /** Gold posts with no reel yet — the count the suggestions list is cut from. */
  pending: number;
}

export function NewRunBox({
  channels,
  kits,
  canSpend,
  pipeline,
}: {
  channels: ChannelRow[];
  kits: KitOption[];
  canSpend: boolean;
  pipeline: PipelineFacts;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3.5">
      <SingleDoor channels={channels} kits={kits} canSpend={canSpend} />
      <AutoDoor canRun={canSpend} facts={pipeline} />
    </div>
  );
}

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} giờ trước` : `${Math.round(h / 24)} ngày trước`;
};

/** Door 1 — the crawler as a strip. Thiết lập opens its five screens; Chạy ngay starts a cycle. */
function AutoDoor({ canRun, facts }: { canRun: boolean; facts: PipelineFacts }) {
  const [state, setState] = useState<{ running: boolean; since: string | null } | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const read = async () => {
      try {
        const r = await fetch('/api/pipeline/run');
        if (alive) setState(await r.json());
        if (facts.market) {
          // The old app's own "last run" line, from the same endpoint it reads.
          const a = await fetch(`/api/audit?marketId=${facts.market.id}`);
          const d = (await a.json()) as { lastRunAt?: string | null };
          if (alive) setLast(d.lastRunAt ?? null);
        }
      } catch {
        /* the pipeline being unreachable is not a reason to break the New page */
      }
    };
    read();
    const t = setInterval(read, 20_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [facts.market]);

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

  const stateText =
    state === null
      ? '…'
      : state.running
        ? `đang chạy · từ ${new Date(state.since ?? Date.now()).toLocaleTimeString('vi-VN')}`
        : last
          ? `lần cuối ${ago(last)}`
          : 'không chạy';

  return (
    <section data-testid="door-auto" className="st-quiet flex items-center gap-3 px-3.5 py-2.5">
      <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-lg border-2 border-foreground bg-sidebar-accent text-primary">
        <Rss size={17} strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <b className="block text-sm">Nguồn tự động{facts.market ? ` · ${facts.market.name}` : ''}</b>
        <span className="block text-xs text-muted-foreground">
          <span data-testid="pipeline-schedule">{facts.schedule}</span>{' '}
          <span data-testid="pipeline-state">{stateText}</span>
          {' · '}
          <span className="st-num">{facts.pending}</span> bài mới chưa có video
        </span>
        {err && <span className="block text-xs text-[hsl(var(--destructive))]">{err}</span>}
      </div>
      <a href="/studio/pipeline" data-testid="pipeline-setup" className="st-btn st-sm">
        Thiết lập
      </a>
      <button
        type="button"
        data-testid="pipeline-run"
        disabled={busy || !canRun || Boolean(state?.running)}
        onClick={runNow}
        className="st-btn st-sm st-primary"
      >
        {busy ? 'Đang gọi…' : 'Chạy ngay'}
      </button>
    </section>
  );
}

/** Door 2 — one link, one paste. The link decides the source; the channel decides the look. */
function SingleDoor({
  channels,
  kits,
  canSpend,
}: {
  channels: ChannelRow[];
  kits: KitOption[];
  canSpend: boolean;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState<string>(channels[0]?.id ?? '');
  const [source, setSource] = useState('');
  const [overrides, setOverrides] = useState<Overrides>({});
  const [drawer, setDrawer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Pure and import-free, so the box can say what it read before anything is created — the
  // opposite of v1, which decided the source server-side and never showed the decision.
  const detected = detectSource(source);

  async function start() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/studio/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channelId: channel, itemRef: source.trim() || undefined, overrides }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !body.id) {
        setErr(body.error ?? `HTTP ${res.status}`);
        return;
      }
      router.push(`/studio/runs/${body.id}`);
    } finally {
      setBusy(false);
    }
  }

  const changed = Object.keys(overrides).filter((k) => k !== 'demo').length;

  return (
    <>
      {/* st-card, not card-warm: card-warm lifts on hover, and a box you type into should
          not move under the cursor. */}
      <section data-testid="door-single" className="st-card flex flex-col">
        <textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          rows={3}
          data-testid="source-box"
          placeholder="Dán link Threads / Reddit / Facebook / Instagram / bài báo vào đây, hoặc viết nội dung…"
          className="h-24 w-full resize-none bg-transparent px-[18px] py-4 text-base outline-none placeholder:text-muted-foreground"
        />

        <div data-testid="create-bar" className="flex flex-wrap items-center gap-2 border-t-2 border-border px-3 py-2.5">
          <span className="st-btn st-ghost st-icon text-muted-foreground" title="Bài trong kho">
            <List strokeWidth={2.25} />
          </span>

          <span data-testid="detected" className="st-chip st-soft">
            {detected ? `nguồn: ${SOURCE_LABELS[detected.kind]}` : 'nguồn: theo kênh'}
          </span>

          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            data-testid="channel-picker"
            className="max-w-[200px] truncate rounded-lg border-2 border-foreground bg-card px-2 py-1 text-[13px] font-semibold"
          >
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                Kênh: {c.name}
              </option>
            ))}
          </select>

          {!canSpend && <span className="ml-auto text-xs text-muted-foreground">xem thử · không tốn phí</span>}
          <span className={canSpend ? 'ml-auto' : ''} />

          <button
            type="button"
            data-testid="ov-toggle"
            onClick={() => setDrawer((v) => !v)}
            className="st-btn st-sm"
          >
            {changed > 0 ? (
              <>
                Tuỳ chỉnh · <span className="st-num">{changed}</span>
              </>
            ) : (
              'Tuỳ chỉnh: mặc định'
            )}
          </button>

          <button
            type="button"
            disabled={busy || !channel}
            onClick={start}
            data-testid="create-run"
            aria-label="Tạo run"
            title="Tạo run"
            className="st-btn st-primary st-icon"
          >
            <Video strokeWidth={2.25} />
          </button>
        </div>
      </section>

      {drawer && <OverrideDrawer value={overrides} onChange={setOverrides} kits={kits} open />}

      {err && (
        <p data-testid="new-error" className="text-sm text-[hsl(var(--destructive))]">
          {err}
        </p>
      )}
    </>
  );
}
