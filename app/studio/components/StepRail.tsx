'use client';

/**
 * The rail both step-screen flows share: a run's `Đọc bài → Viết bài → Ảnh → Video → Đăng`,
 * and the pipeline setup's `Nguồn → Lọc & xếp → Đầu ra → Ảnh & video → Lịch`.
 *
 * One component because they are one idea — where am I, what is behind me, what is ahead —
 * and two copies of it would drift the first time either grew a state.
 */

export interface RailItem {
  /** Stable id, used for the testid so a spec can name a step rather than count. */
  id: string;
  label: string;
  state: 'done' | 'current' | 'error' | 'future';
  /** A short line under the label: a price, a gate result, a count. */
  note?: string;
}

/**
 * One accent, not four fills: the current step is the accent card, a finished one keeps the
 * pen line and marks its number, a future one is quiet. Only an error gets a second colour,
 * because an error is the one thing that must not read as "fine".
 */
const STATE_CLASS: Record<RailItem['state'], string> = {
  done: 'border-foreground bg-card shadow-[3px_3px_0_hsl(var(--foreground))]',
  current: 'border-primary bg-sidebar-accent text-sidebar-accent-foreground shadow-[3px_3px_0_hsl(var(--foreground))]',
  error: 'border-[hsl(var(--destructive))] bg-card text-[hsl(var(--destructive))]',
  future: 'border-[var(--st-pen2)] bg-card text-muted-foreground',
};

export function StepRail({
  items,
  onGo,
  testId = 'rail',
}: {
  items: RailItem[];
  /** Omitted makes the rail a read-only indicator. */
  onGo?: (id: string, i: number) => void;
  testId?: string;
}) {
  return (
    <ol data-testid={testId} className="flex flex-wrap items-stretch gap-1.5">
      {items.map((s, i) => (
        <li key={s.id} className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid={`${testId}-${s.id}`}
            data-state={s.state}
            disabled={!onGo}
            onClick={() => onGo?.(s.id, i)}
            className={`flex items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-left ${STATE_CLASS[s.state]} ${
              onGo ? '' : 'cursor-default'
            }`}
          >
            <span
              className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-full border-2 border-foreground text-[11px] ${
                s.state === 'done' || s.state === 'current' ? 'bg-primary text-white' : 'bg-card'
              }`}
              style={{ fontFamily: "'Source Code Pro', monospace" }}
            >
              {s.state === 'done' ? '✓' : i + 1}
            </span>
            <span className="min-w-0">
              <b className="block text-[13px] leading-tight">{s.label}</b>
              {s.note && <small className="block text-[10.5px] opacity-80">{s.note}</small>}
            </span>
          </button>
          {i < items.length - 1 && (
            <span aria-hidden className="text-xs text-muted-foreground">
              →
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
