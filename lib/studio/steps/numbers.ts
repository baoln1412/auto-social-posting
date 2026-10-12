/**
 * The big-number zone: one figure from the story, set large enough to be an object.
 *
 * deploy/make-reel.py has listed this as skipped since it was written. It earns its place
 * by NOT repeating the caption: the karaoke band already carries every word of the
 * narration, so setting the narration large again would say the same thing twice. A number
 * is the one thing a scrolling caption reads worst — a viewer hears "sáu phẩy chín hai" and
 * sees it for a quarter of a second inside a moving line.
 *
 * Vietnamese writes thousands with a dot and decimals with a comma, the opposite of
 * English, and carries magnitude in a word — nghìn, triệu, tỷ — rather than in zeros. All
 * three have to survive into the card or the figure means something else entirely.
 *
 * Pure: no fs, no network. The renderer lives in overlay.ts.
 */
import { INSET_SEC } from './filters';

export interface BigNumber {
  /** As written, separators and all. "2.500", "6,92". */
  value: string;
  /** What it counts: "%", "đô la", "triệu đô". Empty when the sentence does not say. */
  unit: string;
}

/** Vietnamese magnitude words, kept with the figure because they ARE the magnitude. */
const SCALE = '(?:nghìn|ngàn|triệu|tỷ|tỉ)';
/** What a figure is OF — enough to label the card, never a whole clause. */
const UNIT = `(?:${SCALE}\\s+)?(?:đô ?la|đô|usd|aud|vnd|đồng|%|người|ngày|tháng|năm|giờ|tấn|pound|kg)`;

/** Units that only become a headline in quantity. */
const COUNTED = /người|ngày|tháng|năm|giờ/i;

const NUM = new RegExp(`(\\d{1,3}(?:\\.\\d{3})+|\\d+(?:,\\d+)?)\\s*(%|${UNIT})?`, 'gi');

/** How much a figure is worth as a headline, so a sentence with several picks one. */
function weigh(raw: string, unit: string): number {
  const n = Number(raw.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return -1;
  // A four-digit number with no unit is a year far more often than a quantity.
  if (!unit && /^(19|20)\d{2}$/.test(raw)) return -1;
  // A bare small integer is "three associations", not a figure anyone needs shown.
  if (!unit && n < 1000) return -1;
  // Money and percentages are headline figures at any size — 6,92 đô la is the whole point
  // of the reference's biggest frame. Things merely counted are not: "3 người" is a detail
  // of a sentence, and blowing it up to a third of the screen says it is the story.
  if (COUNTED.test(unit) && !new RegExp(SCALE).test(unit) && n < 100) return -1;
  const scale = /tỷ|tỉ/.test(unit) ? 1e9 : /triệu/.test(unit) ? 1e6 : /nghìn|ngàn/.test(unit) ? 1e3 : 1;
  return n * scale;
}

/** The one figure worth lifting out of a line, or null when there is none. */
export function pickNumber(text: string): BigNumber | null {
  if (!text) return null;
  let best: BigNumber | null = null;
  let bestWeight = 0;
  for (const m of text.matchAll(NUM)) {
    const value = m[1];
    const unit = (m[2] ?? '').trim();
    const w = weigh(value, unit);
    if (w > bestWeight) {
      bestWeight = w;
      best = { value, unit };
    }
  }
  return best;
}

/**
 * The one figure in a whole reel worth a card, and which line says it.
 *
 * Across lines, not the first hit: a reel that opens "3 hiệp hội cảnh báo" and later says
 * "12.000 đô một tấn" should show the second. One card per reel — two competing figures
 * is a slide deck, and the reference shows exactly one.
 */
export function pickNumberIn(texts: string[]): { index: number; number: BigNumber } | null {
  let best: { index: number; number: BigNumber } | null = null;
  let bestWeight = 0;
  texts.forEach((t, index) => {
    const number = pickNumber(t);
    if (!number) return;
    const w = weigh(number.value, number.unit);
    if (w > bestWeight) {
      bestWeight = w;
      best = { index, number };
    }
  });
  return best;
}

/** The shortest a figure can be up and still be read on a phone. */
const MIN_HOLD = 1.5;

/**
 * When something is on screen: the span of the scene whose line says it.
 *
 * Weighted by characters, the same split sceneBoundaries uses to place the transition
 * sounds, so what is up changes when the narration does. Never before the inset has gone —
 * a card under the inset is a card nobody sees.
 *
 * `floor` is how the middle band stays single-tenant: each fill is scheduled after the one
 * before it, so two scenes that both end inside the inset window cannot both claim
 * INSET_SEC and overlap. Null when the reel has no room left for a readable hold.
 */
export function sceneWindow(
  sceneChars: number[],
  index: number,
  durationSec: number,
  floor: number = INSET_SEC,
): { from: number; until: number } | null {
  const total = sceneChars.reduce((a, b) => a + b, 0);
  if (!total || index < 0 || index >= sceneChars.length || !Number.isFinite(durationSec)) return null;
  const before = sceneChars.slice(0, index).reduce((a, b) => a + b, 0);
  const from = Math.max(floor, (before / total) * durationSec);
  if (from + MIN_HOLD > durationSec) return null;
  const until = Math.min(durationSec, Math.max(from + MIN_HOLD, ((before + sceneChars[index]) / total) * durationSec));
  return until <= from ? null : { from: Number(from.toFixed(2)), until: Number(until.toFixed(2)) };
}
