/**
 * What fills the middle of the frame once the inset has gone.
 *
 * Three tenants, one band, never two at once: the big number (numbers.ts), an attributed
 * quote, and a causal chain. Measured off ainius-2.mp4 — what makes that reel read as
 * authored is not per-scene photography, it is that the middle of the screen keeps
 * changing what KIND of object it holds while one photo stays underneath.
 *
 * Both new tenants earn their place by not repeating the karaoke band, which already
 * carries every word of the narration:
 *
 *   - A quote adds the ATTRIBUTION. The caption reads the sentence; the card says who said
 *     it, held still while the words scroll past. A quotation with no speaker is a scare
 *     quote, and this refuses to lift one — that rule is the whole difference between a
 *     pull-quote and the caption set twice.
 *   - A chain adds the SHAPE. "A dẫn đến B, khiến C" is one sentence to the voice and three
 *     boxes to the eye, and the eye gets the causality in one glance.
 *
 * Conservative on purpose. Every gate below returns null rather than show a clumsy box for
 * two seconds, which is the same discipline numbers.ts uses for a bare `3`. A heuristic
 * that fires on a third of scripts and is always right beats a model call that fires
 * always and is sometimes embarrassing — and it costs nothing and touches no prompt.
 *
 * Pure: no fs, no network. The renderers live in overlay.ts.
 */
import { pickNumberIn, sceneWindow, type BigNumber } from './numbers';

export interface Quote {
  /** The quoted words, without their marks. */
  text: string;
  /** Who said them. Never empty — an unattributed quote is not lifted at all. */
  who: string;
}

export type MiddleKind = 'number' | 'quote' | 'flow';

export interface MiddleFill {
  kind: MiddleKind;
  /** The scene whose line says it. */
  index: number;
  number?: BigNumber;
  quote?: Quote;
  flow?: string[];
}

export interface PlacedFill extends MiddleFill {
  from: number;
  until: number;
}

/* ---------------------------------------------------------------- the quote */

/** Verbs that make the next thing in quotes speech rather than emphasis. */
const SAY = '(?:nói|cho biết|khẳng định|tuyên bố|nhấn mạnh|chia sẻ|cảnh báo|phát biểu|thừa nhận|kêu gọi|cho rằng|viết)';
/** Long enough to be a sentence, short enough to set at 50px and still fit the band. */
const QUOTE_MIN = 20;
const QUOTE_MAX = 140;
const WHO = '[^.!?,;"“”]{3,60}?';
const MARK = '["“«]';
const ENDMARK = '["”»]';
const BODY = `[^"”»]{${QUOTE_MIN},${QUOTE_MAX}}`;

/** `Bộ trưởng cho biết: "..."` — the speaker leads. */
const SAID_BEFORE = new RegExp(`(${WHO})\\s+${SAY}\\s*[:,]?\\s*${MARK}(${BODY})${ENDMARK}`, 'iu');
/** `"...", đại diện hiệp hội nói.` — the speaker trails. */
const SAID_AFTER = new RegExp(`${MARK}(${BODY})${ENDMARK}[,\\s]+(${WHO})\\s+${SAY}`, 'iu');

/** Words that start a clause without naming anybody. */
const NOT_A_SPEAKER = /^(?:và|nhưng|rồi|thì|cũng|khi|nếu|mà|vì|do|theo đó|tuy nhiên)\b/i;

function speaker(raw: string): string | null {
  const who = raw.replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, '');
  if (who.length < 3 || who.length > 60 || NOT_A_SPEAKER.test(who)) return null;
  return who;
}

function quoteIn(text: string): Quote | null {
  const before = SAID_BEFORE.exec(text);
  if (before) {
    const who = speaker(before[1]);
    if (who) return { text: before[2].trim(), who };
  }
  const after = SAID_AFTER.exec(text);
  if (after) {
    const who = speaker(after[2]);
    if (who) return { text: after[1].trim(), who };
  }
  return null;
}

/**
 * The reel's pull-quote: the first attributed quote in reading order.
 *
 * First and not "best", unlike the number — a figure has a magnitude to compare, two
 * quotes do not, and the one a story leads with is the one it chose to lead with.
 */
export function pickQuote(texts: string[], skip?: Set<number>): { index: number; quote: Quote } | null {
  for (let index = 0; index < texts.length; index += 1) {
    if (skip?.has(index)) continue;
    const quote = quoteIn(texts[index] ?? '');
    if (quote) return { index, quote };
  }
  return null;
}

/* ----------------------------------------------------------------- the flow */

/**
 * Connectives that can only mean cause.
 *
 * `nên` is deliberately absent: it is "therefore" and "should" in the same three letters,
 * and splitting "bạn nên kiểm tra hồ sơ" produces a diagram of nothing. `buộc` is out for
 * the same reason — "forces" and "ties".
 */
const CAUSE = /\s*(?:dẫn đến|dẫn tới|kéo theo|kết quả là|làm cho|gây ra|khiến|do đó|vì vậy|vì thế|từ đó)\s*/giu;

/** A box holds a phrase. Below this it is a fragment, above it a paragraph. */
const BOX_MIN = 6;
const BOX_MAX = 40;
/** Leading words that carry no meaning once the connective is the arrow. */
const FILLER = /^(?:và|rồi|thì|cũng|đó là)\s+/i;

function boxLabel(raw: string): string | null {
  const s = raw
    .replace(/^[\s,;:.–—-]+|[\s,;:.–—-]+$/g, '')
    .replace(FILLER, '')
    .trim();
  if (s.length < BOX_MIN || s.length > BOX_MAX) return null;
  // Two clauses in one box is not a box.
  if (/[.;:]/.test(s)) return null;
  return s;
}

function chainIn(text: string): string[] | null {
  const parts = text.split(CAUSE);
  if (parts.length < 2) return null;
  const steps: string[] = [];
  for (const p of parts.slice(0, 3)) {
    const label = boxLabel(p);
    if (!label) return null;
    steps.push(label);
  }
  return steps.length >= 2 ? steps : null;
}

/**
 * The reel's causal chain: the crispest one in the script.
 *
 * Three boxes beat two — a chain is more of a diagram the longer it is — and among equals
 * the one with less text in the boxes, because a box you read in one glance is the point.
 */
export function pickFlow(texts: string[], skip?: Set<number>): { index: number; steps: string[] } | null {
  let best: { index: number; steps: string[] } | null = null;
  let bestScore = 0;
  texts.forEach((t, index) => {
    if (skip?.has(index)) return;
    const steps = chainIn(t ?? '');
    if (!steps) return;
    const score = steps.length * 1000 - steps.join('').length;
    if (score > bestScore) {
      bestScore = score;
      best = { index, steps };
    }
  });
  return best;
}

/* ------------------------------------------------------------ the scheduler */

/**
 * Every tenant the script can supply, each on its own scene.
 *
 * Priority is the order of the returned list: the number first because it is the thing a
 * caption reads worst, then the quote, then the chain. Each is handed the scenes the ones
 * before it took, so no scene carries two objects and the still preview can show `[0]`
 * knowing it is the one the reel leans on.
 */
export function middleFills(texts: string[]): MiddleFill[] {
  const out: MiddleFill[] = [];
  const taken = new Set<number>();

  const num = pickNumberIn(texts);
  if (num) {
    out.push({ kind: 'number', index: num.index, number: num.number });
    taken.add(num.index);
  }
  const q = pickQuote(texts, taken);
  if (q) {
    out.push({ kind: 'quote', index: q.index, quote: q.quote });
    taken.add(q.index);
  }
  const f = pickFlow(texts, taken);
  if (f) out.push({ kind: 'flow', index: f.index, flow: f.steps });

  return out;
}

/**
 * The fills that fit, with the seconds they are up.
 *
 * Sequential, not independent: each window starts no earlier than the last one ended. Two
 * scenes that both finish before the inset leaves would otherwise both be clamped to
 * INSET_SEC and share the screen, which is the one thing this band must never do. A fill
 * the reel has no room left for is dropped rather than squeezed — a figure up for half a
 * second is a glitch, not a card.
 */
export function fillWindows(fills: MiddleFill[], sceneChars: number[], durationSec: number): PlacedFill[] {
  const out: PlacedFill[] = [];
  let floor: number | undefined;
  for (const f of fills) {
    const w = sceneWindow(sceneChars, f.index, durationSec, floor);
    if (!w) continue;
    out.push({ ...f, ...w });
    floor = w.until;
  }
  return out;
}
