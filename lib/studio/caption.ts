/**
 * The caption style the preview draws — the same resolution deploy/caption_style.py does
 * for the render.
 *
 * Two implementations, one table: the presets are read from the single JSON file both sides
 * share, and tests/unit/caption.test.ts imports caption_style.py and requires this to agree
 * with it key for key. That is what keeps a preview from promising a look the renderer will
 * not produce — the day they disagree is a red test, not a surprised owner.
 *
 * Import-free apart from the preset table, so the kit editor and the run page can both call
 * it from the browser.
 */
import { PRESETS } from '@/app/lib/captionPresets';

export interface Outline {
  color: string;
  w: number;
}
export interface Shadow {
  dx: number;
  dy: number;
  color: string;
}
export interface Highlight {
  mode: 'word' | 'block' | 'none';
  color: string;
  bg: string | null;
}
export interface Band {
  on: boolean;
  color: string;
  opacity: number;
  pad: number;
  radius: number;
}
export interface ResolvedCaption {
  preset: string;
  font: string;
  size: number;
  case: 'none' | 'upper';
  color: string;
  outline: Outline;
  shadow: Shadow;
  highlight: Highlight;
  band: Band;
  pos: number;
  wordsPerCue: number;
  maxLines: number;
  [key: string]: unknown;
}

/** caption_style.py's DEFAULTS, value for value. */
export const CAPTION_DEFAULTS: ResolvedCaption = {
  preset: 'classic',
  font: 'BeVietnamPro-Bold',
  size: 64,
  case: 'none',
  color: '#FFFFFF',
  outline: { color: '#000000', w: 7 },
  shadow: { dx: 0, dy: 0, color: '#000000B3' },
  highlight: { mode: 'word', color: '#FFDD00', bg: null },
  band: { on: false, color: '#000000', opacity: 70, pad: 18, radius: 16 },
  pos: 855 / 1920,
  wordsPerCue: 5,
  maxLines: 2,
};

const CLAMPS: Record<string, [number, number]> = {
  size: [24, 160],
  pos: [0, 0.95],
  wordsPerCue: [1, 12],
  maxLines: [1, 4],
};
const BAND_CLAMPS: Record<string, [number, number]> = {
  opacity: [0, 100],
  pad: [0, 60],
  radius: [0, 64],
};
/** `pos` is the only float; the rest go through Python's int(). */
const INTS = new Set(['size', 'wordsPerCue', 'maxLines']);

function isPlain(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/** Nested dicts merge key by key: a preset setting only highlight.color must not wipe mode. */
function deepMerge(
  base: Record<string, unknown>,
  over: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const out = { ...base };
  for (const [k, v] of Object.entries(over ?? {})) {
    out[k] = isPlain(v) && isPlain(out[k]) ? deepMerge(out[k] as Record<string, unknown>, v) : v;
  }
  return out;
}

function clamp(raw: unknown, key: string, lo: number, hi: number, fallback: number): number {
  // Python's int()/float() on a bool, a string or null: anything that is not a finite
  // number falls back rather than reaching the renderer as NaN.
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, INTS.has(key) ? Math.trunc(n) : n));
}

export function resolveCaption(style: Record<string, unknown> | null | undefined): ResolvedCaption {
  const s = style ?? {};
  let name = typeof s.preset === 'string' && s.preset ? s.preset : 'classic';
  let preset = (PRESETS as Record<string, Record<string, unknown>>)[name];
  if (preset === undefined) {
    name = 'classic';
    preset = {};
  }
  const { label: _label, ...fromPreset } = preset;

  const out = deepMerge(
    deepMerge(CAPTION_DEFAULTS as unknown as Record<string, unknown>, fromPreset),
    s,
  ) as unknown as ResolvedCaption;
  out.preset = name;

  for (const [key, [lo, hi]] of Object.entries(CLAMPS)) {
    const fallback = CAPTION_DEFAULTS[key] as number;
    out[key] = clamp(out[key], key, lo, hi, fallback);
  }
  if (out.case !== 'none' && out.case !== 'upper') out.case = 'none';
  if (!isPlain(out.highlight)) out.highlight = { ...CAPTION_DEFAULTS.highlight };
  if (!['word', 'block', 'none'].includes(out.highlight.mode)) out.highlight.mode = 'word';

  const band = isPlain(out.band) ? (out.band as unknown as Band) : { ...CAPTION_DEFAULTS.band };
  band.on = Boolean(band.on);
  for (const [key, [lo, hi]] of Object.entries(BAND_CLAMPS)) {
    const fallback = CAPTION_DEFAULTS.band[key as keyof Band] as number;
    (band as unknown as Record<string, unknown>)[key] = clamp(
      (band as unknown as Record<string, unknown>)[key],
      'size', // integer-valued, like the rest of the band knobs
      lo,
      hi,
      fallback,
    );
  }
  out.band = band;
  return out;
}

/** render_cue's historical line height. */
export function lineHeight(st: ResolvedCaption): number {
  return st.size + 14;
}

export function bandHeight(st: ResolvedCaption): number {
  const h = Math.trunc(lineHeight(st) * st.maxLines + st.size * 0.5);
  return st.band.on ? h + 2 * Math.trunc(st.band.pad) : h;
}

/** Top edge of the band. `pos` anchors its CENTRE, so a size change grows it symmetrically. */
export function capY(st: ResolvedCaption, frameH: number): number {
  const top = Math.trunc(st.pos * frameH - bandHeight(st) / 2);
  return Math.max(0, Math.min(top, frameH - bandHeight(st)));
}
