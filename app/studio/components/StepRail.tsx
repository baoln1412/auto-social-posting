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

const STATE_CLASS: Record<RailItem['state'], string> = {
  done: 'bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]',
  current: 'bg-primary text-primary-foreground',
  error: 'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]',
  future: 'bg-secondary text-muted-foreground',
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
            className={`pen-line-sm flex flex-col items-start rounded-md px-2.5 py-1 text-left ${STATE_CLASS[s.state]} ${
              onGo ? '' : 'cursor-default'
            }`}
          >
            <span className="text-xs font-semibold">
              {i + 1}. {s.label}
            </span>
            {s.note && (
              <span className="font-mono text-[10px] uppercase tracking-wider opacity-80">
                {s.note}
              </span>
            )}
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
