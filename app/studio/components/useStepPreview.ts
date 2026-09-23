'use client';

/**
 * The live preview: every control change asks the server what this step would produce, and
 * the answer replaces the frame.
 *
 * Debounced 400 ms because a slider fires on every pixel and a colour picker on every drag,
 * and the last answer stays on screen while the next is in flight — a preview that blanks
 * between keystrokes is harder to judge than one that lags by a moment. `stale` is what the
 * veil is drawn from.
 */
import { useEffect, useRef, useState } from 'react';
import type { StepName, StepOptions, StepPreview } from '@/lib/studio/steps/types';

export interface LivePreview extends StepPreview {
  hash?: string;
}

const DEBOUNCE_MS = 400;

export function useStepPreview(
  runId: string,
  step: StepName,
  opts: StepOptions,
  initial: LivePreview | null,
): { preview: LivePreview | null; stale: boolean; error: string | null } {
  const [preview, setPreview] = useState<LivePreview | null>(initial);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Serialised, not the object: a new {} every render would refire the effect forever.
  const key = JSON.stringify({ step, opts });
  // The first render already has the server's preview for these options; asking again would
  // be one wasted round trip on every page load.
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setStale(true);
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/studio/runs/${runId}/preview`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ step, opts }),
          signal: abort.signal,
        });
        const body = (await res.json()) as LivePreview & { error?: string };
        if (!res.ok) {
          setError(body.error ?? `HTTP ${res.status}`);
          return;
        }
        setError(null);
        setPreview(body);
      } catch (e) {
        // An aborted request is the next keystroke arriving, not a failure to report.
        if ((e as Error)?.name !== 'AbortError') setError(String(e));
      } finally {
        if (!abort.signal.aborted) setStale(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      abort.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, key]);

  return { preview, stale, error };
}
