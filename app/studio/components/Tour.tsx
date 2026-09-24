'use client';

/**
 * The first-run tour: one scrim with a hole cut in it over the thing being named.
 *
 * No library. driver.js was the fallback and would have been the fifth dependency for 200 lines;
 * joyride and shepherd were rejected on size and licence. What is left is one `<svg>` with an
 * `evenodd` path — the viewport minus a rounded rect — and a card placed by `placeTooltip`.
 *
 * Shown once per browser per screen (`localStorage`), because "have I seen this" is a per-viewer
 * convenience and nothing else needs to know.
 */
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { X } from 'lucide-react';
import { holeOf, placeTooltip, roundRect, type Box } from '@/lib/studio/tour/place';

export interface TourStep {
  target: string;
  title: string;
  body: string;
}

// useLayoutEffect on the server is a warning and nothing else; this is the documented dodge.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const CARD_W = 300;
/** Measured after mount; this is only the guess used for the very first paint. */
const CARD_H = 190;
const RADIUS = 14;

export function Tour({ id, steps }: { id: string; steps: TourStep[] }) {
  const [i, setI] = useState<number | null>(null);
  const [live, setLive] = useState<TourStep[]>([]);
  const [box, setBox] = useState<Box | null>(null);
  const [card, setCard] = useState<HTMLDivElement | null>(null);
  const key = `studio.tour.${id}`;

  // A step whose target is not on this screen is not a step. Suggestions and recent results are
  // both empty on a fresh install, and a spotlight on nothing is worse than one step fewer.
  //
  // But "not on this screen" and "not there yet" look identical at mount: the library's cards
  // arrive from a fetch, and filtering on the first tick dropped that step every time. So hold
  // out for the full set, and settle for whatever has arrived by 1.2s.
  useEffect(() => {
    let settled = false;
    const attempt = (last: boolean) => {
      if (settled) return;
      const here = steps.filter((s) => document.querySelector(s.target));
      if (!last && here.length < steps.length) return;
      settled = true;
      setLive(here);
      if (!here.length) return;
      try {
        if (!localStorage.getItem(key)) setI(0);
      } catch {
        /* private window: skip the tour rather than break the screen */
      }
    };
    attempt(false);
    const timers = [250, 600, 1200].map((ms, n) => window.setTimeout(() => attempt(n === 2), ms));
    return () => timers.forEach(clearTimeout);
  }, [key, steps]);

  const step = i === null ? null : live[i];

  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.target);
    if (!el) return;
    const r = el.getBoundingClientRect();
    setBox({ left: r.left, top: r.top, width: r.width, height: r.height });
  }, [step]);

  // Layout, not effect: the eyebrow says "3/8" the instant the step changes, so a hole measured
  // a frame later is a frame of the card naming one thing and the ring circling another. An
  // instant scrollIntoView has already moved the page by the time it returns, so this reads the
  // rect the target will have when it paints.
  useIsomorphicLayoutEffect(() => {
    if (!step) return;
    const el = document.querySelector(step.target);
    el?.scrollIntoView({ block: 'center', behavior: 'auto' });
    measure();
    // And again next frame, for a browser that honours `scroll-behavior: smooth` anyway.
    const f = requestAnimationFrame(measure);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(f);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [step, measure]);

  const close = useCallback(() => {
    try {
      localStorage.setItem(key, '1');
    } catch {
      /* nothing to do — the tour just shows again next time */
    }
    setI(null);
  }, [key]);

  useEffect(() => {
    if (i === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [i, close]);

  if (i === null || !step || !box) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const hole = holeOf(box);
  const ring = roundRect(hole, RADIUS);
  const at = placeTooltip(box, vw, vh, CARD_W, card?.offsetHeight ?? CARD_H);
  const last = i + 1 === live.length;

  return (
    <>
      <svg
        data-testid="tour-scrim"
        className="pointer-events-none fixed inset-0 z-[60]"
        width={vw}
        height={vh}
        aria-hidden
      >
        <path fillRule="evenodd" fill="rgba(31,29,24,.6)" d={`M0,0H${vw}V${vh}H0Z ${ring}`} />
        <path data-testid="tour-ring" d={ring} fill="none" stroke="hsl(var(--primary))" strokeWidth={3} />
      </svg>

      <div
        ref={setCard}
        data-testid="tour"
        data-tour-target={step.target}
        role="dialog"
        aria-label={step.title}
        style={{ left: at.left, top: at.top, width: CARD_W }}
        className="st-card fixed z-[61] flex flex-col gap-1.5 px-4 py-3.5"
      >
        <button
          type="button"
          onClick={close}
          aria-label="Đóng"
          className="absolute right-2.5 top-2.5 text-muted-foreground"
        >
          <X size={15} strokeWidth={2.25} />
        </button>
        <span className="st-eyebrow text-primary">
          Tổng quan Studio · <span className="st-num">{i + 1}/{live.length}</span>
        </span>
        <h3 className="text-[18px] font-bold leading-tight" style={{ fontFamily: "'Baloo 2', system-ui, sans-serif" }}>
          {step.title}
        </h3>
        <p className="text-[13.5px] leading-snug text-muted-foreground">{step.body}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <button type="button" data-testid="tour-skip" onClick={close} className="st-btn st-sm st-ghost">
            Bỏ qua
          </button>
          {i > 0 && (
            <button
              type="button"
              data-testid="tour-back"
              onClick={() => setI(i - 1)}
              className="st-btn st-sm st-ghost"
            >
              Lùi
            </button>
          )}
          <span className="flex-1" />
          <span data-testid="tour-dots" className="flex gap-1">
            {live.map((s, n) => (
              <i
                key={s.target}
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: n === i ? 'hsl(var(--primary))' : 'hsl(var(--border))' }}
              />
            ))}
          </span>
          <button
            type="button"
            data-testid="tour-next"
            onClick={() => (last ? close() : setI(i + 1))}
            className="st-btn st-sm st-primary"
          >
            {last ? 'Xong' : 'Tiếp tục'}
          </button>
        </div>
      </div>
    </>
  );
}
