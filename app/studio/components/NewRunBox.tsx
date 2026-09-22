'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Mode, Overrides } from '@/lib/studio/steps/types';
import { OverrideDrawer, type KitOption } from './OverrideDrawer';
// Declared here, not in the page: a 'use client' module must not import from a server
// file even for a type — see app/lib/videoSteps.ts for why this repo keeps that seam.
export interface ChannelRow {
  id: string;
  name: string;
  kit_id: string | null;
  tier_min: string;
}

// The four run modes of the plan's §4 `mode` column. Slice 1 turns the submit on; until
// then this box only carries the choice.
export const MODES: { id: Mode; label: string }[] = [
  { id: 'read-post', label: 'Đọc bài' },
  { id: 'write-narration', label: 'Viết lời đọc' },
  { id: 'voice-over-media', label: 'Lồng tiếng' },
  { id: 'text-to-reel', label: 'Video dọc' },
];

export function NewRunBox({
  channels,
  kits,
  canSpend,
}: {
  channels: ChannelRow[];
  kits: KitOption[];
  canSpend: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(MODES[0].id);
  const [channel, setChannel] = useState<string>(channels[0]?.id ?? '');
  const [source, setSource] = useState('');
  const [overrides, setOverrides] = useState<Overrides>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/studio/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channelId: channel, mode, itemRef: source.trim() || undefined, overrides }),
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

  // pen-line-static, not card-warm: card-warm lifts on hover, and a box you type into
  // should not move under the cursor.
  return (
    <div className="pen-line-static flex flex-col gap-4 rounded-[var(--radius)] bg-card p-5">
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            data-testid={`mode-${m.id}`}
            aria-pressed={mode === m.id}
            onClick={() => setMode(m.id)}
            className={`pen-line-sm rounded-md px-3 py-1.5 text-xs font-semibold ${
              mode === m.id ? 'bg-primary text-primary-foreground' : 'bg-card'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <textarea
        value={source}
        onChange={(e) => setSource(e.target.value)}
        rows={4}
        placeholder="Dán đường dẫn bài viết / Reddit / Threads, hoặc viết nội dung của bạn…"
        className="pen-line-static w-full resize-none rounded-md bg-card p-3 text-sm outline-none"
      />

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          data-testid="channel-picker"
          className="pen-line-static rounded-md bg-card px-3 py-2 text-sm"
        >
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={busy || !channel}
          onClick={start}
          data-testid="create-run"
          className="pen-line-sm rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? 'Đang tạo…' : 'Bắt đầu'}
        </button>
        <span className="font-mono text-[11px] text-muted-foreground">
          {canSpend ? '$0.00 đến giờ' : 'chế độ xem thử — không tốn phí'}
        </span>
      </div>

      <OverrideDrawer value={overrides} onChange={setOverrides} kits={kits} />

      {err && (
        <p data-testid="new-error" className="text-sm text-[hsl(var(--destructive))]">
          {err}
        </p>
      )}
    </div>
  );
}
