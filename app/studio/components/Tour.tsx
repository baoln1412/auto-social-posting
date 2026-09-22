'use client';

/**
 * The first-run tour. Once per browser per screen — `localStorage`, because "have I seen
 * this" is a per-viewer convenience and nothing else needs to know.
 */
import { useEffect, useState } from 'react';

export interface TourStep {
  target: string;
  title: string;
  body: string;
}

export function Tour({ id, steps }: { id: string; steps: TourStep[] }) {
  const [i, setI] = useState<number | null>(null);
  const key = `studio.tour.${id}`;

  useEffect(() => {
    // A blocked or cleared localStorage must not stop the page rendering.
    try {
      if (!localStorage.getItem(key)) setI(0);
    } catch {
      /* private window: skip the tour rather than break the screen */
    }
  }, [key]);

  function close() {
    try {
      localStorage.setItem(key, '1');
    } catch {
      /* nothing to do — the tour just shows again next time */
    }
    setI(null);
  }

  if (i === null || !steps[i]) return null;
  const step = steps[i];

  return (
    <div
      data-testid="tour"
      role="dialog"
      aria-label={step.title}
      className="pen-line-static fixed bottom-6 right-6 z-50 w-80 rounded-[var(--radius)] bg-card p-4"
    >
      <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Tổng quan {i + 1}/{steps.length}
      </div>
      <h3 className="mb-1 text-sm font-semibold">{step.title}</h3>
      <p className="mb-3 text-xs text-muted-foreground">{step.body}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="tour-skip"
          onClick={close}
          className="text-xs text-muted-foreground underline"
        >
          Bỏ qua
        </button>
        <button
          type="button"
          data-testid="tour-back"
          disabled={i === 0}
          onClick={() => setI((n) => (n ?? 0) - 1)}
          className="ml-auto pen-line-sm rounded-md bg-card px-2.5 py-1 text-xs font-semibold disabled:opacity-40"
        >
          Lùi
        </button>
        <button
          type="button"
          data-testid="tour-next"
          onClick={() => (i + 1 < steps.length ? setI(i + 1) : close())}
          className="pen-line-sm rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground"
        >
          {i + 1 < steps.length ? 'Tiếp' : 'Xong'}
        </button>
      </div>
    </div>
  );
}
