'use client';

import { useState } from 'react';
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
export const MODES = [
  { id: 'read-post', label: 'Đọc bài' },
  { id: 'write-narration', label: 'Viết lời đọc' },
  { id: 'voice-over-media', label: 'Lồng tiếng' },
  { id: 'text-to-reel', label: 'Video dọc' },
] as const;

export function NewRunBox({
  channels,
  canSpend,
}: {
  channels: ChannelRow[];
  canSpend: boolean;
}) {
  const [mode, setMode] = useState<string>(MODES[0].id);
  const [channel, setChannel] = useState<string>(channels[0]?.id ?? '');
  const [source, setSource] = useState('');

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

        {/* ponytail: disabled until slice 1 ships POST /api/studio/runs — a button that
            404s is worse than one that says why. */}
        <button
          type="button"
          disabled
          data-testid="create-run"
          className="pen-line-sm rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          Bắt đầu
        </button>
        <span className="font-mono text-[11px] text-muted-foreground">
          {canSpend ? '$0.00 đến giờ' : 'chế độ xem thử — không tốn phí'}
        </span>
      </div>
    </div>
  );
}
