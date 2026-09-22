/**
 * How long a narration will read for, and how to say it.
 *
 * Import-free on purpose: the run page is a 'use client' component and gates/budget.ts pulls
 * in child_process for ffprobe. Both need the same number, so it lives here and budget.ts
 * imports it — the seam app/lib/videoSteps.ts exists to hold.
 */

/**
 * Measured 2026-09-22: 1,684 characters of Vietnamese narration through edge-tts at
 * rate=+25% rendered to 81.7 seconds. One render, so treat the estimate as an estimate —
 * it is shown with a ~ for that reason.
 */
export const CHARS_PER_SECOND = 20.6;

export function estimateSeconds(chars: number): number {
  return Math.round(chars / CHARS_PER_SECOND);
}

/** m:ss, which is how a video length is read. */
export function mmss(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
