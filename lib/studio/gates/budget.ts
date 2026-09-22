/**
 * The reel gate: is the video inside the kit's length band, and will any caption cue
 * overflow its line budget?
 *
 * Duration is ffprobed off the finished file. Cue width is modelled, not measured —
 * make-reel.py does not report per-cue line counts, so this estimates characters per line
 * from the caption size. ponytail: the model is the ceiling; replace it with a real cue
 * dump if make-reel.py ever prints one.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CHARS_PER_SECOND } from '../estimate';

const run = promisify(execFile);

/**
 * Length bands, as intent levels — "hook only", "trimmed", "the whole post".
 *
 * Measured 2026-09-22 against the lake: 10,244 gold posts, body_text length projected at
 * CHARS_PER_SECOND (lib/studio/estimate.ts — the one real render available, 1,684 chars of
 * Vietnamese through edge-tts at rate=+25%, came out at 81.7s). p05 61s · median 92s · p95 134s.
 *
 * So a whole gold post IS a `long` reel, not an exception to `medium`. `long`'s floor is 45
 * rather than 60 because the measured p05 sits at 61s and this rate rests on a single
 * render: a gate for catching runaway length should not fire on a slightly short post.
 *
 * Crime series are not in scope here at all — market 26ffffde's median body is 13,935 chars,
 * about eleven minutes. Nobody is making that as a reel.
 */
void CHARS_PER_SECOND; // the bands below are derived from it; keep the link visible

export const DURATION_BANDS = {
  short: [12, 35],
  medium: [25, 75],
  long: [45, 200],
} as const;

export type DurationBand = keyof typeof DURATION_BANDS;

export interface BudgetKit {
  durationBand: DurationBand;
  maxLines: number;
  /** Caption font size in px, as deploy/caption_style.py resolves it. */
  size: number;
  wordsPerCue: number;
}

/** The narration split the way the renderer cues it: fixed-size word groups. */
export function cuesFor(narration: string, wordsPerCue: number): string[] {
  const words = narration.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerCue) {
    out.push(words.slice(i, i + wordsPerCue).join(' '));
  }
  return out;
}

const FRAME_W = 1080;

export function budgetFindings(durationSec: number, narration: string, kit: BudgetKit): string[] {
  const findings: string[] = [];
  const [lo, hi] = DURATION_BANDS[kit.durationBand] ?? DURATION_BANDS.long;
  if (durationSec > hi) findings.push(`Video dài ${Math.round(durationSec)}s, quá dải ${lo}–${hi}s.`);
  if (durationSec < lo) findings.push(`Video chỉ ${Math.round(durationSec)}s, ngắn hơn dải ${lo}–${hi}s.`);

  // 0.52em is the average advance width of the caption face at this size — measured off the
  // rendered captions, not the font metrics, which over-count for Vietnamese diacritics.
  const perLine = Math.max(8, Math.floor(FRAME_W / (kit.size * 0.52)));
  const over = cuesFor(narration, kit.wordsPerCue).filter(
    (c) => Math.ceil(c.length / perLine) > kit.maxLines,
  );
  if (over.length) {
    findings.push(`${over.length} câu phụ đề vượt ${kit.maxLines} dòng — ví dụ: "${over[0].slice(0, 48)}…"`);
  }
  return findings;
}

/** Seconds, from the file itself. NaN if ffprobe cannot read it. */
export async function probeDuration(path: string): Promise<number> {
  // ffprobe is a bare name on launchd's PATH; /opt/homebrew/bin is not on it (CLAUDE.md §9).
  const { stdout } = await run(
    '/opt/homebrew/bin/ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
    { env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ''}` } },
  );
  return Number.parseFloat(stdout.trim());
}
