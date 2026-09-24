'use client';

/**
 * The two doors of the New page.
 *
 * NGUỒN TỰ ĐỘNG is the pipeline this repo already runs — crawl, filter, order, draft, write
 * Gold. MỘT BÀI is one link or one paste, all the way to a reel. There are no "kinds of
 * video" any more: v1 read the reference's `Đọc bài · Viết lời đọc · Lồng tiếng · Video dọc`
 * chips as four modes, when they are that product's step rail. The rail lives on the run
 * page; what varies here is only where the words come from.
 */
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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

const CARD = 'pen-line-static flex flex-col gap-2 rounded-[var(--radius)] bg-card p-3';
const CAPS = 'st-label text-muted-foreground';
const BTN = 'pen-line-sm rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50';

export function NewRunBox({
  channels,
  kits,
  canSpend,
}: {
  channels: ChannelRow[];
  kits: KitOption[];
  canSpend: boolean;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <AutoDoor canRun={canSpend} />
      <SingleDoor channels={channels} kits={kits} canSpend={canSpend} />
    </div>
  );
}

/** Door 1 — the crawler. Thiết lập opens its five screens; Chạy ngay starts a cycle. */
function AutoDoor({ canRun }: { canRun: boolean }) {
  const [state, setState] = useState<{ running: boolean; since: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const read = async () => {
      try {
        const r = await fetch('/api/pipeline/run');
        if (alive) setState(await r.json());
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
  }, []);

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
    <section data-testid="door-auto" className={CARD}>
      <h2 className={CAPS}>Nguồn tự động</h2>
      <p className="text-[13px] leading-snug text-muted-foreground">
        Thu thập từ các nguồn của thị trường → lọc &amp; xếp → dạng bài → duyệt thử ba bài →
        lịch chạy. Kết quả ghi vào kho bài.
      </p>
      <p data-testid="pipeline-state" className={`${CAPS} mt-auto`}>
        {state === null
          ? '…'
          : state.running
            ? `đang chạy · từ ${new Date(state.since ?? Date.now()).toLocaleTimeString('vi-VN')}`
            : 'không chạy'}
      </p>
      {err && <p className="text-xs text-[hsl(var(--destructive))]">{err}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <a
          href="/studio/pipeline"
          data-testid="pipeline-setup"
          className={`${BTN} bg-secondary text-muted-foreground hover:text-foreground`}
        >
          Thiết lập
        </a>
        <button
          type="button"
          data-testid="pipeline-run"
          disabled={busy || !canRun || Boolean(state?.running)}
          onClick={runNow}
          className={`${BTN} bg-primary text-primary-foreground`}
        >
          {busy ? 'Đang gọi…' : 'Chạy ngay'}
        </button>
      </div>
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
    <section data-testid="door-single" className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h2 className={CAPS}>Một bài</h2>
        <button
          type="button"
          data-testid="ov-toggle"
          onClick={() => setDrawer((v) => !v)}
          className={`ml-auto ${CAPS} hover:text-primary`}
        >
          ⚙ tuỳ chỉnh video này{changed > 0 ? ` · ${changed}` : ''}
        </button>
      </div>

      {/* pen-line-static, not card-warm: card-warm lifts on hover, and a box you type into
          should not move under the cursor. */}
      <div className={CARD}>
        <textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          rows={3}
          data-testid="source-box"
          placeholder="Dán link Threads / Reddit / Facebook / Instagram / bài báo, hoặc viết nội dung…"
          className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />

        <p data-testid="detected" className={CAPS}>
          {detected
            ? `nguồn: ${SOURCE_LABELS[detected.kind]}`
            : 'nguồn: theo kênh — để trống thì lấy bài mới nhất của kênh'}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            data-testid="channel-picker"
            className="pen-line-sm rounded-md bg-card px-2 py-1 text-xs font-semibold"
          >
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                Kênh: {c.name}
              </option>
            ))}
          </select>

          <span className={CAPS}>{canSpend ? '$0.00 đến giờ' : 'xem thử · không tốn phí'}</span>

          <button
            type="button"
            disabled={busy || !channel}
            onClick={start}
            data-testid="create-run"
            className={`ml-auto ${BTN} bg-primary text-primary-foreground`}
          >
            {busy ? 'Đang tạo…' : 'Tạo run'}
          </button>
        </div>
      </div>

      {drawer && <OverrideDrawer value={overrides} onChange={setOverrides} kits={kits} open />}

      {err && (
        <p data-testid="new-error" className="text-sm text-[hsl(var(--destructive))]">
          {err}
        </p>
      )}
    </section>
  );
}
